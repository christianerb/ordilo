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
 * Single live status line shown while Ordilo works on an answer.
 *
 * This used to be an accumulating checklist — one line per tool call, so
 * a question that triggered three searches read like a four-step protocol
 * and felt slower than it was. Now only the activity happening RIGHT NOW
 * is shown: the current tool call, or a plain "thinking" line when the
 * model is reading or writing. Finished steps collapse into the next one
 * instead of piling up, and the whole line disappears the moment the
 * answer starts streaming.
 *
 * Every label still corresponds to a tool call the server actually
 * reported — nothing is invented on a timer.
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
  // A still-running tool is always the current status: with parallel
  // tool calls the last-started one can finish before an earlier one, so
  // the final array entry alone does not tell the truth. Only when no
  // call is running does the latest settled entry decide between the
  // writing state and an error. Earlier finished steps are noise either
  // way — only one line shows.
  const active = [...toolCalls].reverse().find((c) => c.state === "start");
  const latest = active ?? toolCalls[toolCalls.length - 1];

  let status: "active" | "done" | "error";
  let Icon: LucideIcon;
  let label: string;

  if (!latest) {
    // No tool reported yet — the model is reading the question.
    status = "active";
    Icon = Sparkles;
    label = "Ordilo denkt nach";
  } else if (latest.state === "start") {
    status = "active";
    ({ icon: Icon, label } = stepFor(latest.toolName));
  } else if (latest.state === "error") {
    status = "error";
    ({ icon: Icon, label } = stepFor(latest.toolName));
    label = `${label} — hat nicht geklappt`;
  } else {
    // All reported tools finished, the answer is being written now.
    status = "done";
    Icon = Sparkles;
    label = "Schreibt die Antwort";
  }

  return (
    <div
      data-testid="processing-checklist"
      className="flex items-center gap-2"
      role="status"
      aria-live="polite"
      aria-label="Ordilo arbeitet an deiner Antwort"
    >
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          status === "active" && "animate-pulse",
        )}
        style={{
          color: status === "error" ? "var(--destructive)" : "var(--petrol)",
        }}
        aria-hidden="true"
      />
      <span
        // Re-key on label change so the fade replays when the activity
        // switches — a quiet state transition, not decoration.
        key={label}
        data-testid="processing-step"
        data-status={status}
        className={cn(
          "text-sm animate-in fade-in-0 duration-200",
          status === "error" && "text-destructive",
          status === "active" && "font-medium text-foreground",
          status === "done" && "text-muted-foreground",
        )}
      >
        {label}
        {status !== "error" ? " …" : ""}
      </span>
    </div>
  );
}
