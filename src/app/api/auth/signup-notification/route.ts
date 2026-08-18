import { after } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { deliverSignupNotification } from "@/lib/signup-notification-delivery";

/**
 * POST /api/auth/signup-notification
 *
 * Called after an OTP login is verified. A first-time account has a pending
 * row created by the auth.users trigger; returning users are a harmless
 * no-op. Keep the delivery server-side so the hardcoded recipient never
 * becomes browser data.
 */
export async function POST(): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) return Response.json(auth.json, { status: auth.status });

  after(async () => {
    await deliverSignupNotification(auth.user.id);
  });
  return Response.json({ ok: true });
}
