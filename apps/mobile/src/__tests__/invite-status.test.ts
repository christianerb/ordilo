import { buildInviteUrl, createFamilyInvite } from "../lib/invites";
import {
  describeInviteDates,
  describeInviteStatus,
  describeInviteTitle,
  getFamilyAccess,
  INVITE_VALIDITY_DAYS,
} from "../lib/family-access";

/**
 * Behavioral tests for the invite-status surface (migration 0083):
 * the optional label threaded into invite creation, the shared invite URL,
 * the extended access-RPC shape, and the German row copy helpers.
 */

const mockGetUser = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock("../lib/supabase", () => ({
  getSupabase: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

jest.mock("../lib/api", () => ({
  getApiUrl: () => "https://ordilo.example",
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("buildInviteUrl", () => {
  it("builds the web invite URL from the api origin", () => {
    expect(buildInviteUrl("tok-1")).toBe("https://ordilo.example/invite/tok-1");
  });
});

describe("createFamilyInvite label", () => {
  function scriptedInsert(step: { data?: unknown; error?: unknown }) {
    const query: Record<string, jest.Mock> = {};
    for (const method of ["insert", "select"]) {
      query[method] = jest.fn(() => query);
    }
    query.single = jest.fn(async () => ({
      data: step.data ?? null,
      error: step.error ?? null,
    }));
    mockFrom.mockReturnValue(query);
    return query;
  }

  it("threads a trimmed label into the insert", async () => {
    const insert = scriptedInsert({ data: { token: "tok-1" } });

    const result = await createFamilyInvite("fam-1", "  Für Oma  ");

    expect(insert.insert).toHaveBeenCalledWith({
      family_id: "fam-1",
      created_by: "u1",
      label: "Für Oma",
    });
    expect(result).toEqual({ success: true, token: "tok-1" });
  });

  it.each([undefined, "", "   "])(
    "omits the label column when it is empty (%j)",
    async (label) => {
      const insert = scriptedInsert({ data: { token: "tok-2" } });

      await createFamilyInvite("fam-1", label);

      // Exact payload: unlabeled invites keep the pre-0083 insert shape.
      expect(insert.insert).toHaveBeenCalledWith({
        family_id: "fam-1",
        created_by: "u1",
      });
    },
  );
});

describe("getFamilyAccess invite fields", () => {
  const familyId = "10000000-0000-4000-8000-000000000001";
  const inviteId = "20000000-0000-4000-8000-000000000002";
  const acceptedBy = "30000000-0000-4000-8000-000000000003";

  it("passes label and acceptance through to the panel", async () => {
    const invite = {
      id: inviteId,
      expires_at: "2026-09-26T10:00:00.000Z",
      label: "Für Oma",
      accepted_at: "2026-09-13T18:30:00.000Z",
      accepted_by: acceptedBy,
    };
    mockRpc.mockResolvedValueOnce({
      data: { status: "ok", members: [], invites: [invite] },
      error: null,
    });

    const result = await getFamilyAccess(familyId);

    expect(result).toEqual({
      success: true,
      data: { status: "ok", members: [], invites: [invite] },
    });
  });

  it("still accepts pre-migration invite rows without the new keys", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        status: "ok",
        members: [],
        invites: [{ id: inviteId, expires_at: "2026-09-26T10:00:00.000Z" }],
      },
      error: null,
    });

    const result = await getFamilyAccess(familyId);

    expect(result.success).toBe(true);
  });

  it("rejects a malformed accepted_by instead of guessing", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        status: "ok",
        members: [],
        invites: [{
          id: inviteId,
          expires_at: "2026-09-26T10:00:00.000Z",
          accepted_by: "not-a-uuid",
        }],
      },
      error: null,
    });

    expect((await getFamilyAccess(familyId)).success).toBe(false);
  });
});

describe("describeInviteTitle", () => {
  it("prefers the owner's label over the numbered fallback", () => {
    expect(describeInviteTitle({ label: "Für Oma" }, 2)).toBe("Für Oma");
  });

  it("falls back to a numbered name for blank or missing labels", () => {
    expect(describeInviteTitle({ label: "   " }, 2)).toBe("Einladungslink 2");
    expect(describeInviteTitle({ label: null }, 1)).toBe("Einladungslink 1");
  });
});

describe("describeInviteDates", () => {
  it("derives the creation day from the fixed 14-day validity", () => {
    // Local noon keeps the derived day stable in every timezone.
    const expires = new Date(2026, 8, 26, 12);
    const text = describeInviteDates({ expires_at: expires.toISOString() });

    const created = new Date(expires);
    created.setDate(created.getDate() - INVITE_VALIDITY_DAYS);
    expect(created.getDate()).toBe(12);
    expect(text).toBe("Link erstellt am 12.9.2026 · gültig bis 26.9.2026");
  });

  it("stays silent when the expiry is unreadable", () => {
    expect(describeInviteDates({ expires_at: "kaputt" })).toBe("");
  });
});

describe("describeInviteStatus", () => {
  it("marks an open link as offen", () => {
    expect(describeInviteStatus({ accepted_at: null })).toBe("Offen");
    expect(describeInviteStatus({ accepted_at: undefined })).toBe("Offen");
  });

  it("names the acceptance day for an accepted link", () => {
    const accepted = new Date(2026, 8, 13, 18, 30);
    expect(describeInviteStatus({ accepted_at: accepted.toISOString() })).toBe(
      "Angenommen am 13.9.2026",
    );
  });

  it("treats an unreadable acceptance date as still open", () => {
    expect(describeInviteStatus({ accepted_at: "kaputt" })).toBe("Offen");
  });
});
