"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import type { MemberFormValues } from "@/components/ordilo/member-form";
import { nameMap } from "@/lib/family/relations";
import { cn } from "@/lib/utils";
import { FILTER_ACTIVE } from "@/lib/ui-styles";
import { MoreFiltersButton } from "@/components/ordilo/more-filters-button";
import { ErrorState } from "@/components/ordilo/error-state";
import { ConfirmAction } from "@/components/ordilo/confirm-action";
import {
  addFamilyMember,
  removeFamilyMember,
  type MemberWithRelations,
} from "./actions";
import { getFamilyCardWash } from "./family-card-colors";
import { FamilyBanner } from "./family-banner";
import { FamilyFilterTabs } from "./family-filter-tabs";
import type { FamilyFilter } from "./family-filters";
import { isChildMember } from "./family-filters";
import { FamilyMemberCard } from "./family-member-card";
import { FamilyMemberSheet } from "./family-member-sheet";

export interface FamilieClientProps {
  familyName: string;
  members: MemberWithRelations[];
  documentCounts?: Record<string, number>;
  /** Signed URLs for members that have an uploaded photo, keyed by member ID. */
  photoUrls?: Record<string, string>;
  fetchError?: boolean;
}

export function FamilieClient({
  familyName,
  members,
  documentCounts = {},
  photoUrls = {},
  fetchError = false,
}: FamilieClientProps) {
  const router = useRouter();
  // The list is held locally so an add or a remove shows up immediately,
  // but the server has the last word: a relationship also changes the OTHER
  // person's role and relationship line, and `router.refresh()` only
  // re-renders the server component — state initialized once would keep
  // showing the counterpart as they were. Adjusting it during render is
  // React's sanctioned answer to "a prop changed" (no effect involved).
  const [memberList, setMemberList] = useState<MemberWithRelations[]>(members);
  const [renderedMembers, setRenderedMembers] = useState(members);
  if (renderedMembers !== members) {
    setRenderedMembers(members);
    setMemberList(members);
  }
  // Photos are resolved on the server; they only change on the edit page,
  // which re-renders this one on the way back.
  const photoUrlMap = photoUrls;
  const [filter, setFilter] = useState<FamilyFilter>("all");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [documentsOnly, setDocumentsOnly] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MemberWithRelations | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const resetErrors = useCallback(() => {
    setValidationError(null);
    setServerError(null);
  }, []);

  const handleAddSubmit = useCallback(
    async (values: MemberFormValues) => {
      resetErrors();
      if (!values.name.trim()) {
        setValidationError("Bitte einen Namen eingeben");
        return;
      }
      setIsSubmitting(true);
      const result = await addFamilyMember({
        name: values.name,
        birthdate: values.birthdate || undefined,
        avatar_color: values.avatar_color || undefined,
        relations: values.relations,
      });
      setIsSubmitting(false);
      if (!result.success) {
        setServerError(result.error);
        return;
      }
      setMemberList((prev) => [...prev, result.data]);
      setAddSheetOpen(false);
      toast.success(`${result.data.name} ist dabei`);
      // A new relationship also lands on the other person (their role, their
      // relationship line, which filter tab they belong to) — only the
      // server knows their new state.
      router.refresh();
    },
    [resetErrors, router],
  );

  // Editing a person is a page of its own — a photo, the basics and a list
  // of relationships never fit a bottom sheet.
  const handleOpenEdit = useCallback(
    (member: MemberWithRelations) => {
      router.push(`/familie/${member.id}/bearbeiten`);
    },
    [router],
  );

  const handleOpenRemove = useCallback((member: MemberWithRelations) => {
    setRemoveError(null);
    setRemoveTarget(member);
    setRemoveDialogOpen(true);
  }, []);

  const handleConfirmRemove = useCallback(async () => {
    if (!removeTarget) return;
    setIsRemoving(true);
    const result = await removeFamilyMember(removeTarget.id);
    setIsRemoving(false);
    if (!result.success) {
      setRemoveError(result.error);
      return;
    }
    setMemberList((prev) => prev.filter((m) => m.id !== removeTarget.id));
    setRemoveDialogOpen(false);
    setRemoveTarget(null);
    toast.success(`${removeTarget.name} ist nicht mehr dabei`);
    // Removing a person takes the others' relationships to them with it,
    // and with those their roles — only the server knows the new state.
    router.refresh();
  }, [removeTarget, router]);

  if (fetchError) {
    return (
      <ErrorState
        title="Daten konnten nicht geladen werden."
        onRetry={() => router.refresh()}
        testId="familie-fetch-error"
        variant="simple"
      />
    );
  }

  // Keyed off the member's position in the unfiltered list so a person's
  // card color stays stable as filters are applied, instead of reshuffling
  // whenever the filtered array's indices shift.
  const washByMemberId = new Map(
    memberList.map((member, index) => [member.id, getFamilyCardWash(index)]),
  );

  // Names of everyone in the family, so a card can render "Mutter von Emma".
  const memberNames = nameMap(memberList);

  // The people a new member can be related to, with their faces.
  const relationOptions = memberList.map((member) => ({
    id: member.id,
    name: member.name,
    avatar_color: member.avatar_color,
    photoUrl: photoUrlMap[member.id] ?? null,
  }));

  const filteredMembers = memberList.filter((member) => {
    if (documentsOnly && (documentCounts[member.id] ?? 0) === 0) return false;
    if (filter === "all") return true;
    return filter === "children" ? isChildMember(member) : !isChildMember(member);
  });

  return (
    <div className="app-page-stack">
      <FamilyBanner
        familyName={familyName}
        members={memberList}
        photoUrls={photoUrlMap}
      />

      {memberList.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <FamilyFilterTabs value={filter} onChange={setFilter} />
            <MoreFiltersButton
              active={moreFiltersOpen || documentsOnly}
              open={moreFiltersOpen}
              onClick={() => setMoreFiltersOpen((open) => !open)}
              testId="family-more-filters"
            />
          </div>

          {moreFiltersOpen && (
            <div
              className="flex flex-wrap items-center gap-2 rounded-ordilo-md border border-border bg-card p-3 shadow-card"
              data-testid="family-filter-panel"
            >
              <button
                type="button"
                onClick={() => setDocumentsOnly((only) => !only)}
                aria-pressed={documentsOnly}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium transition-colors focus-ring",
                  documentsOnly
                    ? FILTER_ACTIVE
                    : "border-border bg-[var(--sand)] text-muted-foreground hover:text-foreground",
                )}
                data-testid="family-filter-documents-only"
              >
                Nur mit Dokumenten
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4" data-testid="member-list">
            {filteredMembers.map((member) => (
              <FamilyMemberCard
                key={member.id}
                member={member}
                relations={member.relations}
                memberNames={memberNames}
                wash={washByMemberId.get(member.id) ?? getFamilyCardWash(0)}
                photoUrl={photoUrlMap[member.id]}
                documentCount={documentCounts[member.id] ?? 0}
                onOpen={() => router.push(`/familie/${member.id}`)}
                onEdit={() => handleOpenEdit(member)}
                onRemove={() => handleOpenRemove(member)}
              />
            ))}
          </div>

          {filteredMembers.length === 0 && (
            <p className="pt-2 text-center text-sm text-muted-foreground">
              Niemand in dieser Ansicht.
            </p>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => {
          resetErrors();
          setAddSheetOpen(true);
        }}
        className="flex w-full flex-col items-center justify-center gap-0.5 rounded-ordilo-sm border border-dashed border-border px-3 py-4 text-center transition-colors hover:border-[var(--petrol)]/40 hover:bg-accent/20 focus-ring press-scale animate-card-in"
        style={{ animationDelay: "100ms" }}
        data-testid="add-member-button"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <UserPlus className="size-4" aria-hidden="true" />
          Person hinzufügen
        </span>
        <span className="text-xs text-muted-foreground/70">
          Neues Familienmitglied einladen
        </span>
      </button>

      {memberList.length === 0 && (
        <p
          className="pt-2 text-center text-sm text-muted-foreground"
          data-testid="familie-empty"
        >
          Noch niemand hier. Füge die erste Person hinzu — Ordilo erkennt sie dann automatisch auf gescannten Dokumenten.
        </p>
      )}

      <FamilyMemberSheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        title="Person hinzufügen"
        description="Gib einen Namen ein. Weitere Angaben sind optional."
        submitLabel="Hinzufügen"
        onSubmit={handleAddSubmit}
        isSubmitting={isSubmitting}
        validationError={validationError}
        serverError={serverError}
        onClearValidationError={() => setValidationError(null)}
        onClearServerError={() => setServerError(null)}
        otherMembers={relationOptions}
      />

      <ConfirmAction
        variant="dialog"
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        title="Person entfernen"
        description={
          <>
            Möchtest du{" "}
            <span className="font-semibold text-foreground">
              {removeTarget?.name}
            </span>{" "}
            wirklich entfernen?
          </>
        }
        confirmLabel="Entfernen"
        loadingLabel="Wird entfernt…"
        loading={isRemoving}
        error={removeError}
        onConfirm={handleConfirmRemove}
      />
    </div>
  );
}
