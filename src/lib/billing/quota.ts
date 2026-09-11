import "server-only";

import { createClient as createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import { z } from "zod";
import { planCodeSchema } from "./entitlements";

export const quotaMetricSchema = z.enum([
  "document_processing",
  "chat_answer",
  "live_conversation",
]);
export type QuotaMetric = z.infer<typeof quotaMetricSchema>;

const quotaReservationSchema = z.object({
  allowed: z.boolean(),
  duplicate: z.boolean(),
  plan: planCodeSchema,
  metric: quotaMetricSchema,
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative().nullable(),
  period_start: z.string(),
  period_end: z.string(),
});

export type QuotaReservation = z.infer<typeof quotaReservationSchema>;
type AdminClient = ReturnType<typeof createAdminClient>;

export function billingEntitlementsEnabled(): boolean {
  return process.env.BILLING_ENTITLEMENTS_ENABLED === "1";
}

/**
 * Atomically reserve monthly quota before starting cost-producing work.
 *
 * `operationKey` must identify the logical operation, not the HTTP attempt.
 * Retrying with the same key returns the original decision without charging
 * usage twice. A null limit means no monthly product cap; daily anti-abuse
 * checks in the route must still run independently.
 */
export async function reserveMonthlyUsage(
  input: {
    familyId: string;
    metric: QuotaMetric;
    operationKey: string;
    amount?: number;
    at?: Date;
  },
  client: AdminClient = createAdminClient(),
): Promise<QuotaReservation> {
  const operationKey = z.string().min(1).max(200).parse(input.operationKey);
  const amount = z.number().int().positive().parse(input.amount ?? 1);
  const args: Database["public"]["Functions"]["reserve_family_usage"]["Args"] =
    {
      p_family_id: z.string().uuid().parse(input.familyId),
      p_metric_code: quotaMetricSchema.parse(input.metric),
      p_amount: amount,
      p_operation_key: operationKey,
      p_at: (input.at ?? new Date()).toISOString(),
    };
  const { data, error } = await client.rpc("reserve_family_usage", args);
  if (error) {
    throw new Error(`Could not reserve family quota: ${error.code}`);
  }
  return quotaReservationSchema.parse(data);
}

/** Release a failed operation so the same logical operation can retry. */
export async function releaseMonthlyUsage(
  input: {
    familyId: string;
    metric: QuotaMetric;
    operationKey: string;
    at?: Date;
  },
  client: AdminClient = createAdminClient(),
): Promise<boolean> {
  const args: Database["public"]["Functions"]["release_family_usage"]["Args"] =
    {
      p_family_id: z.string().uuid().parse(input.familyId),
      p_metric_code: quotaMetricSchema.parse(input.metric),
      p_operation_key: z.string().min(1).max(200).parse(input.operationKey),
      p_at: (input.at ?? new Date()).toISOString(),
    };
  const { data, error } = await client.rpc("release_family_usage", args);
  if (error) {
    throw new Error(`Could not release family quota: ${error.code}`);
  }
  return z.boolean().parse(data);
}
