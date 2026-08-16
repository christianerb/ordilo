"use client";

import { useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ROLE_CHIPS } from "@/components/ordilo/role-chips";
import {
  MAX_RELATIONS_PER_MEMBER,
  MAX_ROLE_LENGTH,
  formatRelation,
  nameMap,
  type MemberRelation,
} from "@/lib/family/relations";

/** A minimal reference to another family member. */
export interface RelationMemberOption {
  id: string;
  name: string;
}

export interface RelationshipEditorProps {
  /** The relations being edited. */
  value: MemberRelation[];
  /** Called with the full new list on every change. */
  onChange: (relations: MemberRelation[]) => void;
  /** The other members of the family — the people a relation can point at. */
  members: RelationMemberOption[];
  /** Whether the editor is disabled (e.g. while submitting). */
  disabled?: boolean;
}

/** A blank relation, ready to be filled in. */
const EMPTY_RELATION: MemberRelation = { role: "", member_ids: [] };

/**
 * Relationship Editor — "Mutter von Emma und Hanna", as many times as it takes.
 *
 * One role chip could never describe a person: Karina is the mother of the
 * kids AND the partner of Christian. So instead of a single role plus a
 * separate "Beziehung zu" field, a member holds a list of relations, each
 * one a role and the people it points at.
 *
 * Rows collapse to their sentence ("Mutter von Emma und Hanna") and expand
 * to chips on tap — one open at a time, so the sheet stays readable on a
 * phone. People are picked with toggle chips rather than a dropdown, which
 * is one tap instead of two and works inside the bottom sheet.
 *
 * With nobody else in the family yet, a relation is just a role — the
 * editor then looks exactly like the old role chips.
 */
export function RelationshipEditor({
  value,
  onChange,
  members,
  disabled = false,
}: RelationshipEditorProps) {
  // Start with one open blank row when there is nothing yet, so adding the
  // first role stays a single tap.
  const [editingIndex, setEditingIndex] = useState<number | null>(
    value.length === 0 ? 0 : null,
  );
  const relations = value.length > 0 ? value : [EMPTY_RELATION];
  const names = nameMap(members);

  const update = (index: number, next: MemberRelation) => {
    const list = relations.map((relation, i) => (i === index ? next : relation));
    onChange(list);
  };

  const remove = (index: number) => {
    onChange(relations.filter((_, i) => i !== index));
    setEditingIndex(null);
  };

  const add = () => {
    onChange([...relations, { ...EMPTY_RELATION }]);
    setEditingIndex(relations.length);
  };

  const toggleMember = (index: number, memberId: string) => {
    const relation = relations[index];
    const memberIds = relation.member_ids.includes(memberId)
      ? relation.member_ids.filter((id) => id !== memberId)
      : [...relation.member_ids, memberId];
    update(index, { ...relation, member_ids: memberIds });
  };

  const canAdd =
    relations.length < MAX_RELATIONS_PER_MEMBER &&
    relations.every((relation) => relation.role.trim() !== "");

  return (
    <div className="space-y-2" data-testid="relationship-editor">
      {relations.map((relation, index) => {
        const isEditing = editingIndex === index;
        const summary = formatRelation(relation, names);

        if (!isEditing) {
          return (
            <div
              key={index}
              className="flex items-center gap-2 rounded-ordilo-md border border-border bg-card px-3 py-2"
              data-testid="relationship-row"
            >
              <button
                type="button"
                onClick={() => setEditingIndex(index)}
                disabled={disabled}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                data-testid={`relationship-summary-${index}`}
              >
                <span className="truncate">{summary || "Beziehung wählen"}</span>
                <Pencil
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                onClick={() => remove(index)}
                disabled={disabled}
                aria-label={`${summary || "Beziehung"} entfernen`}
                data-testid={`relationship-remove-${index}`}
                className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        }

        return (
          <RelationRow
            key={index}
            index={index}
            relation={relation}
            members={members}
            disabled={disabled}
            showRemove={relations.length > 1 || relation.role.trim() !== ""}
            onRoleChange={(role) => update(index, { ...relation, role })}
            onToggleMember={(memberId) => toggleMember(index, memberId)}
            onDone={() => setEditingIndex(null)}
            onRemove={() => remove(index)}
          />
        );
      })}

      {canAdd && (
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          data-testid="relationship-add"
          className="flex items-center gap-1 text-sm font-medium text-[var(--petrol)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <Plus className="size-4" />
          Weitere Beziehung
        </button>
      )}
    </div>
  );
}

/** The expanded editor for one relation: role chips, then "von" chips. */
function RelationRow({
  index,
  relation,
  members,
  disabled,
  showRemove,
  onRoleChange,
  onToggleMember,
  onDone,
  onRemove,
}: {
  index: number;
  relation: MemberRelation;
  members: RelationMemberOption[];
  disabled: boolean;
  showRemove: boolean;
  onRoleChange: (role: string) => void;
  onToggleMember: (memberId: string) => void;
  onDone: () => void;
  onRemove: () => void;
}) {
  const isStandardRole = (ROLE_CHIPS as readonly string[]).includes(relation.role);
  // A role that isn't one of the chips (typed here, or entered as free text
  // before the chips existed) keeps the free-text field open so editing
  // never silently drops it.
  const [customOpen, setCustomOpen] = useState(
    relation.role.trim() !== "" && !isStandardRole,
  );

  return (
    <div
      className="space-y-3 rounded-ordilo-md border border-border bg-card p-3"
      data-testid={`relationship-editor-row-${index}`}
    >
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={`Rolle für Beziehung ${index + 1}`}
      >
        {ROLE_CHIPS.map((role) => (
          <Chip
            key={role}
            label={role}
            selected={relation.role === role}
            disabled={disabled}
            onClick={() => {
              setCustomOpen(false);
              onRoleChange(relation.role === role ? "" : role);
            }}
          />
        ))}
        <Chip
          label="Andere"
          selected={customOpen}
          disabled={disabled}
          onClick={() => {
            const next = !customOpen;
            setCustomOpen(next);
            if (!next) onRoleChange("");
            else if (isStandardRole) onRoleChange("");
          }}
        />
      </div>

      {customOpen && (
        <Input
          type="text"
          autoComplete="off"
          placeholder="z. B. Tante, Patenkind"
          maxLength={MAX_ROLE_LENGTH}
          value={isStandardRole ? "" : relation.role}
          onChange={(e) => onRoleChange(e.target.value)}
          disabled={disabled}
          aria-label={`Andere Rolle für Beziehung ${index + 1}`}
          className="h-11 rounded-ordilo-md"
          data-testid={`relationship-custom-role-${index}`}
        />
      )}

      {members.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            von (optional)
          </p>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={`Personen für Beziehung ${index + 1}`}
          >
            {members.map((member) => (
              <Chip
                key={member.id}
                label={member.name}
                selected={relation.member_ids.includes(member.id)}
                disabled={disabled}
                onClick={() => onToggleMember(member.id)}
                testId={`relationship-member-${index}-${member.id}`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onDone}
          disabled={disabled}
          data-testid={`relationship-done-${index}`}
          className="flex items-center gap-1 text-sm font-medium text-[var(--petrol)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Check className="size-4" />
          Fertig
        </button>
        {showRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            data-testid={`relationship-remove-open-${index}`}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <X className="size-3.5" />
            Entfernen
          </button>
        )}
      </div>
    </div>
  );
}

/** A single toggle chip, styled like the role chips. */
function Chip({
  label,
  selected,
  disabled,
  onClick,
  testId,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      data-testid={testId}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        selected
          ? "bg-[var(--petrol)] text-white"
          : "bg-secondary text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
