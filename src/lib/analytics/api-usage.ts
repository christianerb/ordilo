import { AsyncLocalStorage } from "node:async_hooks";
import { createClient } from "@/lib/supabase/admin";
import { z } from "zod";

type Scope = { operationId: string; operation: string; userId?: string; documentId?: string };
const scopes = new AsyncLocalStorage<Scope>();
// Telemetry may be incomplete during an outage, but must not stall product work.
const USAGE_WAIT_MS = 200;
async function boundedUsage(work: () => Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(work).catch(() => { console.warn("Usage checkpoint unavailable"); }),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, USAGE_WAIT_MS); }),
    ]);
  } finally { clearTimeout(timer); }
}
export async function recordOcrUsage(documentId: string, requestId: string, pages: number | null, costBreakdown: unknown, usageId: string): Promise<void> {
  return boundedUsage(() => recordOcrUsageUnchecked(documentId, requestId, pages, costBreakdown, usageId));
}
async function recordOcrUsageUnchecked(documentId: string, requestId: string, pages: number | null, costBreakdown: unknown, usageId: string): Promise<void> {
  try {
    const client = createClient();
    const { data } = await client.from("documents").select("uploaded_by").eq("id", documentId).maybeSingle();
    const cost = z.object({ final_cost_cents: z.number().nonnegative() }).safeParse(costBreakdown);
    const { error } = await client.from("api_usage").upsert({
      id: usageId, operation_id: usageId, operation: "document_ocr", document_id: documentId,
      user_id: data?.uploaded_by, provider: "datalab", provider_request_id: requestId,
      model: "convert", provider_units: pages, cost_usd: cost.success ? cost.data.final_cost_cents / 100 : null,
    });
    if (error && error.code !== "23505") console.warn("OCR usage checkpoint failed", { code: error.code });
  } catch { console.warn("OCR usage checkpoint unavailable"); }
}
export function attributeUsageUser(userId: string): void {
  const scope = scopes.getStore();
  if (scope) scope.userId = userId;
}
export function withUsageScope<T>(scope: Omit<Scope, "operationId">, work: () => T): T {
  return scopes.run({ ...scope, operationId: crypto.randomUUID() }, work);
}

const GPT_LIVE_USD_PER_MINUTE = 0.05;

/** Start one minute-priced GPT Live row without retaining audio or transcript. */
export async function recordLiveConversationStarted(input: {
  operationId: string;
  userId: string;
  providerRequestId: string | null;
}): Promise<void> {
  return boundedUsage(async () => {
    const client = createClient();
    const { error } = await client.from("api_usage").upsert({
      id: input.operationId,
      operation_id: input.operationId,
      operation: "live_conversation",
      user_id: input.userId,
      provider: "openai",
      provider_request_id: input.providerRequestId,
      model: "gpt-live-1",
      provider_units: null,
      cost_usd: null,
    });
    if (error && error.code !== "23505") {
      console.warn("Live usage start checkpoint failed", { code: error.code });
    }
  });
}

/** Finalize duration in minutes and the advertised front-end voice cost. */
export async function recordLiveConversationEnded(input: {
  operationId: string;
  durationMillis: number;
  userId: string;
}): Promise<void> {
  const minutes = Math.max(0, input.durationMillis) / 60_000;
  return boundedUsage(async () => {
    const client = createClient();
    const { error } = await client
      .from("api_usage")
      .update({
        provider_units: minutes,
        cost_usd: minutes * GPT_LIVE_USD_PER_MINUTE,
      })
      .eq("id", input.operationId)
      .eq("operation", "live_conversation")
      .eq("user_id", input.userId);
    if (error) {
      console.warn("Live usage end checkpoint failed", { code: error.code });
    }
  });
}

const count = z.number().int().nonnegative();
const usageSchema = z.object({
  id: z.string().optional(), model: z.string().optional(),
  service_tier: z.string().nullable().optional(),
  output: z.array(z.object({ type: z.string() })).optional(),
  usage: z.object({
    input_tokens: count.optional(), prompt_tokens: count.optional(), output_tokens: count.optional(),
    input_tokens_details: z.object({ cached_tokens: count.optional(), cache_write_tokens: count.optional() }).optional(),
  }),
});
const priceSchema = z.record(z.string(), z.object({ input: z.number().nonnegative(), cached: z.number().nonnegative(), output: z.number().nonnegative() }));
// Standard direct-API rates verified 2026-09-07. See docs/quality/beta-usage.md.
const DEFAULT_RATES = JSON.stringify({
  "gpt-5.6-terra": { input: 2, cached: 0.2, output: 12 },
  "gpt-5.6-luna": { input: 0.2, cached: 0.02, output: 1.2 },
  "text-embedding-3-large": { input: 0.13, cached: 0, output: 0 },
});

/** Rates are USD per million tokens. Unknown rates never imply free usage. */
export function tokenCost(model: string | undefined, input: number | null, cached: number | null, output: number | null, rates: string | undefined, writes: number | null = 0): number | null {
  if (!model || input === null || output === null || cached === null || writes === null) return null;
  try {
    const rate = priceSchema.parse(JSON.parse(rates ?? DEFAULT_RATES))[model];
    if (!rate || cached + writes > input) return null;
    const long = model.startsWith("gpt-5.6-") && input > 272_000;
    return (((input - cached - writes) * rate.input + cached * rate.cached + writes * rate.input * 1.25) * (long ? 2 : 1) + output * rate.output * (long ? 1.5 : 1)) / 1_000_000;
  } catch { return null; }
}

async function record(body: unknown, requestId: string | null, scope: Scope | undefined, usageId: string) {
  return boundedUsage(() => recordUnchecked(body, requestId, scope, usageId));
}
async function recordUnchecked(body: unknown, requestId: string | null, scope: Scope | undefined, usageId: string) {
  const result = usageSchema.safeParse(body);
  if (!result.success || !scope) return;
  const { usage, model, id } = result.data;
  const input = usage.input_tokens ?? usage.prompt_tokens ?? null;
  const output = usage.output_tokens ?? (usage.prompt_tokens !== undefined ? 0 : null);
  const cached = usage.input_tokens_details?.cached_tokens ?? (usage.prompt_tokens !== undefined ? 0 : null);
  const writes = usage.input_tokens_details?.cache_write_tokens ?? (usage.prompt_tokens !== undefined ? 0 : null);
  const standard = !result.data.service_tier || ["default", "auto"].includes(result.data.service_tier);
  const tokensUsd = standard ? tokenCost(model, input, cached, output, process.env.OPENAI_USAGE_RATES_USD, writes) : null;
  const webCalls = result.data.output?.filter((item) => item.type === "web_search_call").length ?? 0;
  try {
    const client = createClient();
    let userId = scope.userId;
    if (!userId && scope.documentId) {
      const { data } = await client.from("documents").select("uploaded_by").eq("id", scope.documentId).maybeSingle();
      userId = data?.uploaded_by ?? undefined;
    }
    const { error } = await client.from("api_usage").upsert({
      id: usageId,
      operation_id: scope.operationId, operation: scope.operation, user_id: userId,
      document_id: scope.documentId, provider: "openai", provider_request_id: id ?? requestId,
      model, input_tokens: input, cached_input_tokens: cached, cache_write_tokens: writes, output_tokens: output,
      cost_usd: tokensUsd === null ? null : tokensUsd + webCalls * 0.01,
    });
    if (error && error.code !== "23505") console.warn("API usage checkpoint failed", { code: error.code });
  } catch { console.warn("API usage checkpoint unavailable"); }
}

/** Observe provider totals without retaining prompts or generated content. */
export const meteredOpenAIFetch: typeof fetch = async (input, init) => {
  const scope = scopes.getStore();
  const usageId = crypto.randomUUID();
  // An interrupted/failed stream still has a visible, unpriced attempt.
  if (scope) {
    await boundedUsage(async () => {
    try {
      const client = createClient();
      let userId = scope.userId;
      if (!userId && scope.documentId) {
        const { data } = await client.from("documents").select("uploaded_by").eq("id", scope.documentId).maybeSingle();
        userId = data?.uploaded_by ?? undefined;
      }
      const { error } = await client.from("api_usage").insert({ id: usageId, operation_id: scope.operationId, operation: scope.operation, user_id: userId, document_id: scope.documentId, provider: "openai" });
      if (error) console.warn("API usage attempt checkpoint failed", { code: error.code });
    } catch { console.warn("API usage attempt checkpoint unavailable"); }
    });
  }
  const response = await fetch(input, init);
  if (!scope || !response.ok) return response;
  const requestId = response.headers.get("x-request-id");
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    await boundedUsage(async () => {
      try { await recordUnchecked(await response.clone().json(), requestId, scope, usageId); } catch { /* Preserve provider response. */ }
    });
    return response;
  }
  if (!response.body) return response;
  const decoder = new TextDecoder();
  let pending = "";
  const observer = new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event: unknown = JSON.parse(line.slice(6));
          const parsed = z.object({ type: z.string(), response: z.unknown() }).safeParse(event);
          if (parsed.success && ["response.completed", "response.incomplete", "response.failed"].includes(parsed.data.type)) await record(parsed.data.response, requestId, scope, usageId);
        } catch { /* Non-JSON terminal markers are normal SSE. */ }
      }
      controller.enqueue(chunk);
    },
  });
  return new Response(response.body.pipeThrough(observer), { status: response.status, statusText: response.statusText, headers: response.headers });
};
