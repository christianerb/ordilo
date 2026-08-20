"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Loader2, ListTodo, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrdiloMascot } from "@/components/ordilo/mascot";
import {
  OrdiloDrawer,
  OrdiloDrawerBody,
  OrdiloDrawerHeader,
} from "@/components/ordilo/ordilo-drawer";
import {
  discoveryHeadline,
  formatSender,
  formatSuggestionWhen,
  suggestionAcceptLabel,
  suggestionKindLabel,
  type InboundEmailDiscovery,
  type InboundSuggestion,
} from "@/lib/inbound-suggestions";
import {
  acceptInboundSuggestion,
  decideInboundEmailRetention,
  dismissInboundSuggestion,
} from "@/app/(app)/home/inbox-actions";

/**
 * Ordilo read an email and found something in it.
 *
 * On the home screen this is one small card with the elephant leaning in from
 * the edge — no badge, no counter, no alert bell. Tapping it opens the
 * questions, and every one of them is a yes/no: nothing an email said ever
 * lands in the calendar or on the task list without a tap.
 */
export interface InboundDiscoveryProps {
  discoveries: InboundEmailDiscovery[];
}

export function InboundDiscovery({ discoveries }: InboundDiscoveryProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(discoveries);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Emails this session has already answered. The server only omits them from
  // the next payload after the decision is stored, so a stale revalidation
  // must not be able to bring one back.
  const answeredRef = useRef<Set<string>>(new Set());

  // Every decision revalidates /home on the server, and a fresh render brings
  // the next discoveries as props while React keeps this state alive. Adjust
  // the queue during render (the sanctioned set-state-in-render pattern):
  // merge only additions, so an email the family just handled stays gone.
  const [seenDiscoveries, setSeenDiscoveries] = useState(discoveries);
  if (seenDiscoveries !== discoveries) {
    setSeenDiscoveries(discoveries);
    setPending((current) => {
      const known = new Set(current.map((discovery) => discovery.id));
      const additions = discoveries.filter(
        (discovery) =>
          !known.has(discovery.id) && !answeredRef.current.has(discovery.id),
      );
      return additions.length > 0 ? [...current, ...additions] : current;
    });
  }

  if (pending.length === 0) return null;

  const sender = formatSender(pending[0].fromAddress);

  /** Drops a decided proposal, and the whole email once it has no more. */
  const removeSuggestion = (
    discovery: InboundEmailDiscovery,
    suggestionId: string,
  ) => {
    // An email that leaves the list here stays answered for this session.
    if (discovery.suggestions.length === 1 && !discovery.retentionPending) {
      answeredRef.current.add(discovery.id);
    }
    const emailId = discovery.id;
    setPending((current) =>
      current
        .map((discovery) =>
          discovery.id === emailId
            ? {
              ...discovery,
              suggestions: discovery.suggestions.filter(
                (suggestion) => suggestion.id !== suggestionId,
              ),
            }
            : discovery,
        )
        // An email whose questions are all answered stays only while its
        // keep-or-delete question is still open.
        .filter(
          (discovery) =>
            discovery.suggestions.length > 0 || discovery.retentionPending,
        ),
    );
  };

  const handleAccept = async (
    discovery: InboundEmailDiscovery,
    suggestion: InboundSuggestion,
  ) => {
    setBusyId(suggestion.id);
    const result = await acceptInboundSuggestion(suggestion.id);
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(
      suggestion.kind === "calendar_event"
        ? "Termin ist im Kalender."
        : "Steht auf der Aufgabenliste.",
    );
    removeSuggestion(discovery, suggestion.id);
  };

  const handleDismiss = async (
    discovery: InboundEmailDiscovery,
    suggestion: InboundSuggestion,
  ) => {
    setBusyId(suggestion.id);
    const result = await dismissInboundSuggestion(suggestion.id);
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    removeSuggestion(discovery, suggestion.id);
  };

  const handleRetention = async (
    discovery: InboundEmailDiscovery,
    keep: boolean,
  ) => {
    setBusyId(discovery.id);
    const result = await decideInboundEmailRetention(discovery.id, keep);
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(keep ? "Die E-Mail bleibt bei euch." : "E-Mail gelöscht.");
    // Each request resolves at its own time. Functional state keeps a later
    // response from reviving an email a previous decision already removed.
    answeredRef.current.add(discovery.id);
    setPending((current) =>
      current.filter((item) => item.id !== discovery.id),
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="home-inbound-discovery"
        className="relative w-full overflow-hidden rounded-ordilo-md border border-white/80 bg-[var(--surface-story)] px-4 py-3.5 text-left shadow-card transition-shadow hover:shadow-card-hover focus-ring"
      >
        <div
          className="pointer-events-none absolute -bottom-12 -right-8 size-36 rounded-full bg-[var(--wash-sage)]/70"
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-3 pr-14">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {discoveryHeadline(pending)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Aus einer E-Mail von {sender}. Soll ich das eintragen?
            </p>
          </div>
        </div>
        {/* Leaning in from the edge rather than sitting in a slot: the
            elephant noticed something, it is not a status icon. */}
        <span
          className="ordilo-peek pointer-events-none absolute -right-3 bottom-0 block"
          aria-hidden="true"
        >
          <OrdiloMascot
            mood="greeting"
            size={64}
            style={{ color: "var(--petrol)" }}
          />
        </span>
      </button>

      <OrdiloDrawer variant="form" open={open} onOpenChange={setOpen}>
        <OrdiloDrawerHeader
          title="Neu für dich"
          description="Das habe ich in euren E-Mails gelesen."
        />
        <OrdiloDrawerBody className="space-y-3">
          {pending.map((discovery) => (
            <DiscoveryGroup
              key={discovery.id}
              discovery={discovery}
              busyId={busyId}
              onAccept={(suggestion) => void handleAccept(discovery, suggestion)}
              onDismiss={(suggestion) => void handleDismiss(discovery, suggestion)}
              onKeep={() => void handleRetention(discovery, true)}
              onDelete={() => void handleRetention(discovery, false)}
            />
          ))}
        </OrdiloDrawerBody>
      </OrdiloDrawer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** One clearly named email, so a keep-or-delete decision never feels vague. */
function DiscoveryGroup({
  discovery,
  busyId,
  onAccept,
  onDismiss,
  onKeep,
  onDelete,
}: {
  discovery: InboundEmailDiscovery;
  busyId: string | null;
  onAccept: (suggestion: InboundSuggestion) => void;
  onDismiss: (suggestion: InboundSuggestion) => void;
  onKeep: () => void;
  onDelete: () => void;
}) {
  const sender = formatSender(discovery.fromAddress);
  const subject = discovery.subject.trim();

  return (
    <section
      className="space-y-2"
      data-testid={`inbound-discovery-group-${discovery.id}`}
    >
      <header className="px-1">
        <p className="text-sm font-medium text-foreground">
          E-Mail von {sender}
        </p>
        {subject && (
          <p className="truncate text-xs text-muted-foreground" title={subject}>
            Betreff: {subject}
          </p>
        )}
      </header>
      {discovery.suggestions.length > 0 ? (
        discovery.suggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            busy={busyId === suggestion.id}
            onAccept={() => onAccept(suggestion)}
            onDismiss={() => onDismiss(suggestion)}
          />
        ))
      ) : (
        <RetentionCard
          busy={busyId !== null}
          onKeep={onKeep}
          onDelete={onDelete}
        />
      )}
    </section>
  );
}

function SuggestionCard({
  suggestion,
  busy,
  onAccept,
  onDismiss,
}: {
  suggestion: InboundSuggestion;
  busy: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const isEvent = suggestion.kind === "calendar_event";
  const Icon = isEvent ? CalendarDays : ListTodo;

  return (
    <div
      className="rounded-ordilo-sm border border-border bg-card p-3 shadow-card"
      data-testid="inbound-suggestion-card"
    >
      <div className="flex items-start gap-2.5">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-ordilo-sm bg-[var(--wash-sage)]"
          aria-hidden="true"
        >
          <Icon
            className="size-4"
            style={{ color: "var(--petrol)" }}
            strokeWidth={1.8}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            {suggestionKindLabel(suggestion.kind)}
          </p>
          <p className="text-[15px] font-medium leading-snug text-foreground">
            {suggestion.title}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatSuggestionWhen(suggestion)}
          </p>
          {suggestion.location && (
            <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
              {suggestion.location}
            </p>
          )}
          {suggestion.note && (
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">
              {suggestion.note}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          size="lg"
          disabled={busy}
          onClick={onAccept}
          className="h-11 flex-1 rounded-ordilo-md text-sm"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {suggestionAcceptLabel(suggestion.kind)}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          disabled={busy}
          onClick={onDismiss}
          className="h-11 rounded-ordilo-md text-sm"
        >
          Nein, danke
        </Button>
      </div>
    </div>
  );
}

/**
 * The question the family should not have to think about twice: Ordilo only
 * needed the email in order to read it, so it asks before keeping it.
 */
function RetentionCard({
  busy,
  onKeep,
  onDelete,
}: {
  busy: boolean;
  onKeep: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="rounded-ordilo-sm border border-border bg-card p-3 shadow-card"
      data-testid="inbound-retention-card"
    >
      <p className="text-[15px] font-medium text-foreground">
        Und die E-Mail selbst?
      </p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Ich habe sie nur zum Lesen gebraucht. Ich kann sie für euch behalten
        oder von unserem Server löschen — was euch eingetragen ist, bleibt so
        oder so.
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          size="lg"
          disabled={busy}
          onClick={onDelete}
          className="h-11 flex-1 rounded-ordilo-md text-sm"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          Bitte löschen
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={busy}
          onClick={onKeep}
          className="h-11 rounded-ordilo-md text-sm"
        >
          Behalten
        </Button>
      </div>
    </div>
  );
}
