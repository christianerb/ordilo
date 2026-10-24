import { z } from "zod";

/**
 * Stored signup attribution as read back from the database. Every field is
 * an untrusted string at this point; attribution.ts cleans the values.
 * Unknown keys and wrong types are dropped instead of failing the whole row.
 */
export const storedAttributionSchema = z
  .object({
    source: z.string().optional().catch(undefined),
    medium: z.string().optional().catch(undefined),
    campaign: z.string().optional().catch(undefined),
    content: z.string().optional().catch(undefined),
    term: z.string().optional().catch(undefined),
    referrer: z.string().optional().catch(undefined),
    landing: z.string().optional().catch(undefined),
    via: z.enum(["invite", "app"]).optional().catch(undefined),
    paid_click: z.enum(["google", "microsoft"]).optional().catch(undefined),
  })
  .strip();

export type StoredAttribution = z.infer<typeof storedAttributionSchema>;

/** One row of the admin_growth_event_days RPC (per user, event, Berlin day). */
export const growthEventDaySchema = z.object({
  user_id: z.string(),
  event_name: z.string(),
  first_at: z.string(),
  last_at: z.string(),
  event_count: z.coerce.number().int().nonnegative(),
});

export const growthEventDaysSchema = z.array(growthEventDaySchema);
