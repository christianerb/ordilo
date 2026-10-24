import "server-only";
import { storedAttributionSchema } from "@/lib/schemas/growth";
import { cleanHost, cleanPath, cleanValue, type SignupAttribution } from "./attribution";

/**
 * Narrow a stored first touch (signup_attributions) back to a
 * SignupAttribution. The row came from a client, so every value is cleaned
 * again. Server-only: keeps Zod out of the marketing pages' bundle.
 */
export function parseStoredAttribution(value: unknown): SignupAttribution | null {
  const parsed = storedAttributionSchema.safeParse(value);
  if (!parsed.success) return null;
  const raw = parsed.data;
  const attribution: SignupAttribution = {};
  for (const key of ["source", "medium", "campaign", "content", "term"] as const) {
    const cleaned = cleanValue(raw[key]);
    if (cleaned) attribution[key] = cleaned;
  }
  const referrer = cleanHost(raw.referrer);
  if (referrer) attribution.referrer = referrer;
  const landing = cleanPath(raw.landing);
  if (landing) attribution.landing = landing;
  if (raw.via) attribution.via = raw.via;
  if (raw.paid_click) attribution.paid_click = raw.paid_click;
  return attribution;
}
