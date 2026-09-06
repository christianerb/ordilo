"use client";

import { useState } from "react";
import { ArrowUpRight, FileText } from "lucide-react";
import type { ChatSource } from "@ordilo/chat-contract";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

function Quote({ source }: { source: ChatSource }) {
  const text = source.quote ?? source.excerpt;
  const index = source.highlight ? text.toLocaleLowerCase("de-DE").indexOf(source.highlight.toLocaleLowerCase("de-DE")) : -1;
  return <blockquote className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
    {index < 0 ? text : <>{text.slice(0, index)}<mark className="rounded-sm bg-[var(--warm-apricot-light)] px-0.5 text-foreground">{text.slice(index, index + source.highlight!.length)}</mark>{text.slice(index + source.highlight!.length)}</>}
  </blockquote>;
}

export function ChatEvidence({ source, onOpenDocument, id }: { source: ChatSource; onOpenDocument: (id: string) => void; id?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [original, setOriginal] = useState<string | null>(null);
  async function loadOriginal() {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(source.document_id)}/file`);
      if (!response.ok) throw new Error("file");
      const file = await response.json() as { url?: unknown };
      if (typeof file.url !== "string" || new URL(file.url).protocol !== "https:") throw new Error("url");
      setOriginal(`${file.url}${source.page_number ? `#page=${source.page_number}` : ""}`);
    } catch { setError("Das Original konnte gerade nicht geladen werden. Versuche es noch einmal."); }
    finally { setLoading(false); }
  }
  return <Dialog>
    <DialogTrigger asChild><button id={id} type="button" className="w-full rounded-ordilo-sm bg-[var(--sand)] p-5 text-left transition-colors hover:bg-[var(--sand-warm)] focus-ring" aria-label={`Fundstelle öffnen: ${source.title ?? "Dokument"}`}>
      <span className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--petrol)]"><FileText className="size-4 shrink-0" aria-hidden="true" /><span className="flex-1">{source.title ?? "Eure Unterlage"}</span><ArrowUpRight className="size-4" aria-hidden="true" /></span>
      <Quote source={source} />
      <span className="mt-3 block text-xs text-muted-foreground">{source.page_number ? `Seite ${source.page_number} · ` : ""}Fundstelle ansehen</span>
    </button></DialogTrigger>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>{source.title ?? "Eure Unterlage"}</DialogTitle><DialogDescription>{source.page_number ? `Originaltext · Seite ${source.page_number}` : "Originaltext"}</DialogDescription></DialogHeader>
      <div className="my-4 rounded-ordilo-sm bg-[var(--sand)] p-6"><Quote source={source} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {source.has_original !== false && (original ? <a href={original} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-ordilo-sm bg-[var(--petrol)] px-5 text-white focus-ring">Original ansehen <ArrowUpRight className="size-4" /></a> :
        <button type="button" disabled={loading} onClick={() => void loadOriginal()} className="min-h-12 rounded-ordilo-sm bg-[var(--petrol)] px-5 text-white focus-ring disabled:opacity-60">{loading ? "Original wird geladen …" : "Original öffnen"}</button>)}
      <button type="button" onClick={() => onOpenDocument(source.document_id)} className="min-h-11 text-sm text-[var(--petrol)] focus-ring">Zur Dokumentübersicht</button>
    </DialogContent>
  </Dialog>;
}
