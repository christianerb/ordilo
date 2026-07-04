import { describe, it, expect } from "vitest";

/**
 * Smoke tests verifying the Supabase client modules export the expected
 * factory functions. The actual client creation is validated via the
 * running app (middleware, callback, login flow) — these tests guard
 * against accidental removal or rename of the exports.
 */
describe("supabase client exports", () => {
  it("client.ts exports a createClient function", async () => {
    const mod = await import("@/lib/supabase/client");
    expect(typeof mod.createClient).toBe("function");
  });

  it("server.ts exports a createClient function", async () => {
    const mod = await import("@/lib/supabase/server");
    expect(typeof mod.createClient).toBe("function");
  });

  it("admin.ts exports a createClient function", async () => {
    const mod = await import("@/lib/supabase/admin");
    expect(typeof mod.createClient).toBe("function");
  });

  it("middleware.ts exports an updateSession function", async () => {
    const mod = await import("@/lib/supabase/middleware");
    expect(typeof mod.updateSession).toBe("function");
  });
});
