import { vi, it, expect, beforeEach } from "vitest";
import { POST, DELETE } from "./route";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/admin";
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createClient: vi.fn() }));
const upsert = vi.fn().mockResolvedValue({ error: null });
const eq = vi.fn();
const id = "12345678-1234-4234-a234-123456789abc";
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ user: { id: "actual-user" }, status: null, json: null } as Awaited<ReturnType<typeof requireUser>>);
  const chain = { select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), eq, upsert, delete: vi.fn().mockReturnThis(), then: (resolve: (value: unknown) => void) => resolve({ error: null }) };
  eq.mockReturnValue(chain);
  vi.mocked(createClient).mockReturnValue({ from: () => chain } as unknown as ReturnType<typeof createClient>);
});
it("requires authentication before registering a device", async () => {
  vi.mocked(requireUser).mockResolvedValue({ user: null, status: 401, json: { error: "login", code: "UNAUTHENTICATED" } });
  expect((await POST(new Request("https://ordilo.test", { method: "POST" }))).status).toBe(401);
  expect(createClient).not.toHaveBeenCalled();
});
it("binds tokens to the authenticated user, ignoring a supplied user id", async () => {
  const response = await POST(new Request("https://ordilo.test", { method: "POST", body: JSON.stringify({ id, token: "ExpoPushToken[test]", timezone: "Europe/Berlin", user_id: "attacker" }) }));
  expect(response.status).toBe(200);
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "actual-user" }));
});
it("rejects invalid tokens and unknown time zones", async () => {
  for (const input of [{ id, token: "other", timezone: "Europe/Berlin" }, { id, token: "ExpoPushToken[test]", timezone: "unknown" }]) {
    expect((await POST(new Request("https://ordilo.test", { method: "POST", body: JSON.stringify(input) }))).status).toBe(400);
  }
  expect(upsert).not.toHaveBeenCalled();
});
it("scopes revocation to the requesting account", async () => {
  expect((await DELETE(new Request("https://ordilo.test", { method: "DELETE", body: JSON.stringify({ id }) }))).status).toBe(200);
  expect(eq).toHaveBeenCalledWith("user_id", "actual-user");
});
