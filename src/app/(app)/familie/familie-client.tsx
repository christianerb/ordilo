"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, AlertTriangle, Loader2 } from "lucide-react";
import type { Database } from "@/types/database";
import { PersonCard } from "@/components/ordilo/person-card";
import { EmptyState } from "@/components/ordilo/empty-state";
import { MemberForm } from "@/components/ordilo/member-form";
import type { MemberFormValues } from "@/components/ordilo/member-form";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  addFamilyMember,
  updateFamilyMember,
  removeFamilyMember,
} from "./actions";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

/**
 * Props for the FamilieClient component.
 */
export interface FamilieClientProps {
  /** The family name (displayed as the page heading). */
  familyName: string;
  /** The initial list of family members (fetched server-side). */
  members: MemberRow[];
}

/**
 * Family Management Page (client component).
 *
 * Features:
 * - Shows the family name as a heading
 * - Lists all members as person cards (avatar, name, role, birthdate)
 * - Add member affordance (bottom sheet with form, name required)
 * - Edit member affordance (bottom sheet with pre-filled form)
 * - Remove member with German confirmation dialog
 * - Empty state when no members
 * - Person card click navigates to profile placeholder
 * - Changes persist (server actions + local state sync)
 *
 * All text in German.
 */
export function FamilieClient({ familyName, members }: FamilieClientProps) {
  const router = useRouter();

  // Local member list — synced with server after each mutation.
  const [memberList, setMemberList] = useState<MemberRow[]>(members);

  // Dialog/sheet open state
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);

  // The member being edited or removed (null when dialog is closed)
  const [editTarget, setEditTarget] = useState<MemberRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null);

  // Form + error state (shared between add and edit)
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Remove-specific state
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Reset all form error state. */
  const resetErrors = useCallback(() => {
    setValidationError(null);
    setServerError(null);
  }, []);

  // -------------------------------------------------------------------------
  // Add member
  // -------------------------------------------------------------------------

  const handleOpenAdd = useCallback(() => {
    resetErrors();
    setAddSheetOpen(true);
  }, [resetErrors]);

  const handleAddSubmit = useCallback(
    async (values: MemberFormValues) => {
      resetErrors();

      // Client-side guard: reject empty name before calling the server.
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
      });
      setIsSubmitting(false);

      if (!result.success) {
        setServerError(result.error);
        return;
      }

      // Success — add to local list and close the sheet.
      setMemberList((prev) => [...prev, result.data]);
      setAddSheetOpen(false);
    },
    [resetErrors],
  );

  // -------------------------------------------------------------------------
  // Edit member
  // -------------------------------------------------------------------------

  const handleOpenEdit = useCallback((member: MemberRow) => {
    resetErrors();
    setEditTarget(member);
    setEditSheetOpen(true);
  }, [resetErrors]);

  const handleEditSubmit = useCallback(
    async (values: MemberFormValues) => {
      if (!editTarget) return;
      resetErrors();

      // Client-side guard: reject empty name before calling the server.
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
      });
      setIsSubmitting(false);

      if (!result.success) {
        setServerError(result.error);
        return;
      }

      // Success — update local list and close the sheet.
      setMemberList((prev) =>
        prev.map((m) => (m.id === result.data.id ? result.data : m)),
      );
      setEditSheetOpen(false);
      setEditTarget(null);
    },
    [editTarget, resetErrors],
  );

  // -------------------------------------------------------------------------
  // Remove member
  // -------------------------------------------------------------------------

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

    // Success — remove from local list and close the dialog.
    setMemberList((prev) => prev.filter((m) => m.id !== removeTarget.id));
    setRemoveDialogOpen(false);
    setRemoveTarget(null);
  }, [removeTarget]);

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  const handleCardClick = useCallback(
    (memberId: string) => {
      router.push(`/familie/${memberId}`);
    },
    [router],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {familyName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {memberList.length === 0
            ? "Noch keine Familienmitglieder"
            : memberList.length === 1
              ? "1 Familienmitglied"
              : `${memberList.length} Familienmitglieder`}
        </p>
      </div>

      {/* Add member button */}
      <Button
        type="button"
        size="lg"
        onClick={handleOpenAdd}
        className="h-12 w-full rounded-ordilo-md text-base"
      >
        <UserPlus className="h-5 w-5" />
        Person hinzufügen
      </Button>

      {/* Member list or empty state */}
      {memberList.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Noch keine Familienmitglieder"
          description="Füge eine Person hinzu, um deinen Familienordner zu organisieren."
          actionLabel="Person hinzufügen"
          onAction={handleOpenAdd}
        />
      ) : (
        <div className="space-y-3">
          {memberList.map((member) => (
            <PersonCard
              key={member.id}
              name={member.name}
              role={member.role}
              birthdate={member.birthdate}
              avatarColor={member.avatar_color}
              onClick={() => handleCardClick(member.id)}
              onEdit={() => handleOpenEdit(member)}
              onRemove={() => handleOpenRemove(member)}
            />
          ))}
        </div>
      )}

      {/* Add member bottom sheet */}
      <Sheet open={addSheetOpen} onOpenChange={setAddSheetOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[85dvh] max-w-md overflow-y-auto rounded-t-ordilo-xl"
        >
          <SheetHeader>
            <SheetTitle>Person hinzufügen</SheetTitle>
            <SheetDescription>
              Gib einen Namen ein. Weitere Angaben sind optional.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <MemberForm
              submitLabel="Person hinzufügen"
              onSubmit={handleAddSubmit}
              isSubmitting={isSubmitting}
              validationError={validationError}
              serverError={serverError}
              onClearValidationError={() => setValidationError(null)}
              onClearServerError={() => setServerError(null)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit member bottom sheet */}
      <Sheet open={editSheetOpen} onOpenChange={setEditSheetOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[85dvh] max-w-md overflow-y-auto rounded-t-ordilo-xl"
        >
          <SheetHeader>
            <SheetTitlePersonCard>Bearbeiten</SheetTitlePersonCard>
            <SheetDescription>
              Ändere die Angaben dieser Person.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {editTarget && (
              <MemberForm
                key={editTarget.id}
                initialValues={{
                  name: editTarget.name,
                  role: editTarget.role ?? "",
                  birthdate: editTarget.birthdate ?? "",
                  avatar_color: editTarget.avatar_color ?? "",
                }}
                submitLabel="Änderungen speichern"
                onSubmit={handleEditSubmit}
                isSubmitting={isSubmitting}
                validationError={validationError}
                serverError={serverError}
                onClearValidationError={() => setValidationError(null)}
                onClearServerError={() => setServerError(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Remove confirmation dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent className="max-w-md rounded-ordilo-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div
                className="flex size-10 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: "var(--destructive)" }}
              >
                <AlertTriangle className="size-5 text-white" />
              </div>
              <div>
                <DialogTitle>Mitglied entfernen</DialogTitle>
                <DialogDescription>
                  Möchtest du{" "}
                  <span className="font-semibold text-foreground">
                    {removeTarget?.name}
                  </span>{" "}
                  wirklich entfernen?
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {removeError && (
            <div
              role="alert"
              className="rounded-ordilo-md border border-destructive/30 bg-destructive/5 px-4 py-3"
            >
              <p className="text-sm font-medium text-destructive">
                {removeError}
              </p>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              variant="destructive"
              size="lg"
              disabled={isRemoving}
              onClick={handleConfirmRemove}
              className="h-12 w-full rounded-ordilo-md"
            >
              {isRemoving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Wird entfernt…
                </>
              ) : (
                "Entfernen"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={isRemoving}
              onClick={() => setRemoveDialogOpen(false)}
              className="h-12 w-full rounded-ordilo-md"
            >
              Abbrechen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Small wrapper to avoid a naming clash with the DialogTitle import.
 * (SheetTitle is just DialogTitle under the hood, but we already import
 *  DialogTitle for the remove dialog. Using a local alias keeps the code
 *  readable.)
 */
function SheetTitlePersonCard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SheetTitle className="text-lg font-semibold">{children}</SheetTitle>
  );
}
