import "server-only";

import { createHash } from "node:crypto";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import { z } from "zod";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Add a provider event to the server-only idempotency ledger.
 *
 * The raw payload is hashed but never stored. `true` means this is the first
 * delivery; `false` means the provider/event ID was already recorded.
 */
export async function recordBillingEvent(
  input: {
    provider: string;
    providerEventId: string;
    eventType: string;
    rawPayload?: string;
    familyId?: string | null;
    occurredAt?: Date | null;
  },
  client: AdminClient = createAdminClient(),
): Promise<boolean> {
  const provider = z.string().min(1).max(80).parse(input.provider);
  const providerEventId = z
    .string()
    .min(1)
    .max(200)
    .parse(input.providerEventId);
  const eventType = z.string().min(1).max(200).parse(input.eventType);
  const familyId = input.familyId
    ? z.string().uuid().parse(input.familyId)
    : null;
  const payloadSha256 =
    input.rawPayload === undefined
      ? null
      : createHash("sha256").update(input.rawPayload).digest("hex");

  const args: Database["public"]["Functions"]["record_billing_event"]["Args"] =
    {
      p_provider: provider,
      p_provider_event_id: providerEventId,
      p_event_type: eventType,
      p_family_id: familyId,
      p_payload_sha256: payloadSha256,
      p_occurred_at: input.occurredAt?.toISOString() ?? null,
    };
  const { data, error } = await client.rpc("record_billing_event", args);
  if (error) {
    throw new Error(`Could not record billing event: ${error.code}`);
  }
  return z.boolean().parse(data);
}
