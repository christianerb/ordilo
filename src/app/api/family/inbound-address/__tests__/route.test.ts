import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ auth: vi.fn(), address: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mock.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mock.address }) }) }) }) }));
import { GET } from "../route";
const request = () => new Request("http://localhost/api/family/inbound-address?family_id=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa");
beforeEach(() => {
  mock.auth.mockResolvedValue({ user: { id: "user" } });
  mock.address.mockResolvedValue({ data: { local_part: "post-0123456789" }, error: null });
  vi.stubEnv("INBOUND_EMAIL_DOMAIN", "inbound.example.invalid");
  vi.stubEnv("RESEND_API_KEY", "test-provider-key");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "test-webhook-key");
});
afterEach(() => vi.unstubAllEnvs());
describe("native family inbound address", () => {
  it("uses the server domain and prevents cached private addresses", async () => {
    const response = await GET(request());
    expect(await response.json()).toEqual({ address: "post-0123456789@inbound.example.invalid" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("does not advertise an address when receiving is not configured", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    expect(await (await GET(request())).json()).toEqual({ address: null });
  });
  it("does not return another family's RLS-hidden alias", async () => {
    mock.address.mockResolvedValue({ data: null, error: null });
    expect((await GET(request())).status).toBe(404);
  });
  it("requires authentication", async () => {
    mock.auth.mockResolvedValue({ status: 401, json: { error: "Nicht angemeldet" } });
    expect((await GET(request())).status).toBe(401);
  });
});
