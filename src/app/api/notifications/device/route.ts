import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/admin";

const deviceSchema = z.object({
  id: z.string().uuid(),
  token: z.string().max(255).regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/),
  timezone: z.string().max(100).refine((value) => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }),
});

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) return Response.json(auth.json, { status: auth.status });
  const parsed = deviceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Mitteilungen konnten nicht eingerichtet werden." }, { status: 400 });
  const admin = createClient();
  // Installation IDs are random and persisted locally. A different account must
  // not inherit queued deliveries for the previous owner of the physical device.
  const { data: previous, error: lookupError } = await admin.from("push_devices").select("user_id").eq("id", parsed.data.id).maybeSingle();
  if (lookupError) return Response.json({ error: "Bitte später erneut versuchen." }, { status: 503 });
  if (previous && previous.user_id !== auth.user.id) {
    const removed = await admin.from("push_devices").delete().eq("id", parsed.data.id);
    if (removed.error) return Response.json({ error: "Bitte später erneut versuchen." }, { status: 503 });
  }
  const { error } = await admin.from("push_devices").upsert({ ...parsed.data, user_id: auth.user.id, updated_at: new Date().toISOString() });
  if (error) return Response.json({ error: "Mitteilungen konnten nicht gespeichert werden." }, { status: 503 });
  return Response.json({ registered: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) return Response.json(auth.json, { status: auth.status });
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ungültiges Gerät." }, { status: 400 });
  const { error } = await createClient().from("push_devices").delete().eq("id", parsed.data.id).eq("user_id", auth.user.id);
  return Response.json(error ? { error: "Bitte erneut versuchen." } : { registered: false }, { status: error ? 503 : 200 });
}
