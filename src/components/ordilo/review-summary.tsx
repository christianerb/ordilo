"use client";

import {
  Check,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Pencil,
  User,
  Building2,
  Calendar,
  Hash,
  ListTodo,
  Receipt,
  Mail,
  FileSignature,
  Stethoscope,
  GraduationCap,
  Shield,
  Landmark,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatGermanDate } from "@/lib/format";
import {
  DOCUMENT_TYPE_LABELS,
  FACT_TYPE_LABELS,
  type DocumentAnalysis,
  type DocumentType,
} from "@/lib/schemas/extraction";
import { buildHeadline } from "@/components/ordilo/review-card/helpers";
import type { FamilyMemberOption } from "@/lib/analysis";

// ---------------------------------------------------------------------------
// Document type → icon
// ---------------------------------------------------------------------------

const DOCUMENT_TYPE_ICONS: Record<DocumentType, LucideIcon> = {
  invoice: Receipt,
  letter: Mail,
  contract: FileSignature,
  medical: Stethoscope,
  school: GraduationCap,
  insurance: Shield,
  tax: Landmark,
  other: FileText,
};

// ---------------------------------------------------------------------------
// Derived highlight rows ("Ordilo hat erkannt")
// ---------------------------------------------------------------------------

interface Highlight {
  icon: LucideIcon;
  value: string;
  caption: string;
}

function buildHighlights(
  analysis: DocumentAnalysis,
  familyMembers: FamilyMemberOption[],
): Highlight[] {
  const highlights: Highlight[] = [];

  const topPerson = analysis.family_members[0];
  if (topPerson) {
    const role = familyMembers.find((m) => m.id === topPerson.person_id)?.role;
    highlights.push({
      icon: User,
      value: topPerson.name,
      caption: role || "Person",
    });
  }

  const topOrg = analysis.organizations[0];
  if (topOrg) {
    highlights.push({
      icon: Building2,
      value: topOrg.name,
      caption: "Organisation",
    });
  }

  const topTask = analysis.tasks[0];
  if (topTask) {
    highlights.push({
      icon: ListTodo,
      value: topTask.title,
      caption: "Wichtiger Inhalt",
    });
  }

  // Exact identifiers (serial number, contract number, …) are the values
  // families come back for — surface the first one in the summary.
  const topFact = analysis.facts[0];
  if (topFact) {
    highlights.push({
      icon: Hash,
      value: topFact.value,
      caption: topFact.label || FACT_TYPE_LABELS[topFact.fact_type],
    });
  }

  // Prefer the earliest task due date; fall back to the first extracted
  // date if no task carries one. Both are real, extracted values — never
  // fabricated.
  const dueDates = analysis.tasks
    .map((t) => t.due_date)
    .filter((d): d is string => Boolean(d))
    .sort();
  const topDate = dueDates[0] ?? analysis.dates[0]?.date;
  if (topDate) {
    const formatted = formatGermanDate(topDate) || topDate;
    highlights.push({
      icon: Calendar,
      value: formatted,
      caption: "Frist erkannt",
    });
  }

  return highlights;
}

// ---------------------------------------------------------------------------
// Derived auto-action rows ("Ordilo wird Folgendes für dich erledigen")
// ---------------------------------------------------------------------------

export function buildAutoActions(analysis: DocumentAnalysis): string[] {
  const actions: string[] = [];

  const topPerson = analysis.family_members[0];
  actions.push(
    topPerson
      ? `Dokument bei ${topPerson.name} speichern`
      : "Dokument im Familienbuch speichern",
  );

  if (analysis.tasks.length === 1) {
    actions.push(`Aufgabe "${analysis.tasks[0].title}" erstellen`);
  } else if (analysis.tasks.length > 1) {
    actions.push(`${analysis.tasks.length} Aufgaben erstellen`);
  }

  const dueDates = analysis.tasks
    .map((t) => t.due_date)
    .filter((d): d is string => Boolean(d))
    .sort();
  if (dueDates[0]) {
    const formatted = formatGermanDate(dueDates[0]) || dueDates[0];
    actions.push(`Erinnerung am ${formatted}`);
  }

  if (analysis.suggested_category && analysis.suggested_category.trim()) {
    actions.push(`In „${analysis.suggested_category}" einsortieren`);
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ReviewSummaryProps {
  /** The loaded document analysis. */
  analysis: DocumentAnalysis;
  /** Family members, used to resolve the top person's role (if known). */
  familyMembers: FamilyMemberOption[];
  /** True when a low-confidence person match needs manual disambiguation
   * (mirrors the full Review Card's VAL-REVIEW-009 guard) — blocks direct
   * confirm and steers the user to "Bearbeiten" instead. */
  hasUnresolvedDisambiguation?: boolean;
  /** True while the confirm request is in flight. */
  confirming?: boolean;
  /** Error message from a failed confirm attempt. */
  confirmError?: string | null;
  /** "Alles bestätigen" — confirms with no edits. */
  onConfirm: () => void;
  /** "Bearbeiten" — switches to the full, editable Review Card. */
  onEdit: () => void;
  className?: string;
}

/**
 * Review Summary — a compact, non-editable preview of a document's
 * analysis: the headline, a handful of extracted highlights, and a plain
 * list of what confirming will actually do. This is the default landing
 * spot after processing finishes in the scan wizard; "Bearbeiten" hands
 * off to the full field-by-field Review Card when someone wants to correct
 * something.
 *
 * Deliberately excludes per-field confidence badges and edit controls —
 * those live in the full Review Card. This view answers one question:
 * "does this look right, yes or no?"
 */
export function ReviewSummary({
  analysis,
  familyMembers,
  hasUnresolvedDisambiguation = false,
  confirming = false,
  confirmError,
  onConfirm,
  onEdit,
  className,
}: ReviewSummaryProps) {
  const headline = buildHeadline(analysis);
  const typeLabel = DOCUMENT_TYPE_LABELS[analysis.document_type];
  const TypeIcon = DOCUMENT_TYPE_ICONS[analysis.document_type];
  const highlights = buildHighlights(analysis, familyMembers);
  const autoActions = buildAutoActions(analysis);

  return (
    <div data-testid="review-summary" className={cn("space-y-5", className)}>
      {/* Headline */}
      <div className="flex items-start gap-3">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-ordilo-sm"
          style={{ backgroundColor: "var(--secondary)" }}
          aria-hidden="true"
        >
          <TypeIcon className="size-5" style={{ color: "var(--petrol)" }} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="text-base font-semibold leading-snug text-foreground">
            {headline}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{typeLabel}</p>
        </div>
      </div>

      {/* needs_user_review notice — the one place apricot appears here */}
      {analysis.needs_user_review && (
        <div
          data-testid="review-summary-uncertain-notice"
          className="flex items-start gap-2 rounded-ordilo-sm border border-[var(--apricot)]/30 bg-[var(--apricot)]/5 p-3"
        >
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-[var(--apricot)]"
            aria-hidden="true"
          />
          <p className="text-sm text-foreground">
            Ein paar Angaben sind unsicher — kurz drüberschauen lohnt sich.
          </p>
        </div>
      )}

      {/* Highlights: "Ordilo hat erkannt" */}
      {highlights.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-[var(--mist)]">
            Ordilo hat erkannt
          </h3>
          {/* The reveal moment: each recognized fact cascades in, so the
              user watches Ordilo's findings appear one by one. */}
          <div className="space-y-1.5 stagger-children">
            {highlights.map((h, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-ordilo-sm bg-[var(--sand-light)] p-3"
              >
                <h.icon
                  className="size-4 shrink-0 text-[var(--mist-dark)]"
                  aria-hidden="true"
                  strokeWidth={1.75}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {h.value}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {h.caption}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Auto-actions: "Ordilo wird Folgendes für dich erledigen" */}
      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-[var(--mist)]">
          Ordilo wird Folgendes für dich erledigen
        </h3>
        <ul className="space-y-1.5">
          {autoActions.map((action, i) => (
            <li key={i} className="flex items-center gap-2.5 text-sm text-foreground">
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--petrol)]/10"
                aria-hidden="true"
              >
                <Check className="size-3" style={{ color: "var(--petrol)" }} strokeWidth={2.5} />
              </span>
              {action}
            </li>
          ))}
        </ul>
      </div>

      {/* Confirm error */}
      {confirmError && (
        <div className="rounded-ordilo-sm border border-destructive/20 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{confirmError}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2.5">
        <Button
          type="button"
          size="lg"
          onClick={hasUnresolvedDisambiguation ? onEdit : onConfirm}
          disabled={confirming}
          className="h-12 w-full rounded-ordilo-md"
          data-testid="review-summary-confirm-button"
        >
          {confirming ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Wird bestätigt …
            </>
          ) : hasUnresolvedDisambiguation ? (
            <>
              <AlertCircle className="size-4" aria-hidden="true" />
              Bitte Person wählen
            </>
          ) : (
            <>
              <Check className="size-4" aria-hidden="true" />
              Alles bestätigen
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onEdit}
          disabled={confirming}
          className="h-12 w-full rounded-ordilo-md"
          data-testid="review-summary-edit-button"
        >
          <Pencil className="size-4" aria-hidden="true" />
          Bearbeiten
        </Button>
      </div>
    </div>
  );
}
