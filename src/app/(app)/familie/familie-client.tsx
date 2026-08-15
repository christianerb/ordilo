"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ChevronRight,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/types/database";
import type { MemberFormValues } from "@/components/ordilo/member-form";
import { Button } from "@/components/ui/button";
import { CardActions } from "@/components/ordilo/card-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addFamilyMember,
  removeFamilyMember,
  updateFamilyMember,
} from "./actions";
import { getFamilyCardWash } from "./family-card-colors";
import { FamilyBanner } from "./family-banner";
import { FamilyFilterTabs } from "./family-filter-tabs";
import type { FamilyFilter } from "./family-filters";
import { isChildMember } from "./family-filters";
import { FamilyMemberCard } from "./family-member-card";
import { FamilyMemberSheet } from "./family-member-sheet";
import { MemberAvatar } from "./member-avatar";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

export interface FamilieClientProps {
  familyName: string;
  members: MemberRow[];
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
  const [memberList, setMemberList] = useState<MemberRow[]>(members);
  const [photoUrlMap, setPhotoUrlMap] = useState<Record<string, string>>(photoUrls);
  const [filter, setFilter] = useState<FamilyFilter>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MemberRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null);
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
        role: values.role || undefined,
        birthdate: values.birthdate || undefined,
        avatar_color: values.avatar_color || undefined,
        related_member_ids: values.related_member_ids,
        relationship_label: values.relationship_label || undefined,
      });
      setIsSubmitting(false);
      if (!result.success) {
        setServerError(result.error);
        return;
      }
      setMemberList((prev) => [...prev, result.data]);
      setAddSheetOpen(false);
      toast.success(`${result.data.name} ist dabei`);
    },
    [resetErrors],
  );

  const handleOpenEdit = useCallback((member: MemberRow) => {
    resetErrors();
    setEditTarget(member);
    setEditSheetOpen(true);
  }, [resetErrors]);

  const handlePhotoChange = useCallback((memberId: string, url: string | null) => {
    setPhotoUrlMap((prev) => {
      if (url) return { ...prev, [memberId]: url };
      const next = { ...prev };
      delete next[memberId];
      return next;
    });
  }, []);

  const handleEditSubmit = useCallback(
    async (values: MemberFormValues) => {
      if (!editTarget) return;
      resetErrors();
      if (!values.name.trim()) {
        setValidationError("Bitte einen Namen eingeben");
        return;
      }
      setIsSubmitting(true);
      const result = await updateFamilyMember(editTarget.id, {
        name: values.name,
        role: values.role || undefined,
        birthdate: values.birthdate || undefined,
        avatar_color: values.avatar_color || undefined,
        related_member_ids: values.related_member_ids,
        relationship_label: values.relationship_label || undefined,
      });
      setIsSubmitting(false);
      if (!result.success) {
        setServerError(result.error);
        return;
      }
      setMemberList((prev) =>
        prev.map((m) => (m.id === result.data.id ? result.data : m)),
      );
      setEditSheetOpen(false);
      setEditTarget(null);
      toast.success("Gespeichert");
    },
    [editTarget, resetErrors],
  );

  const handleOpenRemove = useCallback((member: MemberRow) => {
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
  }, [removeTarget]);

  if (fetchError) {
    return (
      <div
        data-testid="familie-fetch-error"
        className="flex flex-col items-center justify-center px-6 py-16 text-center"
      >
        <AlertCircle className="size-7 text-muted-foreground" strokeWidth={1.5} />
        <p className="mt-3 text-sm text-muted-foreground">
          Daten konnten nicht geladen werden.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.refresh()}
          className="mt-4"
        >
          <RefreshCw className="size-4" />
          Erneut versuchen
        </Button>
      </div>
    );
  }

  const filteredMembers = memberList.filter((member) => {
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
            <button
              type="button"
              onClick={() => setViewMode((mode) => (mode === "grid" ? "list" : "grid"))}
              aria-label={
                viewMode === "grid" ? "Als Liste anzeigen" : "Als Kacheln anzeigen"
              }
              title={
                viewMode === "grid" ? "Als Liste anzeigen" : "Als Kacheln anzeigen"
              }
              className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              data-testid="family-view-toggle"
            >
              <SlidersHorizontal className="size-4.5" aria-hidden="true" />
            </button>
          </div>

          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 gap-3" data-testid="member-list">
              {filteredMembers.map((member, index) => (
                <FamilyMemberCard
                  key={member.id}
                  member={member}
                  wash={getFamilyCardWash(index)}
                  photoUrl={photoUrlMap[member.id]}
                  documentCount={documentCounts[member.id] ?? 0}
                  onOpen={() => router.push(`/familie/${member.id}`)}
                  onEdit={() => handleOpenEdit(member)}
                  onRemove={() => handleOpenRemove(member)}
                />
              ))}
            </div>
          ) : (
            <div
              className="divide-y divide-border rounded-ordilo-sm border border-border bg-[var(--surface-story)] stagger-children"
              data-testid="member-list"
            >
              {filteredMembers.map((member) => {
                const docCount = documentCounts[member.id] ?? 0;
                // The relationship (who this person is related to, e.g. "von
                // Emma, Hanna") stays on the profile page, which has room for
                // it — squeezed into this compact row it made the line too
                // crowded, so only the relationship label itself shows here.
                const meta = [
                  member.role,
                  member.relationship_label,
                  docCount > 0
                    ? docCount === 1
                      ? "1 Dokument"
                      : `${docCount} Dokumente`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <div
                    key={member.id}
                    className="group flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-accent/20"
                    data-testid="member-row"
                  >
                    <button
                      type="button"
                      onClick={() => router.push(`/familie/${member.id}`)}
                      className="flex flex-1 items-center gap-2.5 rounded-ordilo-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      aria-label={`${member.name} öffnen`}
                    >
                      <MemberAvatar
                        name={member.name}
                        color={member.avatar_color}
                        photoUrl={photoUrlMap[member.id]}
                        sizeClass="size-8"
                      />
                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-medium text-foreground">
                          {member.name}
                        </p>
                        {meta && (
                          <p className="truncate text-xs text-muted-foreground">
                            {meta}
                          </p>
                        )}
                      </div>
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground/40 transition-opacity opacity-0 group-hover:opacity-100"
                        aria-hidden="true"
                      />
                    </button>

                    <CardActions
                      onEdit={() => handleOpenEdit(member)}
                      onDelete={() => handleOpenRemove(member)}
                      testId="person-card-actions"
                    />
                  </div>
                );
              })}
            </div>
          )}

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
        className="flex w-full flex-col items-center justify-center gap-0.5 rounded-ordilo-sm border border-dashed border-border px-3 py-4 text-center transition-colors hover:border-[var(--petrol)]/40 hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 press-scale animate-card-in"
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
        otherMembers={memberList}
      />

      {editTarget && (
        <FamilyMemberSheet
          open={editSheetOpen}
          onOpenChange={setEditSheetOpen}
          title="Bearbeiten"
          description="Ändere die Angaben dieser Person."
          submitLabel="Speichern"
          onSubmit={handleEditSubmit}
          isSubmitting={isSubmitting}
          validationError={validationError}
          serverError={serverError}
          onClearValidationError={() => setValidationError(null)}
          onClearServerError={() => setServerError(null)}
          otherMembers={memberList}
          formKey={editTarget.id}
          initialValues={{
            name: editTarget.name,
            role: editTarget.role ?? "",
            birthdate: editTarget.birthdate ?? "",
            avatar_color: editTarget.avatar_color ?? "",
            related_member_ids: editTarget.related_member_ids ?? [],
            relationship_label: editTarget.relationship_label ?? "",
          }}
          memberId={editTarget.id}
          photoUrl={photoUrlMap[editTarget.id] ?? null}
          onPhotoChange={(url) => handlePhotoChange(editTarget.id, url)}
        />
      )}

      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent className="max-w-md rounded-ordilo-md">
          <DialogHeader>
            <DialogTitle>Person entfernen</DialogTitle>
            <DialogDescription>
              Möchtest du{" "}
              <span className="font-semibold text-foreground">
                {removeTarget?.name}
              </span>{" "}
              wirklich entfernen?
            </DialogDescription>
          </DialogHeader>

          {removeError && (
            <div
              role="alert"
              className="rounded-ordilo-sm border border-destructive/30 bg-destructive/5 px-3 py-2"
            >
              <p className="text-sm font-medium text-destructive">{removeError}</p>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              variant="destructive"
              disabled={isRemoving}
              onClick={handleConfirmRemove}
              className="w-full"
            >
              {isRemoving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Wird entfernt…
                </>
              ) : (
                "Entfernen"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isRemoving}
              onClick={() => setRemoveDialogOpen(false)}
              className="w-full"
            >
              Abbrechen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
