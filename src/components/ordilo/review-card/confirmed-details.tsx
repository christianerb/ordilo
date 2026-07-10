import {
  User,
  Building2,
  Calendar,
  Euro,
  Tag,
  ListTodo,
  FileText,
  Loader2,
} from "lucide-react";
import type { DocumentAnalysis } from "@/lib/schemas/extraction";
import { formatGermanDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FieldGroup, FieldRow, getPriorityLabel, getPriorityBadgeClasses } from "./helpers";

/**
 * Read-only analysis details shown for a confirmed document — the
 * metadata, persons, dates, amounts, tasks, category, and tags that were
 * extracted and saved to the family book. Reuses the same flat
 * `FieldGroup`/`FieldRow` list as the in-review card content for visual
 * consistency, minus the edit affordances and confidence badges (nothing
 * left to edit or doubt).
 */
export function ConfirmedAnalysisDetails({
  analysis,
  loading,
  onViewFile,
  fileLoading,
}: {
  analysis: DocumentAnalysis | null;
  loading: boolean;
  onViewFile?: () => void;
  fileLoading?: boolean;
}) {
  if (loading) {
    return (
      <div
        className="mt-5 w-full space-y-2.5 border-t border-border pt-5"
        data-testid="confirmed-details-skeleton"
      >
        <div className="h-14 w-full animate-pulse rounded-ordilo-sm bg-accent" />
        <div className="h-14 w-full animate-pulse rounded-ordilo-sm bg-accent" />
      </div>
    );
  }

  if (!analysis) return null;

  const hasAnyFields =
    analysis.family_members.length > 0 ||
    analysis.organizations.length > 0 ||
    analysis.dates.length > 0 ||
    analysis.amounts.length > 0 ||
    analysis.tasks.length > 0 ||
    analysis.tags.length > 0 ||
    Boolean(analysis.summary?.trim());

  if (!hasAnyFields && !onViewFile) return null;

  return (
    <div
      className="mt-5 w-full space-y-3.5 border-t border-border pt-5 text-left"
      data-testid="confirmed-details"
    >
      {analysis.summary?.trim() && (
        <p className="text-sm leading-relaxed text-[var(--mist-dark)]">
          {analysis.summary}
        </p>
      )}

      <div className="divide-y divide-border/60">
        {analysis.family_members.length > 0 && (
          <FieldGroup testId="confirmed-persons">
            {analysis.family_members.map((member, i) => (
              <FieldRow key={i} icon={User} label="Personen">
                <span className="block truncate">{member.name}</span>
              </FieldRow>
            ))}
          </FieldGroup>
        )}

        {analysis.organizations.length > 0 && (
          <FieldGroup testId="confirmed-organizations">
            {analysis.organizations.map((org, i) => (
              <FieldRow key={i} icon={Building2} label="Organisationen">
                <span className="block truncate">{org.name}</span>
                {org.type && org.type !== "organization" && (
                  <span className="block truncate font-normal text-muted-foreground">
                    {org.type}
                  </span>
                )}
              </FieldRow>
            ))}
          </FieldGroup>
        )}

        {analysis.dates.length > 0 && (
          <FieldGroup testId="confirmed-dates">
            {analysis.dates.map((date, i) => (
              <FieldRow key={i} icon={Calendar} label="Datum">
                <span className="block truncate">
                  {formatGermanDate(date.date) || date.date}
                </span>
                {date.label && (
                  <span className="block truncate font-normal text-muted-foreground">
                    {date.label}
                  </span>
                )}
              </FieldRow>
            ))}
          </FieldGroup>
        )}

        {analysis.amounts.length > 0 && (
          <FieldGroup testId="confirmed-amounts">
            {analysis.amounts.map((amount, i) => (
              <FieldRow key={i} icon={Euro} label="Beträge">
                <span className="block truncate">
                  {amount.amount} {amount.currency}
                </span>
                {amount.label && (
                  <span className="block truncate font-normal text-muted-foreground">
                    {amount.label}
                  </span>
                )}
              </FieldRow>
            ))}
          </FieldGroup>
        )}

        {analysis.tasks.length > 0 && (
          <FieldGroup testId="confirmed-tasks">
            {analysis.tasks.map((task, i) => (
              <FieldRow
                key={i}
                icon={ListTodo}
                label="Aufgaben"
                editControl={
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      getPriorityBadgeClasses(task.priority),
                    )}
                  >
                    {getPriorityLabel(task.priority)}
                  </span>
                }
              >
                <p className="text-foreground">{task.title}</p>
                {task.due_date && (
                  <p className="mt-0.5 font-normal text-muted-foreground">
                    {formatGermanDate(task.due_date) || task.due_date}
                  </p>
                )}
              </FieldRow>
            ))}
          </FieldGroup>
        )}

        <FieldRow icon={Tag} label="Kategorie" testId="confirmed-category">
          <span className="block truncate">{analysis.suggested_category}</span>
        </FieldRow>

        {analysis.tags.length > 0 && (
          <FieldRow icon={Tag} label="Tags" testId="confirmed-tags">
            <div className="flex flex-wrap gap-2">
              {analysis.tags.map((tag, i) => (
                <span
                  key={i}
                  className="rounded-full bg-[var(--sand-light)] px-2.5 py-1 text-xs font-medium text-[var(--mist-dark)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </FieldRow>
        )}
      </div>

      {onViewFile && (
        <button
          type="button"
          onClick={onViewFile}
          disabled={fileLoading}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm disabled:opacity-50"
          data-testid="view-original-file-button"
        >
          {fileLoading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileText className="size-4" aria-hidden="true" />
          )}
          Original ansehen
        </button>
      )}
    </div>
  );
}
