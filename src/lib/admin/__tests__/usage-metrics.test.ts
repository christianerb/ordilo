import { expect, it } from "vitest";
import type { Database } from "@/types/database";
import { summarizeUsage } from "../usage-metrics";
type Row = Database["public"]["Tables"]["api_usage"]["Row"];
const row = (patch: Partial<Row>): Row => ({ id: "id", operation_id: "op", operation: "chat", user_id: "user", document_id: null, provider: "openai", provider_request_id: null, model: "model", provider_units: null, input_tokens: 100, cached_input_tokens: 20, cache_write_tokens: 0, output_tokens: 10, cost_usd: 0.01, occurred_at: "2026-09-01T00:00:00Z", ...patch });

it("separates calendar months and keeps an unpriced call visible in cumulative totals", () => {
  const result = summarizeUsage([row({}), row({ occurred_at: "2026-08-31T23:59:59Z", cost_usd: null })]);
  expect(result.accounts.find((group) => group.month === "2026-09")?.calls).toBe(1);
  expect(result.accounts.find((group) => group.month === "gesamt")).toMatchObject({ calls: 2, tokens: 220, knownUsd: 0.01, unknownCosts: 1 });
  expect(result.operations[0].averageUsd).toBeNull();
});

it("aggregates multiple analysis stages into one document cost", () => {
  const result = summarizeUsage([
    row({ document_id: "document", operation: "document_analysis" }),
    row({ document_id: "document", operation: "document_embeddings", operation_id: "op-2" }),
  ]);
  expect(result.operations).toEqual([{ operation: "document_total", calls: 2, units: 1, knownUsd: 0.02, unknownCosts: 0, averageUsd: 0.02 }]);
});

it("sums totals and months across users for the cost summary cards", () => {
  const result = summarizeUsage([
    row({ user_id: "user-a", cost_usd: 0.01 }),
    row({ user_id: "user-b", operation_id: "op-2", cost_usd: 0.02, output_tokens: 30 }),
    row({ user_id: "user-a", operation_id: "op-3", occurred_at: "2026-08-15T10:00:00Z", cost_usd: null }),
  ]);
  expect(result.totals).toEqual({ calls: 3, tokens: 350, knownUsd: 0.03, unknownCosts: 1 });
  expect(result.monthly).toEqual([
    { month: "2026-09", calls: 2, tokens: 240, knownUsd: 0.03, unknownCosts: 0 },
    { month: "2026-08", calls: 1, tokens: 110, knownUsd: 0, unknownCosts: 1 },
  ]);
});
