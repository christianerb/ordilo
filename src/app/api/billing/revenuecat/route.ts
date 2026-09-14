import { recordBillingEvent } from "@/lib/billing/events";
import { syncRevenueCatEntitlement } from "@/lib/billing/revenuecat";
import { verifyRevenueCatSignature } from "@/lib/billing/revenuecat-webhook";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const payloadSchema = z.object({
  api_version: z.string(),
  event: z.object({
    aliases: z.array(z.string()).optional(),
    app_user_id: z.string().optional(),
    event_timestamp_ms: z.number().int().nonnegative().max(8_640_000_000_000_000),
    id: z.string().min(1),
    original_app_user_id: z.string().optional(),
    transferred_from: z.array(z.string()).optional(),
    transferred_to: z.array(z.string()).optional(),
    type: z.string().min(1),
  }),
});

async function existingFamilyIds(candidates: string[]): Promise<string[]> {
  const ids = [...new Set(candidates)].filter((value) =>
    z.string().uuid().safeParse(value).success,
  );
  if (ids.length === 0) return [];
  const client = createAdminClient();
  const { data, error } = await client
    .from("families")
    .select("id")
    .in("id", ids);
  // A transient lookup error must not be mistaken for "no matching
  // families": recording the event and returning 200 would acknowledge it
  // without ever syncing the entitlement.
  if (error) {
    throw new Error(`Could not resolve webhook families: ${error.code}`);
  }
  return data?.map(({ id }) => id) ?? [];
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.REVENUECAT_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    return Response.json({ error: "Webhook nicht konfiguriert." }, { status: 503 });
  }
  const body = await request.text();
  const signature = request.headers.get("x-revenuecat-webhook-signature");
  if (!signature || !verifyRevenueCatSignature(body, signature, secret)) {
    return Response.json({ error: "Ungültige Signatur." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return Response.json({ error: "Ungültiges JSON." }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Ungültiges Ereignis." }, { status: 400 });
  }
  const event = parsed.data.event;
  let familyIds: string[];
  try {
    familyIds = await existingFamilyIds([
      event.app_user_id ?? "",
      event.original_app_user_id ?? "",
      ...(event.aliases ?? []),
      ...(event.transferred_from ?? []),
      ...(event.transferred_to ?? []),
    ]);
  } catch {
    // 503 before recording: RevenueCat retries, and the retry finds no
    // ledger entry yet, so the event is processed once the lookup works.
    return Response.json(
      { error: "Familien konnten nicht aufgelöst werden." },
      { status: 503 },
    );
  }
  const familyId = familyIds[0] ?? null;

  await recordBillingEvent({
    provider: "revenuecat",
    providerEventId: event.id,
    eventType: event.type,
    familyId,
    occurredAt: new Date(event.event_timestamp_ms),
    rawPayload: body,
  });

  if (familyIds.length > 0 && event.type !== "TEST") {
    try {
      // The canonical customer endpoint avoids maintaining subtly different
      // state transitions for every current and future webhook event type.
      await Promise.all(
        familyIds.map((id) => syncRevenueCatEntitlement(id)),
      );
    } catch {
      return Response.json({ error: "Synchronisierung fehlgeschlagen." }, { status: 503 });
    }
  }
  return Response.json({ received: true });
}
