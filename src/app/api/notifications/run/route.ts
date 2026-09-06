import { requireSchedulerAuth } from "@/lib/scheduler-auth";
import { createClient } from "@/lib/supabase/admin";
import { deliverPushNotifications, queueDailyPushNotifications } from "@/lib/push";

export const maxDuration = 300;
export async function GET(request: Request): Promise<Response> {
  const error = requireSchedulerAuth(request);
  if (error) return error;
  try {
    const client = createClient();
    const queued = await queueDailyPushNotifications(client);
    const delivery = await deliverPushNotifications(client);
    return Response.json({ queued, ...delivery }, { status: delivery.failed ? 503 : 200 });
  } catch {
    return Response.json({ error: "Mitteilungen werden später erneut versucht." }, { status: 503 });
  }
}
