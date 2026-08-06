"use client";

import {
  CheckCircle2,
  ListChecks,
  Search,
  Sparkles,
  Users,
  Network,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * What Ordilo is actually doing while an answer is being produced.
 *
 * This used to be theatre: steps advanced on a 700ms timer, the step set
 * and the header phrase were picked with Math.random(), and it ticked off
 * "Prüfe Aufgaben und Fristen ✓" for work that may never have run — the
 * model can answer without calling a single tool. It also finished in
 * ~2.1s and then froze, so long answers got no feedback at all.
 *
 * Now every line corresponds to a tool call the server actually reported.
 * Until the first one arrives there is one honest line ("Ordilo liest deine
 * Frage"), because that is genuinely all that is happening yet.
 */

export type ToolCallState = "start" | "done" | "error";

export interface ToolCallProgress {
  toolName: string;
  state: ToolCallState;
}

const TOOL_STEPS: Record<string, { icon: LucideIcon; label: string }> = {
  search_documents: { icon: Search, label: "Durchsucht deine Dokumente" },
  list_documents: { icon: ListChecks, label: "Sieht die Dokumentenliste durch" },
  list_tasks: { icon: ListChecks, label: "Prüft Aufgaben und Fristen" },
  add_task: { icon: CheckCircle2, label: "Legt die Aufgabe an" },
  update_task: { icon: CheckCircle2, label: "Aktualisiert die Aufgabe" },
  create_collection: { icon: ListChecks, label: "Legt die Sammlung an" },
  create_note: { icon: CheckCircle2, label: "Speichert die Notiz" },
  list_family_members: { icon: Users, label: "Schaut, wer zur Familie gehört" },
  graph_query: { icon: Network, label: "Verfolgt Zusammenhänge" },
  mark_task_done: { icon: CheckCircle2, label: "Erledigt die Aufgabe" },
  save_document_fact: { icon: CheckCircle2, label: "Speichert die Nummer" },
  move_document_to_collection: {
    icon: ListChecks,
    label: "Sortiert das Dokument ein",
  },
  add_document_tags: { icon: ListChecks, label: "Ergänzt Schlagworte" },
  add_family_member: { icon: Users, label: "Legt das Familienmitglied an" },
};

function stepFor(toolName: string) {
  return TOOL_STEPS[toolName] ?? { icon: Search, label: "Arbeitet" };
}

export function ProcessingChecklist({
  toolCalls = [],
}: {
  /** Tool activity reported by the stream, in the order it happened. */
  toolCalls?: ToolCallProgress[];
}) {
  return (
    <div
      data-testid="processing-checklist"
      className="space-y-2.5"
      role="status"
      aria-live="polite"
      aria-label="Ordilo arbeitet an deiner Antwort"
    >
      <div className="flex items-center gap-2">
        <Sparkles
          className="size-3.5 shrink-0 animate-pulse"
          style={{ color: "var(--petrol)" }}
          aria-hidden="true"
        />
        <span className="text-sm font-medium text-foreground">
          Ordilo denkt nach …
        </span>
      </div>

      <div className="ml-5 space-y-1.5 border-l border-border/40 pl-3">
        {toolCalls.length === 0 ? (
          <div
            className="flex items-center gap-2 text-sm text-foreground"
            data-testid="processing-step"
            data-status="active"
          >
            <span
              className="size-1.5 shrink-0 rounded-full bg-[var(--petrol)] animate-pulse"
              aria-hidden="true"
            />
            <span className="font-medium">Liest deine Frage</span>
          </div>
        ) : (
          toolCalls.map((call, i) => {
            const { icon: Icon, label } = stepFor(call.toolName);
            const done = call.state === "done";
            const failed = call.state === "error";
            return (
              <div
                key={`${call.toolName}-${i}`}
                data-testid="processing-step"
                data-status={failed ? "error" : done ? "done" : "active"}
                className={cn(
                  "flex items-center gap-2 text-sm transition-all duration-300",
                  failed && "text-destructive",
                  done && !failed && "text-muted-foreground/60",
                  !done && !failed && "text-foreground",
                )}
              >
                {done && !failed ? (
                  <CheckCircle2
                    className="size-3.5 shrink-0"
                    style={{ color: "var(--petrol)" }}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                ) : (
                  <Icon
                    className={cn(
                      "size-3.5 shrink-0",
                      !failed && "animate-pulse",
                    )}
                    aria-hidden="true"
                  />
                )}
                <span className={!done && !failed ? "font-medium" : ""}>
                  {label}
                  {failed && " — hat nicht geklappt"}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
