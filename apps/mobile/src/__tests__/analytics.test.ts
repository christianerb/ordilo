import {
  recordOnboardingStartedIfFirstTime,
  recordScanFailure,
} from "../lib/analytics";
import { getSupabase } from "../lib/supabase";

jest.mock("../lib/supabase", () => ({ getSupabase: jest.fn() }));

/**
 * Funnel-start parity with the web login form
 * (src/app/(auth)/login/login-form.tsx + src/lib/auth/routing.ts):
 * first-time = no visible families row; a query error counts as
 * first-time (onboarding is the safe default there too).
 */

interface FakeClient {
  from: jest.Mock;
  inserts: { table: string; rows: unknown }[];
}

/** Minimal Supabase stand-in driven by the families lookup result. */
function makeClient(families: {
  data: { id: string } | null;
  error: { message: string } | null;
}): FakeClient {
  const inserts: { table: string; rows: unknown }[] = [];
  const from = jest.fn((table: string) => {
    if (table === "families") {
      const query: Record<string, jest.Mock> = {};
      query.select = jest.fn(() => query);
      query.limit = jest.fn(() => query);
      query.maybeSingle = jest.fn(async () => families);
      return query;
    }
    return {
      insert: jest.fn(async (rows: unknown) => {
        inserts.push({ table, rows });
        return { error: null };
      }),
    };
  });
  return { from, inserts };
}

describe("recordOnboardingStartedIfFirstTime", () => {
  it("records onboarding_started when the user has no family", async () => {
    const client = makeClient({ data: null, error: null });

    await recordOnboardingStartedIfFirstTime(
      client as never,
      "user-1",
    );

    expect(client.inserts).toEqual([
      {
        table: "product_events",
        rows: expect.objectContaining({
          user_id: "user-1",
          event_name: "onboarding_started",
        }),
      },
    ]);
  });

  it("records nothing for a returning user with a family", async () => {
    const client = makeClient({ data: { id: "fam-1" }, error: null });

    await recordOnboardingStartedIfFirstTime(
      client as never,
      "user-1",
    );

    expect(client.inserts).toEqual([]);
  });

  it("counts a lookup error as first-time, like the web", async () => {
    const client = makeClient({
      data: null,
      error: { message: "connection lost" },
    });

    await recordOnboardingStartedIfFirstTime(
      client as never,
      "user-1",
    );

    expect(client.inserts).toHaveLength(1);
  });
});

describe("recordScanFailure", () => {
  /** Supabase stand-in with a signed-in user and an insert recorder. */
  function mockSession(user: { id: string } | null) {
    const insert = jest.fn(async () => ({ error: null }));
    jest.mocked(getSupabase).mockReturnValue({
      auth: { getUser: jest.fn(async () => ({ data: { user } })) },
      from: jest.fn(() => ({ insert })),
    } as never);
    return insert;
  }

  it("records coarse stage and reason codes, never content", async () => {
    const insert = mockSession({ id: "user-1" });

    await recordScanFailure({
      familyId: "fam-1",
      stage: "upload",
      reason: "network",
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        family_id: "fam-1",
        event_name: "document_upload_failed",
        properties: { stage: "upload", reason: "network" },
      }),
    );
  });

  it("records nothing when signed out", async () => {
    const insert = mockSession(null);

    await recordScanFailure({ familyId: null, stage: "ocr", reason: "server" });

    expect(insert).not.toHaveBeenCalled();
  });

  it("never lets analytics throw into the scan flow", async () => {
    jest.mocked(getSupabase).mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    await expect(
      recordScanFailure({ familyId: "fam-1", stage: "upload", reason: "server" }),
    ).resolves.toBeUndefined();
  });
});
