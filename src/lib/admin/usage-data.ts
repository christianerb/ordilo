import "server-only";
import { createClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import { summarizeUsage } from "./usage-metrics";

export async function getUsageOverview() {
  const rows: Database["public"]["Tables"]["api_usage"]["Row"][] = [];
  const client = createClient();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from("api_usage").select("*").order("id").range(offset, offset + 999);
    if (error) return { available: false as const, ...summarizeUsage([]) };
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return { available: true as const, ...summarizeUsage(rows) };
}
