"use client";

import {
  firstValueEventProperties,
  type FirstValueEvent,
} from "@ordilo/document-contract";
import { createClient } from "@/lib/supabase/client";
import { recordProductEvent } from "./product-events";

/** A document-scoped, RLS-protected lookup, never an untrusted family id. */
export async function recordDocumentValueEvent(
  event: Exclude<FirstValueEvent, { name: "onboarding_entry_selected" }>,
): Promise<void> {
  try {
    const client = createClient();
    const [{ data: auth }, { data: document }] = await Promise.all([
      client.auth.getUser(),
      client.from("documents").select("family_id").eq("id", event.documentId).maybeSingle(),
    ]);
    if (!auth.user || !document) return;
    await recordProductEvent(client, {
      userId: auth.user.id,
      familyId: document.family_id,
      eventName: event.name,
      properties: firstValueEventProperties(event),
    });
  } catch {
    // Measurement never blocks a document or reveals its contents.
  }
}
