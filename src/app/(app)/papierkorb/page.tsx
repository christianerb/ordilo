import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getMiddlewareFamily } from "@/lib/supabase/server";
import { RestoreTrashItems } from "./restore-trash-items";

export default async function PapierkorbPage() {
  const supabase = await createClient();
  const family = (await getMiddlewareFamily()) ?? (await supabase.from("families").select("id").limit(1).maybeSingle()).data;
  if (!family) redirect("/onboarding");
  const [{ data: documents }, { data: tasks }] = await Promise.all([
    supabase.from("documents").select("id, title, original_filename, deleted_at").eq("family_id", family.id).not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    supabase.from("tasks").select("id, title, deleted_at, status_before_trash").eq("family_id", family.id).not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
  ]);
  return <div className="app-page-stack"><div className="flex items-baseline justify-between gap-3"><div><h1 className="text-lg font-semibold text-foreground">Papierkorb</h1><p className="mt-1 text-sm text-muted-foreground">Gelöschte Sachen bleiben 30 Tage hier.</p></div><Link href="/dokumente" className="text-sm font-medium text-[var(--petrol)]">Zurück</Link></div><RestoreTrashItems documents={documents ?? []} tasks={tasks ?? []} /></div>;
}
