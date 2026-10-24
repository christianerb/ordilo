import "server-only";
import { createClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import { fetchAllRows } from "./paginate";
import { summarizeUsage } from "./usage-metrics";

export async function getUsageOverview() {
  const client = createClient();
  let rows: Database["public"]["Tables"]["api_usage"]["Row"][];
  try {
    rows = await fetchAllRows((from, to) =>
      client.from("api_usage").select("*").order("id").range(from, to),
    );
  } catch {
    return { available: false as const, ...summarizeUsage([]) };
  }
  return { available: true as const, ...summarizeUsage(rows) };
}
