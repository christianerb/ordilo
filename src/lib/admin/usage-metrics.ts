import type { Database } from "@/types/database";
type Usage = Database["public"]["Tables"]["api_usage"]["Row"];

export type UsageTotals = {
  calls: number;
  tokens: number;
  knownUsd: number;
  unknownCosts: number;
};

export type UsageMonth = UsageTotals & { month: string };

export function summarizeUsage(rows: Usage[]) {
  const groups = new Map<string, { userId: string | null; month: string; calls: number; tokens: number; knownUsd: number; unknownCosts: number }>();
  const operations = new Map<string, { operation: string; calls: number; units: Set<string>; knownUsd: number; unknownCosts: number }>();
  const months = new Map<string, UsageTotals>();
  const totals: UsageTotals = { calls: 0, tokens: 0, knownUsd: 0, unknownCosts: 0 };
  for (const row of rows) {
    const month = row.occurred_at.slice(0, 7);
    const tokens = (row.input_tokens ?? 0) + (row.output_tokens ?? 0);
    for (const period of [month, "gesamt"]) {
      const key = `${row.user_id ?? "unbekannt"}:${period}`;
      const group = groups.get(key) ?? { userId: row.user_id, month: period, calls: 0, tokens: 0, knownUsd: 0, unknownCosts: 0 };
      group.calls++;
      group.tokens += tokens;
      if (row.cost_usd === null) group.unknownCosts++; else group.knownUsd += Number(row.cost_usd);
      groups.set(key, group);
    }
    const monthTotals = months.get(month) ?? { calls: 0, tokens: 0, knownUsd: 0, unknownCosts: 0 };
    for (const target of [totals, monthTotals]) {
      target.calls++;
      target.tokens += tokens;
      if (row.cost_usd === null) target.unknownCosts++; else target.knownUsd += Number(row.cost_usd);
    }
    months.set(month, monthTotals);
    const operation = row.document_id ? "document_total" : row.operation;
    const group = operations.get(operation) ?? { operation, calls: 0, units: new Set<string>(), knownUsd: 0, unknownCosts: 0 };
    group.calls++;
    group.units.add(row.document_id ?? row.operation_id);
    if (row.cost_usd === null) group.unknownCosts++; else group.knownUsd += Number(row.cost_usd);
    operations.set(operation, group);
  }
  return {
    accounts: [...groups.values()].sort((a, b) => b.month.localeCompare(a.month)),
    operations: [...operations.values()].map((group) => ({ ...group, units: group.units.size, averageUsd: group.unknownCosts ? null : group.knownUsd / group.units.size })),
    totals,
    monthly: [...months.entries()].map(([month, values]) => ({ month, ...values })).sort((a, b) => b.month.localeCompare(a.month)),
  };
}
