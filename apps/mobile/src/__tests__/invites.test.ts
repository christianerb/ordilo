import {
  acceptInvite,
  createFamilyInvite,
  getInviteInfo,
  getInviteMergePreparation,
  INVITE_TOKEN_REGEX,
  mergeOwnedFamilyIntoInvite,
  resolveSignedInInviteState,
} from "../lib/invites";

/**
 * Behavioral tests for the invite library — pinning the RPC mapping and
 * the German error copy of the web invite actions
 * (src/app/invite/actions.ts, src/app/(app)/familie/actions.ts).
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

const VALID_TOKEN = "a".repeat(64);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("INVITE_TOKEN_REGEX", () => {
  it("accepts 64-char lowercase hex tokens", () => {
    expect(INVITE_TOKEN_REGEX.test(VALID_TOKEN)).toBe(true);
  });

  it("accepts shorter hex tokens from older links", () => {
    expect(INVITE_TOKEN_REGEX.test("ab12cd34ef56ab78")).toBe(true);
  });

  it("rejects empty, non-hex, and over-long values", () => {
    expect(INVITE_TOKEN_REGEX.test("")).toBe(false);
    expect(INVITE_TOKEN_REGEX.test("xyz")).toBe(false);
    expect(INVITE_TOKEN_REGEX.test("a".repeat(65))).toBe(false);
    expect(INVITE_TOKEN_REGEX.test("a".repeat(15))).toBe(false);
  });
});

describe("getInviteInfo", () => {
  it("short-circuits malformed tokens without an RPC", async () => {
    const result = await getInviteInfo("not-a-token");
    expect(result).toEqual({ status: "invalid" });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns the family name for a valid invite", async () => {
    mockRpc.mockResolvedValue({
      data: { status: "valid", family_name: "Familie Berger" },
      error: null,
    });

    const result = await getInviteInfo(VALID_TOKEN);

    expect(mockRpc).toHaveBeenCalledWith("get_family_invite_info", {
      p_token: VALID_TOKEN,
    });
    expect(result).toEqual({
      status: "valid",
      familyName: "Familie Berger",
    });
  });

  it("maps errors and expired invites to invalid", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    });
    expect(await getInviteInfo(VALID_TOKEN)).toEqual({ status: "invalid" });

    mockRpc.mockResolvedValueOnce({
      data: { status: "expired" },
      error: null,
    });
    expect(await getInviteInfo(VALID_TOKEN)).toEqual({ status: "invalid" });
  });
});

describe("acceptInvite", () => {
  it("returns success with the notification id on joined", async () => {
    mockRpc.mockResolvedValue({
      data: { status: "joined", notification_id: "n1" },
      error: null,
    });

    const result = await acceptInvite(VALID_TOKEN);

    expect(mockRpc).toHaveBeenCalledWith("accept_family_invite", {
      p_token: VALID_TOKEN,
    });
    expect(result).toEqual({ success: true, notificationId: "n1" });
  });

  it.each([
    ["already_in_family", "already_in_family"],
    ["merge_required", "merge_required"],
    ["shared_source_family", "shared_source_family"],
    ["source_processing", "source_processing"],
  ])("maps RPC status %s to reason %s", async (status, reason) => {
    mockRpc.mockResolvedValue({ data: { status }, error: null });

    const result = await acceptInvite(VALID_TOKEN);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe(reason);
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("maps unknown status to invalid with the web's copy", async () => {
    mockRpc.mockResolvedValue({ data: { status: "expired" }, error: null });

    const result = await acceptInvite(VALID_TOKEN);

    expect(result).toEqual({
      success: false,
      reason: "invalid",
      error: "Diese Einladung ist nicht mehr gültig.",
    });
  });

  it("surfaces the session-expired copy for unauthenticated", async () => {
    mockRpc.mockResolvedValue({
      data: { status: "unauthenticated" },
      error: null,
    });

    const result = await acceptInvite(VALID_TOKEN);

    expect(result).toEqual({
      success: false,
      error: "Deine Anmeldung ist abgelaufen. Bitte öffne den Einladungslink erneut.",
    });
  });
});

describe("getInviteMergePreparation", () => {
  const PREVIEW = {
    status: "merge_available",
    source_family_name: "Familie Alt",
    document_count: 3,
    task_count: 2,
    calendar_event_count: 1,
    member_count: 4,
    collection_count: 5,
    target_adult_count: 2,
    fingerprint: "fp-1",
  };

  it("maps a non-empty preview to merge with camelCase counts", async () => {
    mockRpc.mockResolvedValue({ data: PREVIEW, error: null });

    const result = await getInviteMergePreparation(VALID_TOKEN);

    expect(mockRpc).toHaveBeenCalledWith("get_family_invite_merge_preview", {
      p_token: VALID_TOKEN,
    });
    expect(result).toEqual({
      success: true,
      state: "merge",
      preview: {
        sourceFamilyName: "Familie Alt",
        documentCount: 3,
        taskCount: 2,
        calendarEventCount: 1,
        memberCount: 4,
        collectionCount: 5,
        targetAdultCount: 2,
        fingerprint: "fp-1",
      },
    });
  });

  it("maps an all-zero preview to empty_source", async () => {
    mockRpc.mockResolvedValue({
      data: {
        ...PREVIEW,
        document_count: 0,
        task_count: 0,
        calendar_event_count: 0,
        member_count: 0,
        collection_count: 0,
      },
      error: null,
    });

    const result = await getInviteMergePreparation(VALID_TOKEN);

    expect(result.success).toBe(true);
    if (result.success) expect(result.state).toBe("empty_source");
  });

  it.each(["joined", "joinable", "shared_source_family", "source_processing", "invalid"])(
    "passes the %s status through as state",
    async (status) => {
      mockRpc.mockResolvedValue({ data: { status }, error: null });

      const result = await getInviteMergePreparation(VALID_TOKEN);

      expect(result).toEqual({ success: true, state: status });
    },
  );

  it("fails safely when a merge preview misses its fingerprint", async () => {
    mockRpc.mockResolvedValue({
      data: { ...PREVIEW, fingerprint: undefined },
      error: null,
    });

    const result = await getInviteMergePreparation(VALID_TOKEN);

    expect(result).toEqual({
      success: false,
      error: "Wir konnten deine Familie gerade nicht prüfen. Bitte versuche es erneut.",
    });
  });
});

describe("resolveSignedInInviteState", () => {
  it("shows the plain confirmation when the preview RPC fails", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "down" } });

    const result = await resolveSignedInInviteState(VALID_TOKEN);

    expect(result).toEqual({ state: "confirm", preview: null });
  });

  it("shows the merge state with its preview", async () => {
    mockRpc.mockResolvedValue({
      data: {
        status: "merge_available",
        source_family_name: "Familie Alt",
        document_count: 1,
        task_count: 0,
        calendar_event_count: 0,
        member_count: 0,
        collection_count: 0,
        target_adult_count: 1,
        fingerprint: "fp-2",
      },
      error: null,
    });

    const result = await resolveSignedInInviteState(VALID_TOKEN);

    expect(result.state).toBe("merge");
    expect(result.preview?.sourceFamilyName).toBe("Familie Alt");
  });
});

describe("mergeOwnedFamilyIntoInvite", () => {
  it("sends the preview fingerprint and reports success", async () => {
    mockRpc.mockResolvedValue({
      data: { status: "merged", notification_id: "n9" },
      error: null,
    });

    const result = await mergeOwnedFamilyIntoInvite(VALID_TOKEN, "fp-1");

    expect(mockRpc).toHaveBeenCalledWith("merge_owned_family_into_invite", {
      p_token: VALID_TOKEN,
      p_preview_fingerprint: "fp-1",
    });
    expect(result).toEqual({ success: true, notificationId: "n9" });
  });

  it("maps preview_changed so the UI reloads instead of failing", async () => {
    mockRpc.mockResolvedValue({
      data: { status: "preview_changed" },
      error: null,
    });

    const result = await mergeOwnedFamilyIntoInvite(VALID_TOKEN, "fp-1");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("preview_changed");
  });
});

describe("createFamilyInvite", () => {
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

  it("inserts the invite with family id and creator", async () => {
    const insert = scriptedInsert({ data: { token: "tok-1" } });

    const result = await createFamilyInvite("fam-1");

    expect(mockFrom).toHaveBeenCalledWith("family_invites");
    expect(insert.insert).toHaveBeenCalledWith({
      family_id: "fam-1",
      created_by: "u1",
    });
    expect(result).toEqual({ success: true, token: "tok-1" });
  });

  it("returns the owner-only message when RLS rejects the insert", async () => {
    scriptedInsert({ data: null, error: { message: "row-level security" } });

    const result = await createFamilyInvite("fam-1");

    expect(result).toEqual({
      success: false,
      error:
        "Einladung konnte nicht erstellt werden. Nur wer die Familie angelegt hat, kann einladen.",
    });
  });

  it("requires an authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await createFamilyInvite("fam-1");

    expect(result.success).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
