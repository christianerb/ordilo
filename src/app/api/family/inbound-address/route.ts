import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { familyInboundEmail } from "@/lib/family-inbound-email";
import { z } from "zod";

/** The domain is deployment configuration; only the family's alias is client-readable. */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) return Response.json(auth.json, { status: auth.status });
  const parsed = z.string().uuid().safeParse(new URL(request.url).searchParams.get("family_id"));
  if (!parsed.success) return Response.json({ error: "Bitte wähle deine Familie." }, { status: 400 });
  const client = await createClient();
  const { data, error } = await client.from("family_email_aliases")
    .select("local_part").eq("family_id", parsed.data).maybeSingle();
  if (error) return Response.json({ error: "Die Adresse konnte nicht geladen werden." }, { status: 503 });
  if (!data) return Response.json({ error: "Keine Familienadresse gefunden." }, { status: 404 });
  const address = familyInboundEmail(data.local_part, process.env.INBOUND_EMAIL_DOMAIN);
  const configured = Boolean(process.env.RESEND_WEBHOOK_SECRET && process.env.RESEND_API_KEY);
  return Response.json({ address: configured ? address : null }, { headers: { "Cache-Control": "no-store" } });
}
