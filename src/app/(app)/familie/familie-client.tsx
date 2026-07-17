"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronRight, Loader2, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/types/database";
import type { MemberFormValues } from "@/components/ordilo/member-form";
import { Button } from "@/components/ui/button";
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
  addInventoryItem,
  confirmSuggestedInventoryItem,
  removeFamilyMember,
  removeInventoryItem,
  updateFamilyMember,
} from "./actions";
import { FamilyBanner } from "./family-banner";
import { InviteCard } from "@/components/ordilo/invite-card";
import { FamilyInventoryPanel } from "./family-inventory-panel";
import { FamilyMemberRowMenu } from "./family-member-row-menu";
import { FamilyMemberSheet } from "./family-member-sheet";
import { type InventoryItemDisplay } from "./inventory-shared";
import { MemberAvatar } from "./member-avatar";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

export interface FamilieClientProps {
  familyName: string;
  members: MemberRow[];
  documentCounts?: Record<string, number>;
  inventoryItems?: InventoryItemDisplay[];
  /** Signed URLs for members that have an uploaded photo, keyed by member ID. */
  photoUrls?: Record<string, string>;
  fetchError?: boolean;
}

export function FamilieClient({
  familyName,
  members,
  documentCounts = {},
  inventoryItems = [],
  photoUrls = {},
  fetchError = false,
}: FamilieClientProps) {
  const router = useRouter();
  const [memberList, setMemberList] = useState<MemberRow[]>(members);
  const [photoUrlMap, setPhotoUrlMap] = useState<Record<string, string>>(photoUrls);
  const [inventoryList, setInventoryList] = useState<InventoryItemDisplay[]>(inventoryItems);
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

  // Inventory state
  const [inventorySheetOpen, setInventorySheetOpen] = useState(false);
  const [invName, setInvName] = useState("");
  const [invType, setInvType] = useState("vehicle");
  const [invMember, setInvMember] = useState("");
  const [invTags, setInvTags] = useState<string[]>([]);
  const [invSubmitting, setInvSubmitting] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);
  const [invDeleteId, setInvDeleteId] = useState<string | null>(null);

  const resetInvForm = useCallback(() => {
    setInvName("");
    setInvType("vehicle");
    setInvMember("");
    setInvTags([]);
    setInvError(null);
  }, []);

  const handleAddInventory = useCallback(async () => {
    if (!invName.trim()) {
      setInvError("Bitte einen Namen eingeben.");
      return;
    }
    setInvSubmitting(true);
    const result = await addInventoryItem({
      name: invName.trim(),
      item_type: invType,
      tags: invTags,
      linked_member_id: invMember || null,
    });
    setInvSubmitting(false);
    if (!result.success) {
      setInvError(result.error);
      return;
    }
    setInventoryList((prev) => [
      {
        id: result.data.id,
        name: result.data.name,
        item_type: result.data.item_type,
        tags: result.data.tags ?? [],
        linked_member_id: result.data.linked_member_id ?? null,
        status: result.data.status,
      },
      ...prev,
    ]);
    setInventorySheetOpen(false);
    resetInvForm();
    toast.success(`${result.data.name} ist dabei`);
  }, [invName, invType, invTags, invMember, resetInvForm]);

  const handleRemoveInventory = useCallback(async (id: string) => {
    const result = await removeInventoryItem(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setInventoryList((prev) => prev.filter((i) => i.id !== id));
    setInvDeleteId(null);
    toast.success("Entfernt");
  }, []);

  const handleConfirmSuggested = useCallback(async (id: string) => {
    const result = await confirmSuggestedInventoryItem(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setInventoryList((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "confirmed" } : i)),
    );
    toast.success(`${result.data.name} bestätigt`);
  }, []);

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
        related_member_id: values.related_member_id || undefined,
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
        related_member_id: values.related_member_id || undefined,
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
    toast.success(`${removeTarget.name} wurde entfernt`);
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

  return (
    <div className="app-page-stack">
      <FamilyBanner
        familyName={familyName}
        members={memberList}
        photoUrls={photoUrlMap}
      />

      <InviteCard />

      {memberList.length > 0 && (
        <div
          className="divide-y divide-border rounded-ordilo-sm border border-border bg-[var(--surface-story)] stagger-children"
          data-testid="member-list"
        >
          {memberList.map((member) => {
            const docCount = documentCounts[member.id] ?? 0;
            const relatedMember = member.related_member_id
              ? memberList.find((m) => m.id === member.related_member_id)
              : null;
            const relationship =
              relatedMember && member.relationship_label
                ? `${member.relationship_label} von ${relatedMember.name}`
                : null;
            const meta = [
              member.role,
              relationship,
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

                <FamilyMemberRowMenu
                  onEdit={() => handleOpenEdit(member)}
                  onRemove={() => handleOpenRemove(member)}
                />
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          resetErrors();
          setAddSheetOpen(true);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-ordilo-sm border border-dashed border-border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-[var(--petrol)]/40 hover:bg-accent/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 press-scale animate-card-in"
        style={{ animationDelay: "100ms" }}
        data-testid="add-member-button"
      >
        <UserPlus className="size-4" aria-hidden="true" />
        Person hinzufügen
      </button>

      {memberList.length === 0 && (
        <p
          className="pt-2 text-center text-sm text-muted-foreground"
          data-testid="familie-empty"
        >
          Noch niemand hier. Füge die erste Person hinzu — Ordilo erkennt sie dann automatisch auf gescannten Dokumenten.
        </p>
      )}

      <FamilyInventoryPanel
        inventoryList={inventoryList}
        members={memberList}
        inventorySheetOpen={inventorySheetOpen}
        setInventorySheetOpen={setInventorySheetOpen}
        invName={invName}
        setInvName={setInvName}
        invType={invType}
        setInvType={setInvType}
        invMember={invMember}
        setInvMember={setInvMember}
        invTags={invTags}
        setInvTags={setInvTags}
        invSubmitting={invSubmitting}
        invError={invError}
        invDeleteId={invDeleteId}
        setInvDeleteId={setInvDeleteId}
        resetInvForm={resetInvForm}
        handleAddInventory={handleAddInventory}
        handleRemoveInventory={handleRemoveInventory}
        handleConfirmSuggested={handleConfirmSuggested}
      />

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
            related_member_id: editTarget.related_member_id ?? "",
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
