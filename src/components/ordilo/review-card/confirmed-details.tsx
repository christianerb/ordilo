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
  onViewOriginal,
  documentId,
}: {
  analysis: DocumentAnalysis | null;
  loading: boolean;
  onViewOriginal?: () => void;
  /** Enables the editable facts section (loads + writes document_facts). */
  documentId?: string;
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

  if (!hasAnyFields && !onViewOriginal) return null;

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

        {documentId && <EditableFactsSection documentId={documentId} />}

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
              <FieldRow
                key={i}
                icon={Calendar}
                label="Datum"
                onCompareOriginal={onViewOriginal}
              >
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
              <FieldRow
                key={i}
                icon={Euro}
                label="Beträge"
                onCompareOriginal={onViewOriginal}
              >
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
    <FieldGroup testId="confirmed-facts">
      {facts.map((fact) => (
        <FieldRow
          key={fact.id}
          icon={Hash}
          label="Nummern & Kennungen"
          editControl={
            editingId === fact.id ? undefined : (
              <button
                type="button"
                onClick={() => {
                  setEditingId(fact.id);
                  setEditValue(fact.value);
                }}
                aria-label={`${fact.label} korrigieren`}
                className="flex size-7 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
                className="flex size-7 shrink-0 items-center justify-center rounded-ordilo-sm bg-[var(--petrol)] text-white disabled:opacity-50"
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
                className="flex size-7 shrink-0 items-center justify-center rounded-ordilo-sm text-muted-foreground hover:text-foreground"
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
            className="flex size-8 shrink-0 items-center justify-center rounded-ordilo-sm bg-[var(--petrol)] text-white disabled:opacity-50"
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
            className="flex size-8 shrink-0 items-center justify-center rounded-ordilo-sm text-muted-foreground hover:text-foreground"
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
    </FieldGroup>
  );
}
