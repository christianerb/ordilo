import { requireUser } from "@/lib/auth/require-user";
import { deliverInviteNotification } from "@/lib/invite-notification-delivery";

/**
 * Sends the invite creator one email after a successful join or merge.
 *
 * The joining user may only trigger their own pending notification. The
 * service-role client claims the row atomically before calling Resend, so
 * retries and double-clicks cannot send duplicates.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) return Response.json(auth.json, { status: auth.status });

  let notificationId: string | null = null;
  try {
    const body = (await request.json()) as { notificationId?: unknown };
    notificationId =
      typeof body.notificationId === "string" ? body.notificationId : null;
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  if (!notificationId) {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const status = await deliverInviteNotification(
    notificationId,
    auth.user.id,
    process.env.APP_BASE_URL ?? new URL(request.url).origin,
  );
  return Response.json(
    { status },
    { status: status === "retry_later" || status === "not_configured" ? 202 : 200 },
  );
}
