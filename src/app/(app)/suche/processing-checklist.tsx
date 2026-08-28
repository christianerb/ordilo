"use client";

import {
  CheckCircle2,
  ContactRound,
  ListChecks,
  Search,
  Sparkles,
  Users,
  Network,
  type LucideIcon,
} from "lucide-react";
import { CHAT_TOOL_STEP_LABELS } from "@ordilo/chat-contract";
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

const TOOL_ICONS: Record<string, LucideIcon> = {
  search_documents: Search,
  list_documents: ListChecks,
  list_tasks: ListChecks,
  add_task: CheckCircle2,
  add_contact: ContactRound,
  update_task: CheckCircle2,
  create_collection: ListChecks,
  create_note: CheckCircle2,
  list_family_members: Users,
  graph_query: Network,
  mark_task_done: CheckCircle2,
  save_document_fact: CheckCircle2,
  move_document_to_collection: ListChecks,
  add_document_tags: ListChecks,
  add_family_member: Users,
};

function stepFor(toolName: string) {
  return {
    icon: TOOL_ICONS[toolName] ?? Search,
    label: CHAT_TOOL_STEP_LABELS[toolName] ?? "Arbeitet",
  };
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
          "text-sm animate-status-line",
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
