import { Platform } from "react-native";
import {
  recordDailyAppOpen,
  resetDailyAppOpenForTests,
  recordProductEvent,
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

  it("records coarse stage, reason, and source codes, never content", async () => {
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
        properties: { stage: "upload", reason: "network", source: "mobile_scan", platform: Platform.OS },
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


describe("platform metadata", () => {
  it.each(["ios", "android"])("marks direct %s events and preserves existing metadata", async (os) => {
    const spy = jest.replaceProperty(Platform, "OS", os as typeof Platform.OS);
    try {
      const client = makeClient({ data: null, error: null });
      await recordProductEvent(client as never, { userId: "user", eventName: "onboarding_started", properties: { step: "start", platform: "web" } });
      expect(client.inserts).toEqual([{ table: "product_events", rows: expect.objectContaining({ properties: { step: "start", platform: os } }) }]);
    } finally { spy.restore(); }
  });
});

describe("recordDailyAppOpen", () => {
  beforeEach(() => resetDailyAppOpenForTests());

  function mockClient(
    result: { data?: boolean | null; error: { message: string } | null } = { data: true, error: null },
  ) {
    const session = { current: "user-1" as string | null };
    const rpc = jest.fn(async () => result);
    jest.mocked(getSupabase).mockReturnValue({
      rpc,
      auth: {
        getSession: jest.fn(async () => ({
          data: { session: session.current ? { user: { id: session.current } } : null },
        })),
      },
    } as never);
    return { rpc, session };
  }

  it("records the open through the deduplicating RPC once per day", async () => {
    const { rpc } = mockClient();
    await recordDailyAppOpen("family-1", new Date("2026-10-22T08:00:00Z"));
    await recordDailyAppOpen("family-1", new Date("2026-10-22T12:00:00Z"));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("record_app_open", {
      p_family_id: "family-1",
      p_platform: Platform.OS,
    });
  });

  it("still records a different person signing in on the same device and day", async () => {
    const { rpc, session } = mockClient();
    const now = new Date("2026-10-22T08:00:00Z");
    await recordDailyAppOpen("family-1", now);
    session.current = "user-2";
    await recordDailyAppOpen("family-1", now);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("asks again while setup is not finished (the RPC answers false)", async () => {
    const { rpc } = mockClient({ data: false, error: null });
    await recordDailyAppOpen("family-1");
    await recordDailyAppOpen("family-1");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("records nothing when signed out", async () => {
    const { rpc, session } = mockClient();
    session.current = null;
    await recordDailyAppOpen("family-1");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("retries on the next load when the RPC failed", async () => {
    const { rpc } = mockClient({ data: null, error: { message: "offline" } });
    await recordDailyAppOpen("family-1");
    await recordDailyAppOpen("family-1");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("never throws", async () => {
    jest.mocked(getSupabase).mockImplementation(() => {
      throw new Error("no client");
    });
    await expect(recordDailyAppOpen("family-1")).resolves.toBeUndefined();
  });
});
