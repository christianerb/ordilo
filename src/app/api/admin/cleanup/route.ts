import { purgeExpiredAdminAnalytics, purgeExpiredTrash } from "@/lib/admin/cleanup";
import { requireSchedulerAuth } from "@/lib/scheduler-auth";

export async function GET(request: Request): Promise<Response> {
  const authError = requireSchedulerAuth(request);
  if (authError) return authError;

  try {
    await Promise.all([purgeExpiredAdminAnalytics(), purgeExpiredTrash()]);
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Admin-Bereinigung fehlgeschlagen.", code: "ADMIN_CLEANUP_FAILED" },
      { status: 500 },
    );
  }
}
