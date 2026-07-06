import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the route.
vi.mock("@/lib/supabase/admin", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/dev-fixtures", () => ({
  ensureEmptyDocumentsFixture: vi.fn(),
  EMPTY_FIXTURE_EMAIL: "ordilo.empty.fixture@gmail.com",
  EMPTY_FIXTURE_FAMILY_NAME: "Leere Testfamilie",
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

import { GET } from "@/app/api/dev-auth/route";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import {
  ensureEmptyDocumentsFixture,
} from "@/lib/dev-fixtures";
import { createServerClient } from "@supabase/ssr";

const FIXTURE_USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SHARED_USER_ID = "5bf7b925-c751-4cec-a28d-7c4ca4e8de55";
const ACCESS_TOKEN = "access-token-123";
const REFRESH_TOKEN = "refresh-token-456";
const ACTION_LINK = "https://supabase.example/verify";
const REDIRECT_LOCATION = `http://localhost:3100/#access_token=${ACCESS_TOKEN}&refresh_token=${REFRESH_TOKEN}`;

function buildRequest(fixture?: string): Request {
  const url = new URL("http://localhost:3100/api/dev-auth");
  if (fixture) url.searchParams.set("fixture", fixture);
  return new Request(url.toString());
}

function mockAdminClient(options: {
  linkUserId?: string;
  linkError?: unknown;
  linkMissingActionLink?: boolean;
  linkMissingUser?: boolean;
}) {
  const {
    linkUserId = FIXTURE_USER_ID,
    linkError = null,
    linkMissingActionLink = false,
    linkMissingUser = false,
  } = options;

  const generateLink = vi.fn().mockResolvedValue(
    linkError
      ? { data: null, error: linkError }
      : {
          data: {
            user: linkMissingUser ? null : { id: linkUserId },
            properties: linkMissingActionLink
              ? {}
              : { action_link: ACTION_LINK },
          },
          error: null,
        },
  );

  return {
    auth: { admin: { generateLink } },
  } as unknown as Awaited<ReturnType<typeof createAdminClient>>;
}

function mockFetchResponse(location: string | null) {
  const headers = new Headers();
  if (location) headers.set("location", location);
  return {
    headers,
    status: 302,
  } as unknown as Response;
}

function mockServerClient(setSessionError?: unknown) {
  const setSession = vi
    .fn()
    .mockResolvedValue(
      setSessionError
        ? { data: null, error: setSessionError }
        : { data: { user: { id: FIXTURE_USER_ID } }, error: null },
    );
  return {
    auth: { setSession },
  } as unknown as ReturnType<typeof createServerClient>;
}

describe("GET /api/dev-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // --- Empty fixture path (?fixture=empty) ---

  it("ensures the empty fixture and redirects to /scan", async () => {
    const admin = mockAdminClient({ linkUserId: FIXTURE_USER_ID });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);
    (ensureEmptyDocumentsFixture as ReturnType<typeof vi.fn>).mockResolvedValue({
      familyId: "fam-1",
      familyName: "Leere Testfamilie",
    });
    const serverClient = mockServerClient();
    (createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      serverClient,
    );
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockFetchResponse(REDIRECT_LOCATION));

    const response = await GET(buildRequest("empty"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/scan");
    expect(ensureEmptyDocumentsFixture).toHaveBeenCalledWith(FIXTURE_USER_ID);
    expect(fetchSpy).toHaveBeenCalledWith(ACTION_LINK, { redirect: "manual" });
    expect(serverClient.auth.setSession).toHaveBeenCalledWith({
      access_token: ACCESS_TOKEN,
      refresh_token: REFRESH_TOKEN,
    });
  });

  it("does not reset the empty fixture for the default path", async () => {
    const admin = mockAdminClient({ linkUserId: SHARED_USER_ID });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);
    const serverClient = mockServerClient();
    (createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      serverClient,
    );
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(mockFetchResponse(REDIRECT_LOCATION));

    await GET(buildRequest());

    expect(ensureEmptyDocumentsFixture).not.toHaveBeenCalled();
  });

  // --- Default path (shared test user → /home) ---

  it("redirects to /home for the default (shared) path", async () => {
    const admin = mockAdminClient({ linkUserId: SHARED_USER_ID });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);
    const serverClient = mockServerClient();
    (createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      serverClient,
    );
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(mockFetchResponse(REDIRECT_LOCATION));

    const response = await GET(buildRequest());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/home");
  });

  // --- Error handling ---

  it("returns 500 when generateLink fails", async () => {
    const admin = mockAdminClient({ linkError: new Error("rate limited") });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    const response = await GET(buildRequest("empty"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBeTruthy();
  });

  it("returns 500 when action_link is missing", async () => {
    const admin = mockAdminClient({ linkMissingActionLink: true });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    const response = await GET(buildRequest("empty"));
    expect(response.status).toBe(500);
  });

  it("returns 500 when user is missing from generateLink response", async () => {
    const admin = mockAdminClient({ linkMissingUser: true });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    const response = await GET(buildRequest("empty"));
    expect(response.status).toBe(500);
  });

  it("returns 500 when the verify response has no Location header", async () => {
    const admin = mockAdminClient({});
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);
    (ensureEmptyDocumentsFixture as ReturnType<typeof vi.fn>).mockResolvedValue({
      familyId: "fam-1",
    });
    (createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockServerClient(),
    );
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(mockFetchResponse(null));

    const response = await GET(buildRequest("empty"));
    expect(response.status).toBe(500);
  });

  it("returns 500 when tokens are missing from the redirect hash", async () => {
    const admin = mockAdminClient({});
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);
    (ensureEmptyDocumentsFixture as ReturnType<typeof vi.fn>).mockResolvedValue({
      familyId: "fam-1",
    });
    (createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockServerClient(),
    );
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(mockFetchResponse("http://localhost:3100/#no_tokens"));

    const response = await GET(buildRequest("empty"));
    expect(response.status).toBe(500);
  });

  it("returns 500 when setSession fails", async () => {
    const admin = mockAdminClient({});
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);
    (ensureEmptyDocumentsFixture as ReturnType<typeof vi.fn>).mockResolvedValue({
      familyId: "fam-1",
    });
    (createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockServerClient(new Error("session error")),
    );
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(mockFetchResponse(REDIRECT_LOCATION));

    const response = await GET(buildRequest("empty"));
    expect(response.status).toBe(500);
  });

  // --- Production gate (security: m6 scrutiny blocker) ---

  it("returns 404 and mints NO session when NODE_ENV is 'production'", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      // Wire up mocks so we can assert they are NEVER called.
      const admin = mockAdminClient({});
      (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);
      (ensureEmptyDocumentsFixture as ReturnType<typeof vi.fn>).mockResolvedValue({
        familyId: "fam-1",
      });
      (createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockServerClient(),
      );
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const response = await GET(buildRequest("empty"));

      // The route must return 404 (or 403) — NOT a redirect, NOT 500.
      expect(response.status).toBe(404);
      // No session minting should have occurred.
      expect(admin.auth.admin.generateLink).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(ensureEmptyDocumentsFixture).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("returns 404 for the default (shared) path too when NODE_ENV is 'production'", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const admin = mockAdminClient({});
      (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const response = await GET(buildRequest());

      expect(response.status).toBe(404);
      expect(admin.auth.admin.generateLink).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("returns 404 when NODE_ENV is an unexpected value (not dev/test)", async () => {
    vi.stubEnv("NODE_ENV", "staging");
    try {
      const admin = mockAdminClient({});
      (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const response = await GET(buildRequest("empty"));

      expect(response.status).toBe(404);
      expect(admin.auth.admin.generateLink).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("still functions (redirects + mints session) when NODE_ENV is 'development'", async () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      const admin = mockAdminClient({ linkUserId: SHARED_USER_ID });
      (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);
      const serverClient = mockServerClient();
      (createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        serverClient,
      );
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValue(mockFetchResponse(REDIRECT_LOCATION));

      const response = await GET(buildRequest());

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/home");
      expect(serverClient.auth.setSession).toHaveBeenCalledWith({
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("still functions (redirects + mints session) when NODE_ENV is 'test'", async () => {
    vi.stubEnv("NODE_ENV", "test");
    try {
      const admin = mockAdminClient({ linkUserId: FIXTURE_USER_ID });
      (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);
      (ensureEmptyDocumentsFixture as ReturnType<typeof vi.fn>).mockResolvedValue({
        familyId: "fam-1",
        familyName: "Leere Testfamilie",
      });
      const serverClient = mockServerClient();
      (createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        serverClient,
      );
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValue(mockFetchResponse(REDIRECT_LOCATION));

      const response = await GET(buildRequest("empty"));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/scan");
      expect(serverClient.auth.setSession).toHaveBeenCalledWith({
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
