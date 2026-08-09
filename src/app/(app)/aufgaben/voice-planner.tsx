"use client";

import { useCallback, useRef, useState } from "react";
import { Check, Loader2, Mic, Square, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CalendarEvent } from "@/lib/calendar";
import { formatGermanDate } from "@/lib/format";
import { useRealtimeTranscription } from "@/lib/realtime/use-realtime-transcription";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { AssigneeOption } from "@/components/ordilo/task-card";

/**
 * Voice entry for the family planner: speak a sentence, review Ordilo's
 * proposal, confirm it. The microphone runs over Realtime WebRTC
 * (transcription-only), the transcript goes through the regular chat
 * tool with its confirmation gate, and the confirmation card shown here
 * is the actual gate — tapping "Eintragen" writes exactly the proposal
 * that was displayed, through the same RLS-scoped table path as the
 * manual form.
 */

interface EventProposal {
  event_title: string;
  starts_on: string;
  ends_on: string;
  all_day: boolean;
  starts_time: string | null;
  ends_time: string | null;
  recurrence: CalendarEvent["recurrence"];
  attendee_names: string[];
}

type VoicePhase =
  | { kind: "idle" }
  | { kind: "recording" }
  | { kind: "sending"; transcript: string; answer: string }
  | { kind: "confirm"; transcript: string; proposal: EventProposal }
  | { kind: "answer"; transcript: string; answer: string };

const RECURRENCE_LABELS: Record<CalendarEvent["recurrence"], string> = {
  none: "Keine Wiederholung",
  weekly: "Wöchentlich",
  monthly: "Monatlich",
  yearly: "Jährlich",
};

const RECORDING_STATUS_LABELS = {
  connecting: "Verbinde …",
  listening: "Ich höre zu …",
  processing: "Einen Moment …",
} as const;

/** Bars that react to the live mic level so it's obvious Ordilo hears you. */
function VoiceLevelMeter({ levels }: { levels: number[] }) {
  return (
    <span className="flex h-4 items-center gap-0.5" role="img" aria-label="Mikrofon-Pegel">
      {levels.map((level, index) => (
        <span
          key={index}
          className="w-1 rounded-full bg-primary motion-safe:transition-[height] motion-safe:duration-100"
          style={{ height: `${4 + level * 12}px` }}
        />
      ))}
    </span>
  );
}

/** Parse the confirmation payload into a proposal, or null when incomplete. */
function parseProposal(data: Record<string, unknown>): EventProposal | null {
  if (data.tool_name !== "add_calendar_event") return null;
  const title = typeof data.event_title === "string" ? data.event_title : "";
  const startsOn = typeof data.starts_on === "string" ? data.starts_on : "";
  const endsOn = typeof data.ends_on === "string" ? data.ends_on : startsOn;
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || endsOn < startsOn) {
    return null;
  }
  const recurrence = ["none", "weekly", "monthly", "yearly"].includes(
    String(data.recurrence),
  )
    ? (String(data.recurrence) as CalendarEvent["recurrence"])
    : "none";
  return {
    event_title: title,
    starts_on: startsOn,
    ends_on: endsOn,
    all_day: data.all_day !== false,
    starts_time:
      typeof data.starts_time === "string" ? data.starts_time : null,
    ends_time: typeof data.ends_time === "string" ? data.ends_time : null,
    recurrence,
    attendee_names: Array.isArray(data.attendee_names)
      ? data.attendee_names.filter((n): n is string => typeof n === "string")
      : [],
  };
}

export function VoicePlannerCard({
  familyId,
  members,
  onEventCreated,
}: {
  familyId: string;
  members: AssigneeOption[];
  onEventCreated: (event: CalendarEvent) => void;
}) {
  const supabase = createClient();
  const [phase, setPhase] = useState<VoicePhase>({ kind: "idle" });
  const [confirming, setConfirming] = useState(false);

  // Latest-phase ref for the transcript callback (plain render-time write,
  // same pattern as elsewhere) so a late transcript never resurrects a
  // cancelled flow.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const sendTranscript = useCallback(
    async (transcript: string) => {
      setPhase({ kind: "sending", transcript, answer: "" });

      let proposal: EventProposal | null = null;
      let answer = "";

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: transcript, family_id: familyId }),
        });

        if (!res.ok || !res.body) {
          toast.error(
            res.status === 429
              ? "Tageslimit erreicht. Bitte morgen erneut versuchen."
              : "Das hat nicht geklappt. Bitte versuch es nochmal.",
          );
          setPhase({ kind: "idle" });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(line) as Record<string, unknown>;
            } catch {
              continue;
            }

            if (data.type === "text" && typeof data.content === "string") {
              answer += data.content;
            } else if (
              data.type === "replace" &&
              typeof data.content === "string"
            ) {
              answer = data.content;
            } else if (data.type === "confirmation_request") {
              proposal = parseProposal(data) ?? proposal;
            } else if (data.type === "error") {
              throw new Error("stream error");
            }

            // Live-update the sending view unless a proposal already took
            // over the card.
            if (phaseRef.current.kind === "sending") {
              setPhase({ kind: "sending", transcript, answer });
            }
          }
        }
      } catch {
        toast.error("Das hat nicht geklappt. Bitte versuch es nochmal.");
        setPhase({ kind: "idle" });
        return;
      }

      if (proposal) {
        setPhase({ kind: "confirm", transcript, proposal });
      } else if (answer.trim()) {
        setPhase({ kind: "answer", transcript, answer });
      } else {
        setPhase({ kind: "idle" });
      }
    },
    [familyId],
  );

  const { status, levels, start, stop, cancel } = useRealtimeTranscription({
    onTranscript: (text) => {
      // A transcript arriving after a cancel/discard is ignored.
      if (phaseRef.current.kind !== "recording") return;
      void sendTranscript(text);
    },
    onError: (message) => {
      toast.error(message);
      setPhase({ kind: "idle" });
    },
  });

  const handleMicClick = useCallback(() => {
    setPhase({ kind: "recording" });
    void start();
  }, [start]);

  const handleCancelRecording = useCallback(() => {
    cancel();
    setPhase({ kind: "idle" });
  }, [cancel]);

  const handleConfirm = useCallback(
    async (proposal: EventProposal) => {
      setConfirming(true);
      try {
        const { data, error } = await supabase
          .from("calendar_events")
          .insert({
            family_id: familyId,
            title: proposal.event_title,
            note: null,
            starts_on: proposal.starts_on,
            ends_on: proposal.ends_on,
            all_day: proposal.all_day,
            starts_time: proposal.all_day ? null : proposal.starts_time,
            ends_time: proposal.all_day ? null : proposal.ends_time,
            recurrence: proposal.recurrence,
            recurrence_until: null,
            recurrence_exceptions: [],
          })
          .select(
            "id, title, note, starts_on, ends_on, all_day, starts_time, ends_time, recurrence, recurrence_until, recurrence_exceptions",
          )
          .single();

        if (error || !data) {
          toast.error("Eintragen hat nicht geklappt.");
          return;
        }

        // Resolve spoken names against the family list (case-insensitive).
        const wanted = new Set(
          proposal.attendee_names.map((name) => name.toLocaleLowerCase("de")),
        );
        const attendees = members.filter((member) =>
          wanted.has(member.name.toLocaleLowerCase("de")),
        );
        if (attendees.length > 0) {
          await supabase.from("calendar_event_attendees").insert(
            attendees.map((member) => ({
              event_id: data.id,
              family_member_id: member.id,
            })),
          );
        }

        onEventCreated({
          ...(data as Omit<CalendarEvent, "attendees">),
          attendees: attendees.map((member) => ({
            id: member.id,
            name: member.name,
          })),
        });
        toast.success("Termin eingetragen");
        setPhase({ kind: "idle" });
      } catch {
        toast.error("Eintragen hat nicht geklappt.");
      } finally {
        setConfirming(false);
      }
    },
    [familyId, members, onEventCreated, supabase],
  );

  return (
    <section
      className="rounded-ordilo-sm border border-primary/15 bg-primary/5 px-3 py-2.5"
      aria-label="Spracheingabe"
      data-testid="voice-planner"
    >
      {phase.kind === "idle" && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={handleMicClick}
            data-testid="voice-start-button"
          >
            <Mic className="size-3.5" aria-hidden="true" />
            Sprechen
          </Button>
          <p className="text-xs text-muted-foreground">
            Sag einfach, was ansteht — Ordilo macht einen Vorschlag, den du
            bestätigst.
          </p>
        </div>
      )}

      {phase.kind === "recording" && (
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground",
              status !== "listening" && "motion-safe:animate-pulse",
            )}
            aria-hidden="true"
          >
            <Mic className="size-4" />
          </span>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium text-foreground">
              {RECORDING_STATUS_LABELS[status as keyof typeof RECORDING_STATUS_LABELS] ??
                "Einen Moment …"}
            </p>
            {status === "listening" && <VoiceLevelMeter levels={levels} />}
          </div>
          {status === "listening" && (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={stop}
              data-testid="voice-stop-button"
            >
              <Square className="size-3" aria-hidden="true" />
              Fertig
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={handleCancelRecording}
            aria-label="Abbrechen"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {phase.kind === "sending" && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Verstanden: „{phase.transcript}“
          </p>
          <p className="flex items-center gap-1.5 text-sm text-foreground">
            <Loader2
              className="size-3.5 animate-spin text-primary"
              aria-hidden="true"
            />
            {phase.answer || "Einen Moment …"}
          </p>
        </div>
      )}

      {phase.kind === "confirm" && (
        <div className="space-y-2.5" data-testid="voice-confirm-card">
          <p className="text-xs text-muted-foreground">
            Verstanden: „{phase.transcript}“
          </p>
          <div className="rounded-ordilo-sm border border-border bg-card px-3 py-2.5 shadow-card">
            <p className="text-sm font-medium text-foreground">
              {phase.proposal.event_title}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatGermanDate(phase.proposal.starts_on)}
              {phase.proposal.ends_on !== phase.proposal.starts_on &&
                ` bis ${formatGermanDate(phase.proposal.ends_on)}`}
              {!phase.proposal.all_day &&
                phase.proposal.starts_time &&
                ` · ${phase.proposal.starts_time.slice(0, 5)} bis ${(phase.proposal.ends_time ?? "").slice(0, 5)} Uhr`}
              {phase.proposal.recurrence !== "none" &&
                ` · ${RECURRENCE_LABELS[phase.proposal.recurrence]}`}
              {phase.proposal.attendee_names.length > 0 &&
                ` · mit ${phase.proposal.attendee_names.join(", ")}`}
            </p>
          </div>
          <p className="text-sm font-medium text-foreground">So eintragen?</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => void handleConfirm(phase.proposal)}
              disabled={confirming}
              data-testid="voice-confirm-button"
            >
              {confirming ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="size-3.5" aria-hidden="true" />
              )}
              Eintragen
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPhase({ kind: "idle" })}
              disabled={confirming}
              data-testid="voice-discard-button"
            >
              Verwerfen
            </Button>
          </div>
        </div>
      )}

      {phase.kind === "answer" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Verstanden: „{phase.transcript}“
          </p>
          <p className="text-sm leading-relaxed text-foreground">
            {phase.answer}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPhase({ kind: "idle" })}
          >
            Schließen
          </Button>
        </div>
      )}
    </section>
  );
}
