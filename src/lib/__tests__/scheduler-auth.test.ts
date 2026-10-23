import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createClient: () => ({ rpc }),
}));

import { requireScheduledWorkerAuth, requireSchedulerAuth } from "@/lib/scheduler-auth";

const databaseToken = "a".repeat(64);
const request = (authorization?: string) =>
  new Request("https://ordilo.de/api/jobs/run", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });

beforeEach(() => {
  rpc.mockReset();
  vi.stubEnv("JOBS_RUNNER_SECRET", "env-runner-secret");
  vi.stubEnv("CRON_SECRET", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("requireScheduledWorkerAuth", () => {
  it("accepts the env secret without asking the database", async () => {
    await expect(requireScheduledWorkerAuth(request("Bearer env-runner-secret"))).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts the token the database generated for its own scheduler", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(requireScheduledWorkerAuth(request(`Bearer ${databaseToken}`))).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith("scheduler_token_valid", { p_token: databaseToken });
  });

  it("works without any env secret once the database token matches", async () => {
    vi.stubEnv("JOBS_RUNNER_SECRET", "");
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(requireScheduledWorkerAuth(request(`Bearer ${databaseToken}`))).resolves.toBeNull();
  });

  it("refuses a long token the database does not know", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    const result = await requireScheduledWorkerAuth(request(`Bearer ${"b".repeat(64)}`));
    expect(result?.status).toBe(401);
  });

  it("refuses when the database check fails", async () => {
    rpc.mockRejectedValueOnce(new Error("unreachable"));
    const result = await requireScheduledWorkerAuth(request(`Bearer ${databaseToken}`));
    expect(result?.status).toBe(401);
  });

  it("does not ask the database about short or missing tokens", async () => {
    expect((await requireScheduledWorkerAuth(request("Bearer short")))?.status).toBe(401);
    expect((await requireScheduledWorkerAuth(request()))?.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps the plain scheduler auth env-only", () => {
    expect(requireSchedulerAuth(request(`Bearer ${databaseToken}`))?.status).toBe(401);
  });
});
