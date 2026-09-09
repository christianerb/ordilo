import "server-only";

import { createClient as createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import { z } from "zod";

export const planCodeSchema = z.enum(["free", "founding", "plus"]);
export const entitlementStatusSchema = z.enum([
  "free",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
]);

export type PlanCode = z.infer<typeof planCodeSchema>;
export type EntitlementStatus = z.infer<typeof entitlementStatusSchema>;

export interface StoredEntitlement {
  plan: PlanCode;
  status: EntitlementStatus;
  trialEndsAt: Date | null;
  currentPeriodEndsAt: Date | null;
  graceEndsAt: Date | null;
}

/**
 * Resolve paid write access without changing archive/read access.
 *
 * Expired trials and subscriptions become `free`; callers must apply the
 * free plan only to new metered work. Existing documents and family data
 * remain readable. A cancellation scheduled for period end stays `active`
 * until that end. Past-due access requires an explicit grace window.
 */
export function resolveEffectivePlan(
  entitlement: StoredEntitlement,
  now = new Date(),
): PlanCode {
  if (
    entitlement.plan !== "free" &&
    entitlement.status === "trialing" &&
    entitlement.trialEndsAt !== null &&
    entitlement.trialEndsAt > now
  ) {
    return entitlement.plan;
  }

  if (
    entitlement.plan !== "free" &&
    entitlement.status === "active" &&
    (entitlement.currentPeriodEndsAt === null ||
      entitlement.currentPeriodEndsAt > now)
  ) {
    return entitlement.plan;
  }

  if (
    entitlement.plan !== "free" &&
    entitlement.status === "past_due" &&
    entitlement.graceEndsAt !== null &&
    entitlement.graceEndsAt > now
  ) {
    return entitlement.plan;
  }

  return "free";
}

const effectiveEntitlementSchema = z.object({
  family_id: z.string().uuid(),
  plan: planCodeSchema,
  status: entitlementStatusSchema,
  access_ends_at: z.string().datetime({ offset: true }).nullable(),
  limits: z.record(z.string(), z.number().int().nonnegative().nullable()),
});

export type EffectiveEntitlement = z.infer<typeof effectiveEntitlementSchema>;
type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Read the database-resolved entitlement with a service-role client.
 *
 * Authenticated clients that need the same non-sensitive view may call
 * `get_family_entitlement` directly; its SQL wrapper verifies membership.
 */
export async function getEffectiveEntitlement(
  familyId: string,
  at = new Date(),
  client: AdminClient = createAdminClient(),
): Promise<EffectiveEntitlement | null> {
  const args: Database["public"]["Functions"]["get_family_entitlement_admin"]["Args"] =
    { p_family_id: familyId, p_at: at.toISOString() };
  const { data, error } = await client.rpc(
    "get_family_entitlement_admin",
    args,
  );
  if (error) {
    throw new Error(`Could not resolve family entitlement: ${error.code}`);
  }
  if (data === null) return null;
  return effectiveEntitlementSchema.parse(data);
}
