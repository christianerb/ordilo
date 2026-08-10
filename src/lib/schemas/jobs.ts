import { z } from "zod";

/**
 * Zod schemas for the internal scheduler/maintenance routes
 * (/api/jobs/run, /api/documents/reindex). Both are Bearer-authenticated
 * and tolerate a missing body (the scheduler may POST without one), so
 * every field is optional.
 */

/** POST /api/jobs/run — optionally cap how many jobs are processed. */
export const jobsRunRequestSchema = z.object({
  limit: z.number().int().positive().optional(),
});
export type JobsRunRequest = z.infer<typeof jobsRunRequestSchema>;

/** POST /api/documents/reindex — optionally force reindexing. */
export const reindexRequestSchema = z.object({
  force: z.boolean().optional(),
});
export type ReindexRequest = z.infer<typeof reindexRequestSchema>;
