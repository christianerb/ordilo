"use client";
import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

type Item = { id: string; title: string | null; original_filename?: string | null; deleted_at: string | null; status_before_trash?: string | null };
export function RestoreTrashItems({ documents, tasks }: { documents: Item[]; tasks: Item[] }) {
  const [docs, setDocs] = useState(documents); const [taskItems, setTaskItems] = useState(tasks);
  const restoreDocument = async (id: string) => { const r = await fetch(`/api/documents/${id}/restore`, { method: "POST" }); if (!r.ok) return toast.error("Wiederherstellen hat nicht geklappt."); setDocs((v) => v.filter((x) => x.id !== id)); toast.success("Dokument wiederhergestellt"); };
  const restoreTask = async (task: Item) => { const { error } = await createClient().from("tasks").update({ status: task.status_before_trash ?? "open", deleted_at: null, status_before_trash: null, trashed_by_document_id: null }).eq("id", task.id); if (error) return toast.error("Wiederherstellen hat nicht geklappt."); setTaskItems((v) => v.filter((x) => x.id !== task.id)); toast.success("Aufgabe wiederhergestellt"); };
  if (!docs.length && !taskItems.length) return <div className="mt-6 rounded-ordilo-md border border-dashed border-border bg-[var(--sand)] p-6 text-center text-sm text-muted-foreground">Der Papierkorb ist leer.</div>;
  return <div className="mt-5 space-y-3">{docs.map((item) => <Row key={item.id} label={item.title || item.original_filename || "Ohne Titel"} date={item.deleted_at} onRestore={() => void restoreDocument(item.id)} />)}{taskItems.map((item) => <Row key={item.id} label={item.title || "Ohne Titel"} date={item.deleted_at} onRestore={() => void restoreTask(item)} task />)}</div>;
}
function Row({ label, date, task, onRestore }: { label: string; date: string | null; task?: boolean; onRestore: () => void }) { return <div className="flex items-center gap-3 rounded-ordilo-sm border border-border bg-card p-3 shadow-card"><Trash2 className="size-4 text-muted-foreground" aria-hidden="true"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{label}</p><p className="text-xs text-muted-foreground">{task ? "Aufgabe" : "Dokument oder Notiz"} · gelöscht am {date ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(date)) : "unbekannt"}</p></div><button type="button" onClick={onRestore} className="inline-flex min-h-10 items-center gap-1.5 rounded-ordilo-sm px-2 text-sm font-medium text-[var(--petrol)] hover:bg-[var(--petrol)]/10"><RotateCcw className="size-4"/>Wiederherstellen</button></div>; }
