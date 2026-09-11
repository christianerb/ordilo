import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordEnded: vi.fn(),
}));

vi.mock("@/lib/analytics/api-usage", () => ({
  recordLiveConversationEnded: (...args: unknown[]) =>
    mocks.recordEnded(...args),
}));

import {
  enforceLiveSessionLimit,
  hangupLiveSession,
} from "../live-session-control";

const operationId = "20000000-0000-4000-a000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("calls the official provider hangup endpoint", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);

  await hangupLiveSession("live/test", "provider-key");

  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.openai.com/v1/live/sessions/live%2Ftest/hangup",
    {
      method: "POST",
      headers: { Authorization: "Bearer provider-key" },
    },
  );
});

it("hangs up and finalizes five minutes after the server-side wait", async () => {
  const waitForDeadline = vi.fn().mockResolvedValue("limit");
  const onSetupCancelled = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  );

  await enforceLiveSessionLimit({
    apiKey: "provider-key",
    operationId,
    requestSignal: new AbortController().signal,
    sessionId: "live_test",
    userId: "user-1",
    onSetupCancelled,
    waitForDeadline,
  });

  expect(waitForDeadline).toHaveBeenCalledWith(
    expect.any(AbortSignal),
    270_000,
  );
  expect(onSetupCancelled).not.toHaveBeenCalled();
  expect(mocks.recordEnded).toHaveBeenCalledWith({
    operationId,
    durationMillis: 300_000,
    userId: "user-1",
  });
});

it("hangs up and returns quota when setup disconnects after acceptance", async () => {
  const onSetupCancelled = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  );

  await enforceLiveSessionLimit({
    apiKey: "provider-key",
    operationId,
    requestSignal: new AbortController().signal,
    sessionId: "live_test",
    userId: "user-1",
    onSetupCancelled,
    waitForDeadline: vi.fn().mockResolvedValue("setup_cancelled"),
  });

  expect(onSetupCancelled).toHaveBeenCalledOnce();
  expect(mocks.recordEnded).toHaveBeenCalledWith({
    operationId,
    durationMillis: 0,
    userId: "user-1",
  });
});
