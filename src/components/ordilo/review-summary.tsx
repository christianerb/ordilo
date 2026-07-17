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
  RefreshCw,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { useId } from "react";
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
// Derived highlight rows
// ---------------------------------------------------------------------------

interface Highlight {
  icon: LucideIcon;
  value: string;
  caption: string;
  /** Whether this highlight has an inline person selector. */
  isPerson?: boolean;
  /** Whether the value benefits from a quick source check. */
  isVerifiable?: boolean;
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
      isPerson: true,
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
      caption: "Aufgabe",
    });
  }

  const topFact = analysis.facts[0];
  if (topFact) {
    highlights.push({
      icon: Hash,
      value: topFact.value,
      caption: topFact.label || FACT_TYPE_LABELS[topFact.fact_type],
      isVerifiable: true,
    });
  }

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
      caption: "Frist",
      isVerifiable: true,
    });
  }

  return highlights;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ReviewSummaryProps {
  analysis: DocumentAnalysis;
  familyMembers: FamilyMemberOption[];
  hasUnresolvedDisambiguation?: boolean;
  confirming?: boolean;
  confirmError?: string | null;
  onConfirm: () => void;
  onEdit: () => void;
  onReanalyze?: () => void;
  documentId?: string;
  onViewOriginal?: () => void;
  /** Inline person edit — called when the user picks a different person. */
  onEditPerson?: (memberId: string | null) => void;
  /** The currently edited person ID (for the inline select). */
  editedPersonId?: string | null;
  className?: string;
}

/**
 * Review Summary — a compact preview of what Ordilo recognized, with
 * one inline correction path (person) and "Bearbeiten" for everything
 * else. Answers one question: "does this look right?"
 *
 * No confidence percentages, no auto-action lists, no "Ich glaube" —
 * just the facts, clean and confident.
 */
export function ReviewSummary({
  analysis,
  familyMembers,
  hasUnresolvedDisambiguation = false,
  confirming = false,
  confirmError,
  onConfirm,
  onEdit,
  onReanalyze,
  documentId,
  onViewOriginal,
  onEditPerson,
  editedPersonId,
  className,
}: ReviewSummaryProps) {
  const headline = buildHeadline(analysis);
  const typeLabel = DOCUMENT_TYPE_LABELS[analysis.document_type];
  const TypeIcon = DOCUMENT_TYPE_ICONS[analysis.document_type];
  const highlights = buildHighlights(analysis, familyMembers);

  const personSelectId = useId();
  const currentPersonId = editedPersonId ?? analysis.family_members[0]?.person_id ?? null;

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

      {/* Uncertainty notice */}
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

      {/* Highlights */}
      {highlights.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-[var(--mist)]">
            Ordilo hat erkannt
          </h3>
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
                  {h.isPerson && onEditPerson && familyMembers.length > 0 ? (
                    <div className="relative">
                      <select
                        id={personSelectId}
                        value={currentPersonId ?? ""}
                        onChange={(e) => onEditPerson(e.target.value || null)}
                        className="w-full min-w-0 appearance-none truncate rounded-ordilo-sm border border-border bg-card py-1 pl-2 pr-7 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        aria-label="Person wechseln"
                        data-testid="review-summary-person-select"
                      >
                        <option value="">Person wählen …</option>
                        {familyMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}{m.role ? ` (${m.role})` : ""}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </div>
                  ) : (
                    <>
                      <p className="truncate text-sm font-medium text-foreground">
                        {h.value}
                      </p>
                      {h.isVerifiable && onViewOriginal && (
                        <button
                          type="button"
                          onClick={onViewOriginal}
                          className="mt-1 rounded-ordilo-sm text-xs font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                          Im Original vergleichen
                        </button>
                      )}
                    </>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {h.caption}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirm error */}
      {confirmError && (
        <div className="rounded-ordilo-sm border border-destructive/20 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{confirmError}</p>
        </div>
      )}

      {documentId && onViewOriginal && (
        <button
          type="button"
          onClick={onViewOriginal}
          className="inline-flex items-center gap-1.5 rounded-ordilo-sm text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          data-testid="review-summary-view-original"
        >
          <FileText className="size-4" aria-hidden="true" />
          Original vergleichen
        </button>
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
              Passt so
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

      {/* Nochmal lesen — subtle link, not a primary action */}
      {onReanalyze && (
        <button
          type="button"
          onClick={onReanalyze}
          disabled={confirming}
          className="mx-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm"
          data-testid="review-summary-reanalyze-link"
        >
          <RefreshCw className="size-3" aria-hidden="true" />
          Nochmal lesen
        </button>
      )}
    </div>
  );
}
