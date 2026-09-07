import { afterEach, describe, expect, it, vi } from "vitest";
import { meteredOpenAIFetch, tokenCost, withUsageScope } from "../api-usage";

const insert = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
vi.mock("@/lib/supabase/admin", () => ({ createClient: () => ({ from: () => ({ insert, upsert: insert }) }) }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); insert.mockReset().mockResolvedValue({ error: null }); });

describe("API metering", () => {
  it.each([false, true])("bounds stalled attempt and response checkpoints (stream=%s)", async (stream) => {
    vi.useFakeTimers();
    insert.mockImplementation(() => new Promise(() => {}));
    const body = { model: "text-embedding-3-large", usage: { prompt_tokens: 10 } };
    const wire = `data: ${JSON.stringify({ type: "response.completed", response: body })}\n\n`;
    const provider = vi.fn(async () => stream
      ? new Response(wire, { headers: { "content-type": "text/event-stream" } })
      : Response.json(body));
    vi.stubGlobal("fetch", provider);
    const request = withUsageScope({ operation: "search", userId: "user-test" }, () => meteredOpenAIFetch("https://api.openai.com/v1/responses"));
    await vi.advanceTimersByTimeAsync(200);
    expect(provider).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(200);
    const response = await request;
    const text = response.text();
    await vi.advanceTimersByTimeAsync(200);
    expect(await text).toBe(stream ? wire : JSON.stringify(body));
  });
  it("accounts for cache reads and writes without counting tokens twice", () => {
    expect(tokenCost("gpt-5.6-terra", 1000, 200, 100, undefined, 400)).toBeCloseTo(0.00304);
    expect(tokenCost("unknown", 1000, 0, 100, undefined)).toBeNull();
    expect(tokenCost("gpt-5.6-terra", 1000, null, 100, undefined)).toBeNull();
    expect(tokenCost("gpt-5.6-terra", 1000, 0, 100, undefined, null)).toBeNull();
  });
  it("observes split SSE frames and preserves all streamed bytes", async () => {
    const payload = { type: "response.completed", response: { id: "response-test", model: "gpt-5.6-terra", usage: { input_tokens: 20, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens: 5 }, output: [] } };
    const wire = `data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ start(controller) {
      const bytes = new TextEncoder().encode(wire); controller.enqueue(bytes.slice(0, 31)); controller.enqueue(bytes.slice(31)); controller.close();
    } }), { headers: { "content-type": "text/event-stream" } })));
    const response = await withUsageScope({ operation: "chat", userId: "user-test" }, () => meteredOpenAIFetch("https://api.openai.com/v1/responses"));
    expect(await response.text()).toBe(wire);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-test", provider_request_id: "response-test", input_tokens: 20, output_tokens: 5 }));
    expect(JSON.stringify(insert.mock.calls)).not.toContain("response.completed");
  });
  it("does not change successful requests when the usage database is unavailable", async () => {
    insert.mockRejectedValueOnce(new Error("unavailable"));
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ model: "text-embedding-3-large", usage: { prompt_tokens: 100 } })));
    const response = await withUsageScope({ operation: "search", userId: "user-test" }, () => meteredOpenAIFetch("https://api.openai.com/v1/embeddings"));
    expect(response.status).toBe(200);
    expect((await response.json()).usage.prompt_tokens).toBe(100);
  });
});
