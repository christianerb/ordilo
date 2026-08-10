import { z } from "zod";

/**
 * Zod schemas for /api/conversations/[id].
 */

/** PATCH /api/conversations/[id] — rename a conversation. */
export const updateConversationSchema = z.object({
  title: z.string().trim().min(1),
});
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
