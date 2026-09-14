import "server-only";

import { createClient as createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import { z } from "zod";

const entitlementSchema = z.object({
  expires_date: z.string().datetime({ offset: true }).nullable(),
  grace_period_expires_date: z.string().datetime({ offset: true }).nullable().optional(),
  product_identifier: z.string().min(1),
});

const subscriptionSchema = z.object({
  billing_issues_detected_at: z.string().datetime({ offset: true }).nullable().optional(),
  expires_date: z.string().datetime({ offset: true }).nullable(),
  grace_period_expires_date: z.string().datetime({ offset: true }).nullable().optional(),
  period_type: z.string().nullable().optional(),
  store_transaction_id: z.union([z.string(), z.number()]).nullable().optional(),
  unsubscribe_detected_at: z.string().datetime({ offset: true }).nullable().optional(),
});

const customerSchema = z.object({
  subscriber: z.object({
    entitlements: z.record(z.string(), entitlementSchema),
    original_app_user_id: z.string(),
    subscriptions: z.record(z.string(), subscriptionSchema),
  }),
});

type AdminClient = ReturnType<typeof createAdminClient>;
type FamilyEntitlementInsert =
  Database["public"]["Tables"]["family_entitlements"]["Insert"];

export interface SyncedRevenueCatEntitlement {
  active: boolean;
  familyId: string;
  status: FamilyEntitlementInsert["status"];
}

function asIso(value: string | null | undefined): string | null {
  return value ?? null;
}

/**
 * Fetch RevenueCat's canonical customer view and project the configured
 * entitlement into Ordilo's provider-neutral family entitlement row.
 */
export async function syncRevenueCatEntitlement(
  familyId: string,
  client: AdminClient = createAdminClient(),
): Promise<SyncedRevenueCatEntitlement> {
  z.string().uuid().parse(familyId);
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!apiKey) throw new Error("REVENUECAT_SECRET_API_KEY is not configured");

  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(familyId)}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`RevenueCat customer lookup failed: ${response.status}`);
  }

  const customer = customerSchema.parse(await response.json());
  const entitlementId = process.env.REVENUECAT_ENTITLEMENT_ID || "plus";
  const entitlement = customer.subscriber.entitlements[entitlementId];
  const subscription = entitlement
    ? customer.subscriber.subscriptions[entitlement.product_identifier]
    : undefined;
  const now = Date.now();
  const expiresAt = entitlement?.expires_date
    ? Date.parse(entitlement.expires_date)
    : null;
  const graceAt = Date.parse(
    entitlement?.grace_period_expires_date ??
      subscription?.grace_period_expires_date ??
      "",
  );
  const hasGrace = Number.isFinite(graceAt) && graceAt > now;
  const active = Boolean(entitlement && (expiresAt === null || expiresAt > now || hasGrace));
  const trialing =
    active &&
    entitlement?.expires_date !== null &&
    subscription?.period_type?.toLowerCase() === "trial";
  const pastDue =
    active && Boolean(subscription?.billing_issues_detected_at) && hasGrace;
  const status: FamilyEntitlementInsert["status"] = !entitlement
    ? "free"
    : !active
      ? "expired"
      : pastDue
        ? "past_due"
        : trialing
          ? "trialing"
          : "active";

  const row: FamilyEntitlementInsert = {
    family_id: familyId,
    plan_code: active ? "plus" : "free",
    status: active ? status : status === "free" ? "free" : "expired",
    trial_ends_at: trialing ? asIso(entitlement?.expires_date) : null,
    current_period_ends_at:
      active && !trialing ? asIso(entitlement?.expires_date) : null,
    grace_ends_at: pastDue
      ? asIso(
          entitlement?.grace_period_expires_date ??
            subscription?.grace_period_expires_date,
        )
      : null,
    cancel_at_period_end:
      active && Boolean(subscription?.unsubscribe_detected_at),
    provider: entitlement ? "revenuecat" : null,
    provider_customer_id: entitlement
      ? customer.subscriber.original_app_user_id
      : null,
    provider_subscription_id:
      entitlement && subscription?.store_transaction_id != null
        ? String(subscription.store_transaction_id)
        : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await client
    .from("family_entitlements")
    .upsert(row, { onConflict: "family_id" });
  if (error) {
    throw new Error(`Could not sync family entitlement: ${error.code}`);
  }

  return { active, familyId, status };
}
