import { ApiError, apiFetch, apiJson } from "../lib/api";

const mockGetSession = jest.fn();

jest.mock("../lib/supabase", () => ({
  getSupabase: () => ({ auth: { getSession: mockGetSession } }),
}));

const mockFetch = jest.fn();
const mockExpoFetch = jest.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

jest.mock("../lib/native-fetch", () => ({
  nativeFetch: (...args: Parameters<typeof fetch>) => mockExpoFetch(...args),
}));

function sessionWithToken(token: string | null) {
  mockGetSession.mockResolvedValue({
    data: { session: token ? { access_token: token } : null },
  });
}

describe("apiFetch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_API_URL = "https://ordilo.example.com";
    sessionWithToken("access-token-1");
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    mockExpoFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  it("attaches the session access token as a bearer header", async () => {
    await apiFetch("/api/me");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://ordilo.example.com/api/me",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    const headers = mockFetch.mock.calls[0][1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer access-token-1");
  });

  it("preserves caller headers while adding Authorization", async () => {
    await apiFetch("/api/me", { headers: { "Content-Type": "application/json" } });

    const headers = mockFetch.mock.calls[0][1].headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer access-token-1");
  });

  it("uses Expo fetch for native multipart file uploads", async () => {
    const body = new FormData();
    body.append("family_id", "family-1");

    await apiFetch("/api/documents/upload", {
      method: "POST",
      body,
    });

    expect(mockExpoFetch).toHaveBeenCalledWith(
      "https://ordilo.example.com/api/documents/upload",
      expect.objectContaining({ body, headers: expect.any(Headers) }),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws a German 401 ApiError when no session exists", async () => {
    sessionWithToken(null);

    await expect(apiFetch("/api/me")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      message: "Nicht angemeldet. Bitte melde dich erneut an.",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws an ApiError with the HTTP status on non-ok responses", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(apiFetch("/api/me")).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
    });
  });

  it("maps network failures to a friendly ApiError", async () => {
    mockFetch.mockRejectedValue(new TypeError("Network request failed"));

    const error = await apiFetch("/api/me").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe(
      "Keine Verbindung. Bitte prüfe dein Internet und versuch's nochmal.",
    );
  });

  it("strips a trailing slash from the configured base URL", async () => {
    process.env.EXPO_PUBLIC_API_URL = "https://ordilo.example.com/";

    await apiFetch("/api/me");

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://ordilo.example.com/api/me",
    );
  });

  it("fails clearly when EXPO_PUBLIC_API_URL is missing", async () => {
    delete process.env.EXPO_PUBLIC_API_URL;

    await expect(apiFetch("/api/me")).rejects.toThrow(
      "EXPO_PUBLIC_API_URL fehlt",
    );
  });
});

describe("apiJson", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_API_URL = "https://ordilo.example.com";
    sessionWithToken("access-token-1");
  });

  it("parses the JSON body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: "u1" } }),
    });

    await expect(apiJson<{ user: { id: string } }>("/api/me")).resolves.toEqual(
      { user: { id: "u1" } },
    );
  });
});
