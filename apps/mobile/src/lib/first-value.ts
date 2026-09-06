import {
  firstValueEventProperties,
  type FirstValueEvent,
} from "@ordilo/document-contract";
import { recordProductEvent } from "./analytics";
import { getSupabase } from "./supabase";

/** Best effort; neither login nor a useful action waits for analytics. */
export async function recordFirstValueEvent(
  familyId: string,
  event: FirstValueEvent,
): Promise<void> {
  try {
    const client = getSupabase();
    const { data } = await client.auth.getUser();
    if (!data.user) return;
    await recordProductEvent(client, {
      userId: data.user.id,
      familyId,
      eventName: event.name,
      properties: firstValueEventProperties(event),
    });
  } catch {
    // No private payloads or authentication failures in logs.
  }
}
