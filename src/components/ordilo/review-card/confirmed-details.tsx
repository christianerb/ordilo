"use client";

import { useState } from "react";
import {
  User,
  Building2,
  Calendar,
  Euro,
  Tag,
  ListTodo,
  FileText,
  Loader2,
  Hash,
  Pencil,
  Plus,
  X,
  Check,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  FACT_TYPES,
  FACT_TYPE_LABELS,
  type DocumentAnalysis,
  type FactType,
} from "@/lib/schemas/extraction";
import { formatGermanDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { FieldRow, getPriorityLabel, getPriorityBadgeClasses } from "./helpers";

function shouldShowOrganizationType(name: string, type?: string | null): boolean {
  if (!type) return false;
  const normalize = (value: string) =>
    value.toLocaleLowerCase("de").replace(/[^a-z0-9äöüß]+/g, " ").trim();
  const normalizedType = normalize(type);
  return (
    normalizedType !== "organization" &&
    normalizedType !== "organisation" &&
    normalizedType !== normalize(name)
  );
}

function dedupeBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item).trim().toLocaleLowerCase("de");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ConfirmedSection({
  icon: Icon,
  title,
  testId,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={testId} className="py-3 first:pt-0">
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-[var(--mist-dark)]">
        <Icon className="size-3.5" aria-hidden="true" />
        {title}
      </h4>
      <div className="mt-1 divide-y divide-border/60">{children}</div>
    </section>
  );
}

/**
 * Read-only analysis details shown for a confirmed document. Actionable
 * information stays visible while supporting metadata is grouped behind
 * progressive disclosure.
 */
export function ConfirmedAnalysisDetails({
  analysis,
  loading,
  onViewOriginal,
  documentId,
  standalone = false,
}: {
  analysis: DocumentAnalysis | null;
  loading: boolean;
  onViewOriginal?: () => void;
  /** Enables the editable facts section (loads + writes document_facts). */
  documentId?: string;
  standalone?: boolean;
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
    Boolean(analysis.suggested_category?.trim()) ||
    Boolean(analysis.summary?.trim());

  if (!hasAnyFields && !onViewOriginal && !documentId) return null;

  const people = dedupeBy(analysis.family_members, (member) => member.name);
  const organizations = dedupeBy(
    analysis.organizations,
    (organization) => `${organization.name}|${organization.type ?? ""}`,
  );
  const taskDueDates = new Set(
    analysis.tasks.map((task) => task.due_date).filter(Boolean),
  );
  const dates = dedupeBy(
    analysis.dates.filter((date) => !taskDueDates.has(date.date)),
    (date) => `${date.date}|${date.label ?? ""}|${date.type}`,
  );
  const amounts = dedupeBy(
    analysis.amounts,
    (amount) => `${amount.amount}|${amount.currency}|${amount.label ?? ""}`,
  );
  const additionalCount =
    organizations.length + dates.length + amounts.length;

  return (
    <div
      className={cn(
        "w-full space-y-3.5 text-left",
        !standalone && "mt-5 border-t border-border pt-5",
      )}
      data-testid="confirmed-details"
    >
      {analysis.summary?.trim() && (
        <p className="text-sm leading-relaxed text-[var(--mist-dark)]">
          {analysis.summary}
        </p>
      )}

      <div className="space-y-2 rounded-ordilo-sm bg-[var(--surface-story)] px-3 py-2.5">
        {people.length > 0 && (
          <div
            className="flex items-start gap-2 text-sm"
            data-testid="confirmed-persons"
          >
            <User
              className="mt-0.5 size-3.5 shrink-0 text-[var(--mist-dark)]"
              aria-hidden="true"
            />
            <span className="w-16 shrink-0 text-muted-foreground">Für</span>
            <span className="min-w-0 font-medium text-foreground">
              {people.map((member) => member.name).join(", ")}
            </span>
          </div>
        )}

        {analysis.suggested_category && (
          <div
            className="flex items-start gap-2 text-sm"
            data-testid="confirmed-category"
          >
            <Tag
              className="mt-0.5 size-3.5 shrink-0 text-[var(--mist-dark)]"
              aria-hidden="true"
            />
            <span className="w-16 shrink-0 text-muted-foreground">
              Sammlung
            </span>
            <span className="min-w-0 font-medium text-foreground">
              {analysis.suggested_category}
            </span>
          </div>
        )}
      </div>

      {analysis.tasks.length > 0 && (
        <ConfirmedSection
          icon={ListTodo}
          title={
            analysis.tasks.length === 1
              ? "Nächster Schritt"
              : `Nächste Schritte (${analysis.tasks.length})`
          }
          testId="confirmed-tasks"
        >
          {analysis.tasks.map((task, i) => (
            <FieldRow
              key={i}
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
        </ConfirmedSection>
      )}

      {documentId && <EditableFactsSection documentId={documentId} />}

      {additionalCount > 0 && (
        <details
          className="group border-t border-border/60 pt-1"
          data-testid="confirmed-more-details"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-ordilo-sm px-1 py-2 text-sm font-medium text-[var(--petrol)] hover:bg-[var(--surface-story)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <span>
              Weitere Angaben
              <span className="ml-1 font-normal text-muted-foreground">
                ({additionalCount})
              </span>
            </span>
            <ChevronDown
              className="size-4 transition-transform duration-200 group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>

          <div className="divide-y divide-border/60 pl-1">
            {organizations.length > 0 && (
              <ConfirmedSection
                icon={Building2}
                title="Organisationen"
                testId="confirmed-organizations"
              >
                {organizations.map((organization, i) => (
                  <FieldRow key={i}>
                    <span className="block truncate">{organization.name}</span>
                    {shouldShowOrganizationType(
                      organization.name,
                      organization.type,
                    ) && (
                      <span className="block truncate font-normal text-muted-foreground">
                        {organization.type}
                      </span>
                    )}
                  </FieldRow>
                ))}
              </ConfirmedSection>
            )}

            {dates.length > 0 && (
              <ConfirmedSection
                icon={Calendar}
                title="Termine"
                testId="confirmed-dates"
              >
                {dates.map((date, i) => (
                  <FieldRow key={i}>
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
              </ConfirmedSection>
            )}

            {amounts.length > 0 && (
              <ConfirmedSection
                icon={Euro}
                title="Beträge"
                testId="confirmed-amounts"
              >
                {amounts.map((amount, i) => (
                  <FieldRow key={i}>
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
              </ConfirmedSection>
            )}
          </div>
        </details>
      )}

      {onViewOriginal && (
        <button
          type="button"
          onClick={() => onViewOriginal()}
          className="inline-flex items-center gap-1.5 rounded-ordilo-sm text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          data-testid="view-original-file-button"
        >
          <FileText className="size-4" aria-hidden="true" />
          Original vergleichen
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editable facts — "Nummern & Kennungen" with fix/add after confirmation
// ---------------------------------------------------------------------------

interface FactRowData {
  id: string;
  fact_type: string;
  label: string;
  value: string;
}

/**
 * The one part of a confirmed document that stays editable: its typed
 * facts (serial numbers, contract numbers, IBANs, …). Extraction can
 * misread exactly these values (an OCR'd 8 becomes a B), and they are
 * what families come back for — so correcting or adding one must never
 * require a re-scan. Reads and writes go straight to `document_facts`
 * via /api/documents/[id]/facts; the fact search picks changes up
 * immediately.
 */
function EditableFactsSection({ documentId }: { documentId: string }) {
  const [facts, setFacts] = useState<FactRowData[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState<FactType>("serial_number");
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  useMountEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("document_facts")
          .select("id, fact_type, label, value")
          .eq("document_id", documentId)
          .order("created_at", { ascending: true });
        if (!cancelled && data) setFacts(data);
      } catch {
        // Facts stay empty — the section still offers "Nummer hinzufügen".
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  const saveEdit = async (fact: FactRowData) => {
    const trimmed = editValue.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/facts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_id: fact.id, value: trimmed }),
      });
      if (!response.ok) throw new Error();
      setFacts((prev) =>
        prev.map((f) => (f.id === fact.id ? { ...f, value: trimmed } : f)),
      );
      setEditingId(null);
      toast.success("Nummer korrigiert");
    } catch {
      toast.error("Speichern hat nicht geklappt — bitte nochmal versuchen");
    } finally {
      setSaving(false);
    }
  };

  const addFact = async () => {
    const trimmed = newValue.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/facts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_type: newType, value: trimmed }),
      });
      if (!response.ok) throw new Error();
      const { fact } = (await response.json()) as { fact: FactRowData };
      setFacts((prev) => [...prev, fact]);
      setNewValue("");
      setAdding(false);
      toast.success("Nummer hinterlegt");
    } catch {
      toast.error("Speichern hat nicht geklappt — bitte nochmal versuchen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfirmedSection
      icon={Hash}
      title="Nummern & Kennungen"
      testId="confirmed-facts"
    >
      {facts.map((fact) => (
        <FieldRow
          key={fact.id}
          editControl={
            editingId === fact.id ? undefined : (
              <button
                type="button"
                onClick={() => {
                  setEditingId(fact.id);
                  setEditValue(fact.value);
                }}
                aria-label={`${fact.label} korrigieren`}
                className="flex size-11 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                data-testid="confirmed-fact-edit-button"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </button>
            )
          }
        >
          {editingId === fact.id ? (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void saveEdit(fact);
              }}
            >
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                aria-label={`${fact.label} bearbeiten`}
                maxLength={200}
                autoFocus
                className="min-w-0 flex-1 rounded-ordilo-sm border border-border bg-[var(--sand)] px-2 py-1 font-mono text-sm focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                data-testid="confirmed-fact-edit-input"
              />
              <button
                type="submit"
                disabled={saving || !editValue.trim()}
                aria-label="Speichern"
                className="flex size-11 shrink-0 items-center justify-center rounded-ordilo-sm bg-[var(--petrol)] text-white disabled:opacity-50"
                data-testid="confirmed-fact-save-button"
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="size-3.5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                aria-label="Abbrechen"
                className="flex size-11 shrink-0 items-center justify-center rounded-ordilo-sm text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </form>
          ) : (
            <>
              <span className="block truncate font-mono">{fact.value}</span>
              <span className="block truncate font-normal text-muted-foreground">
                {fact.label}
              </span>
            </>
          )}
        </FieldRow>
      ))}

      {adding ? (
        <form
          className="flex flex-wrap items-center gap-1.5 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void addFact();
          }}
          data-testid="confirmed-fact-add-form"
        >
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as FactType)}
            aria-label="Nummerntyp"
            className="rounded-ordilo-sm border border-border bg-[var(--sand)] px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {FACT_TYPES.map((type) => (
              <option key={type} value={type}>
                {FACT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="z. B. WM-482-A93816"
            aria-label="Wert der Nummer"
            maxLength={200}
            autoFocus
            className="min-w-0 flex-1 rounded-ordilo-sm border border-border bg-[var(--sand)] px-2 py-1.5 font-mono text-sm focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-testid="confirmed-fact-add-input"
          />
          <button
            type="submit"
            disabled={saving || !newValue.trim()}
            aria-label="Nummer speichern"
            className="flex size-11 shrink-0 items-center justify-center rounded-ordilo-sm bg-[var(--petrol)] text-white disabled:opacity-50"
            data-testid="confirmed-fact-add-save"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewValue("");
            }}
            aria-label="Abbrechen"
            className="flex size-11 shrink-0 items-center justify-center rounded-ordilo-sm text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center gap-2 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          data-testid="confirmed-fact-add-button"
        >
          <Plus className="size-4 shrink-0" aria-hidden="true" />
          Nummer hinzufügen
        </button>
      )}
    </ConfirmedSection>
  );
}
