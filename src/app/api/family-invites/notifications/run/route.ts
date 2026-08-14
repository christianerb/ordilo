import { deliverPendingInviteNotifications } from "@/lib/invite-notification-delivery";
import { requireSchedulerAuth } from "@/lib/scheduler-auth";

/**
 * Drains undelivered invite notifications. This is the durable fallback for
 * browser navigation failures and transient Resend outages.
 */
async function handleRun(request: Request): Promise<Response> {
  const authError = requireSchedulerAuth(request);
  if (authError) return authError;

  const result = await deliverPendingInviteNotifications(
    process.env.APP_BASE_URL ?? new URL(request.url).origin,
  );
  return Response.json({ status: "ok", ...result });
}

export async function GET(request: Request): Promise<Response> {
  return handleRun(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleRun(request);
}
