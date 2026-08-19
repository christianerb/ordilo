"use client";

import { useState } from "react";
import { ChevronRight, Plus, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  OrdiloDrawer,
  OrdiloDrawerBody,
  OrdiloDrawerHeader,
} from "@/components/ordilo/ordilo-drawer";
import { MemberAvatar } from "@/app/(app)/familie/member-avatar";
import { ROLE_CHIPS } from "@/components/ordilo/role-chips";
import { MAX_ROLE_LENGTH, type MemberRelation } from "@/lib/family/relations";

/** A person a relationship can point at. */
export interface RelationMemberOption {
  id: string;
  name: string;
  avatar_color?: string | null;
  photoUrl?: string | null;
}

export interface RelationshipListProps {
  /** The relations being edited, grouped by role (the stored shape). */
  value: MemberRelation[];
  /** Called with the full new list on every change. */
  onChange: (relations: MemberRelation[]) => void;
  /** The other members of the family. */
  members: RelationMemberOption[];
  /** The name of the person being edited, for the picker's wording. */
  subjectName?: string;
  /** Whether the list is disabled (e.g. while submitting). */
  disabled?: boolean;
}

/** One row of the list: a person and the role the edited member has to them. */
interface PersonRelation {
  memberId: string;
  role: string;
}

/**
 * Relationship List — one row per person, with the role as a chip.
 *
 * People, not roles, are what the eye scans: a row of faces answers "who is
 * this person to us" faster than a list of roles with names attached. Each
 * person appears once; tapping the row picks the role ("Karina ist … von
 * Hanna"). Roles without a counterpart — the first person in a family, a
 * grandma whose grandchildren are not in Ordilo yet — live in their own row
 * above the list.
 *
 * The other side of a relationship is filled in on save (see
 * `saveMemberRelations`), so nobody types it twice.
 */
export function RelationshipList({
  value,
  onChange,
  members,
  subjectName,
  disabled = false,
}: RelationshipListProps) {
  const [rolePickerFor, setRolePickerFor] = useState<string | null>(null);
  const [soloPickerOpen, setSoloPickerOpen] = useState(false);
  const [personPickerOpen, setPersonPickerOpen] = useState(false);

  const { personRelations, soloRoles, hidden } = splitRelations(value, members);
  const relatedIds = new Set(personRelations.map((r) => r.memberId));
  const addableMembers = members.filter((m) => !relatedIds.has(m.id));
  const memberById = new Map(members.map((m) => [m.id, m]));

  const commit = (persons: PersonRelation[], solos: string[]) => {
    onChange(mergeRelations(persons, solos, hidden));
  };

  const setRoleFor = (memberId: string, role: string) => {
    const index = personRelations.findIndex((r) => r.memberId === memberId);
    const next = [...personRelations];
    if (!role.trim()) {
      if (index >= 0) next.splice(index, 1);
    } else if (index >= 0) {
      // In place: the first relationship is the person's primary role, so
      // re-picking a role must not shuffle an unrelated one to the front.
      next[index] = { memberId, role: role.trim() };
    } else {
      next.push({ memberId, role: role.trim() });
    }
    commit(next, soloRoles);
  };

  const removePerson = (memberId: string) => {
    commit(
      personRelations.filter((r) => r.memberId !== memberId),
      soloRoles,
    );
  };

  const setSoloRole = (role: string) => {
    commit(personRelations, role.trim() ? [role.trim()] : []);
  };

  const activeRole =
    rolePickerFor !== null
      ? personRelations.find((r) => r.memberId === rolePickerFor)?.role ?? ""
      : "";
  const pickerMember = rolePickerFor ? memberById.get(rolePickerFor) : undefined;

  return (
    <div className="space-y-3" data-testid="relationship-list">
      {/* A role with nobody to point at. The whole story for the first
          person in a family — and still the only way to say "Oma" when the
          grandchildren are not in Ordilo, so it stays available for
          everyone. */}
      <RoleRow
        label="Rolle in der Familie"
        role={soloRoles[0] ?? ""}
        disabled={disabled}
        onOpen={() => setSoloPickerOpen(true)}
      />

      {personRelations.length > 0 && (
        <ul className="overflow-hidden rounded-ordilo-md border border-border bg-card">
          {personRelations.map((relation, index) => {
            const member = memberById.get(relation.memberId);
            if (!member) return null;
            return (
              <li
                key={relation.memberId}
                className={cn(index > 0 && "border-t border-border/60")}
              >
                <button
                  type="button"
                  onClick={() => setRolePickerFor(relation.memberId)}
                  disabled={disabled}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/30 focus-ring"
                  data-testid={`relationship-row-${relation.memberId}`}
                  aria-label={`${member.name}: ${relation.role}. Beziehung ändern`}
                >
                  <MemberAvatar
                    name={member.name}
                    color={member.avatar_color ?? null}
                    photoUrl={member.photoUrl ?? undefined}
                    sizeClass="size-9"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {member.name}
                  </span>
                  <span className="shrink-0 rounded-full bg-[var(--petrol)]/10 px-2.5 py-1 text-xs font-medium text-[var(--petrol)]">
                    {relation.role}
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground/60"
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {personRelations.length === 0 && members.length > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="relationship-empty">
          Noch keine Beziehung eingetragen.
        </p>
      )}

      {addableMembers.length > 0 && (
        <button
          type="button"
          onClick={() => setPersonPickerOpen(true)}
          disabled={disabled}
          data-testid="relationship-add"
          className="flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-medium text-[var(--petrol)] transition-colors hover:bg-accent/40 focus-ring disabled:opacity-50"
        >
          <Plus className="size-4" aria-hidden="true" />
          Beziehung hinzufügen
        </button>
      )}

      {personRelations.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Beziehungen gelten für beide Seiten — die andere Person bekommt sie
          automatisch.
        </p>
      )}

      {/* Pick the person a new relationship points at. */}
      <PickerSheet
        open={personPickerOpen}
        onOpenChange={setPersonPickerOpen}
        title="Wer ist es?"
        description="Wähle die Person, zu der die Beziehung besteht."
      >
        <ul className="space-y-1">
          {addableMembers.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => {
                  setPersonPickerOpen(false);
                  setRolePickerFor(member.id);
                }}
                data-testid={`relationship-pick-${member.id}`}
                className="flex w-full items-center gap-3 rounded-ordilo-sm px-2 py-2 text-left transition-colors hover:bg-accent/40 focus-ring"
              >
                <MemberAvatar
                  name={member.name}
                  color={member.avatar_color ?? null}
                  photoUrl={member.photoUrl ?? undefined}
                  sizeClass="size-9"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {member.name}
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground/60"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      </PickerSheet>

      {/* Pick the role towards one person. */}
      <PickerSheet
        open={rolePickerFor !== null}
        onOpenChange={(open) => !open && setRolePickerFor(null)}
        title={pickerMember ? `Beziehung zu ${pickerMember.name}` : "Beziehung"}
        description={
          pickerMember
            ? `${subjectName?.trim() || "Diese Person"} ist … von ${pickerMember.name}.`
            : ""
        }
      >
        <RolePicker
          role={activeRole}
          onPick={(role) => {
            if (rolePickerFor) setRoleFor(rolePickerFor, role);
            setRolePickerFor(null);
          }}
          onRemove={
            activeRole
              ? () => {
                  if (rolePickerFor) removePerson(rolePickerFor);
                  setRolePickerFor(null);
                }
              : undefined
          }
          removeLabel="Beziehung entfernen"
          testIdPrefix="role"
        />
      </PickerSheet>

      {/* Pick the role that points at nobody. */}
      <PickerSheet
        open={soloPickerOpen}
        onOpenChange={setSoloPickerOpen}
        title="Rolle in der Familie"
        description={`Ohne Bezug auf eine bestimmte Person — z. B. „Oma“.`}
      >
        <RolePicker
          role={soloRoles[0] ?? ""}
          onPick={(role) => {
            setSoloRole(role);
            setSoloPickerOpen(false);
          }}
          onRemove={
            soloRoles.length > 0
              ? () => {
                  setSoloRole("");
                  setSoloPickerOpen(false);
                }
              : undefined
          }
          removeLabel="Rolle entfernen"
          testIdPrefix="solo-role"
        />
      </PickerSheet>
    </div>
  );
}

/** The "Rolle in der Familie" row — same shape as a person row, no face. */
function RoleRow({
  label,
  role,
  disabled,
  onOpen,
}: {
  label: string;
  role: string;
  disabled: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-ordilo-md border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/30 focus-ring"
      data-testid="relationship-solo-row"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--sand-warm)]">
        <Users className="size-4 text-muted-foreground" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {label}
      </span>
      {role ? (
        <span className="shrink-0 rounded-full bg-[var(--petrol)]/10 px-2.5 py-1 text-xs font-medium text-[var(--petrol)]">
          {role}
        </span>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">Wählen</span>
      )}
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground/60"
        aria-hidden="true"
      />
    </button>
  );
}

/** Role chips plus a free-text field, shown inside a picker sheet. */
function RolePicker({
  role,
  onPick,
  onRemove,
  removeLabel,
  testIdPrefix,
}: {
  role: string;
  onPick: (role: string) => void;
  onRemove?: () => void;
  removeLabel: string;
  testIdPrefix: string;
}) {
  const isStandard = (ROLE_CHIPS as readonly string[]).includes(role);
  const [customOpen, setCustomOpen] = useState(role !== "" && !isStandard);
  const [customRole, setCustomRole] = useState(isStandard ? "" : role);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Rolle wählen">
        {ROLE_CHIPS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onPick(option)}
            aria-pressed={role === option}
            data-testid={`${testIdPrefix}-chip-${option}`}
            className={cn(
              "rounded-full px-3.5 py-2 text-sm font-medium transition-colors focus-ring",
              role === option
                ? "bg-[var(--petrol)] text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {option}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustomOpen((open) => !open)}
          aria-pressed={customOpen}
          data-testid={`${testIdPrefix}-chip-custom`}
          className={cn(
            "rounded-full px-3.5 py-2 text-sm font-medium transition-colors focus-ring",
            customOpen
              ? "bg-[var(--petrol)] text-white"
              : "bg-secondary text-muted-foreground hover:text-foreground",
          )}
        >
          Andere
        </button>
      </div>

      {customOpen && (
        <div className="flex gap-2">
          <Input
            type="text"
            autoComplete="off"
            placeholder="z. B. Patentante"
            maxLength={MAX_ROLE_LENGTH}
            value={customRole}
            onChange={(e) => setCustomRole(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customRole.trim()) {
                e.preventDefault();
                onPick(customRole);
              }
            }}
            aria-label="Andere Rolle"
            className="h-11 rounded-ordilo-md"
            data-testid={`${testIdPrefix}-custom-input`}
          />
          <button
            type="button"
            onClick={() => customRole.trim() && onPick(customRole)}
            disabled={!customRole.trim()}
            data-testid={`${testIdPrefix}-custom-confirm`}
            className="h-11 shrink-0 rounded-ordilo-md bg-[var(--petrol)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-ring disabled:opacity-40"
          >
            Übernehmen
          </button>
        </div>
      )}

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          data-testid={`${testIdPrefix}-remove`}
          className="flex items-center gap-1.5 text-sm font-medium text-destructive transition-opacity hover:opacity-80 focus-ring"
        >
          <X className="size-4" />
          {removeLabel}
        </button>
      )}
    </div>
  );
}

/** A bottom sheet used for the two pickers. */
function PickerSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <OrdiloDrawer variant="form" open={open} onOpenChange={onOpenChange}>
      <OrdiloDrawerHeader title={title} description={description} />
      <OrdiloDrawerBody>{children}</OrdiloDrawerBody>
    </OrdiloDrawer>
  );
}

/**
 * Turns the stored role-per-entry shape into one entry per person (plus the
 * roles that point at nobody). A person listed under two roles keeps the
 * first — the list shows one role per face.
 *
 * Relations pointing at people this list has never heard of (a member list
 * that failed to load) are handed back as `hidden` so `mergeRelations` can
 * put them back: what cannot be shown must still not be deleted.
 */
function splitRelations(
  relations: MemberRelation[],
  members: RelationMemberOption[],
): {
  personRelations: PersonRelation[];
  soloRoles: string[];
  hidden: MemberRelation[];
} {
  const known = new Set(members.map((m) => m.id));
  const personRelations: PersonRelation[] = [];
  const seen = new Set<string>();
  const soloRoles: string[] = [];
  const hidden: MemberRelation[] = [];

  for (const relation of relations) {
    const role = relation.role.trim();
    if (!role) continue;
    const targets = relation.member_ids.filter((id) => known.has(id));
    const unknownTargets = relation.member_ids.filter((id) => !known.has(id));
    if (unknownTargets.length > 0) {
      hidden.push({ role, member_ids: unknownTargets });
    }
    if (targets.length === 0) {
      if (relation.member_ids.length === 0 && !soloRoles.includes(role)) {
        soloRoles.push(role);
      }
      continue;
    }
    for (const memberId of targets) {
      if (seen.has(memberId)) continue;
      seen.add(memberId);
      personRelations.push({ memberId, role });
    }
  }

  return { personRelations, soloRoles, hidden };
}

/** Turns the per-person rows back into the stored role-grouped shape. */
function mergeRelations(
  personRelations: PersonRelation[],
  soloRoles: string[],
  hidden: MemberRelation[] = [],
): MemberRelation[] {
  const byRole = new Map<string, MemberRelation>();

  const add = (role: string, memberIds: string[]) => {
    const key = role.trim().toLowerCase();
    const existing = byRole.get(key);
    if (existing) {
      for (const id of memberIds) {
        if (!existing.member_ids.includes(id)) existing.member_ids.push(id);
      }
    } else {
      byRole.set(key, { role: role.trim(), member_ids: [...memberIds] });
    }
  };

  for (const role of soloRoles) {
    if (role.trim()) add(role, []);
  }

  for (const { memberId, role } of personRelations) {
    add(role, [memberId]);
  }

  // People the list could not render keep their relationships.
  for (const relation of hidden) {
    add(relation.role, relation.member_ids);
  }

  return [...byRole.values()];
}
