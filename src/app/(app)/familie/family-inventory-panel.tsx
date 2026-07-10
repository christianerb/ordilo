"use client";

import type { Dispatch, SetStateAction } from "react";
import { Check, Loader2, Package, Plus, Trash2 } from "lucide-react";
import { TagInput } from "@/components/ordilo/tag-input";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Database } from "@/types/database";
import {
  INVENTORY_ICONS,
  INVENTORY_LABELS,
  INVENTORY_TYPE_OPTIONS,
  type InventoryItemDisplay,
} from "./inventory-shared";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

export function FamilyInventoryPanel({
  inventoryList,
  members,
  inventorySheetOpen,
  setInventorySheetOpen,
  invName,
  setInvName,
  invType,
  setInvType,
  invMember,
  setInvMember,
  invTags,
  setInvTags,
  invSubmitting,
  invError,
  invDeleteId,
  setInvDeleteId,
  resetInvForm,
  handleAddInventory,
  handleRemoveInventory,
  handleConfirmSuggested,
}: {
  inventoryList: InventoryItemDisplay[];
  members: MemberRow[];
  inventorySheetOpen: boolean;
  setInventorySheetOpen: Dispatch<SetStateAction<boolean>>;
  invName: string;
  setInvName: Dispatch<SetStateAction<string>>;
  invType: string;
  setInvType: Dispatch<SetStateAction<string>>;
  invMember: string;
  setInvMember: Dispatch<SetStateAction<string>>;
  invTags: string[];
  setInvTags: Dispatch<SetStateAction<string[]>>;
  invSubmitting: boolean;
  invError: string | null;
  invDeleteId: string | null;
  setInvDeleteId: Dispatch<SetStateAction<string | null>>;
  resetInvForm: () => void;
  handleAddInventory: () => void | Promise<void>;
  handleRemoveInventory: (id: string) => void | Promise<void>;
  handleConfirmSuggested: (id: string) => void | Promise<void>;
}) {
  const suggestedItems = inventoryList.filter((item) => item.status === "suggested");
  const confirmedItems = inventoryList.filter((item) => item.status === "confirmed");

  return (
    <>
      {suggestedItems.length > 0 && (
        <div
          className="rounded-ordilo-sm border border-[var(--apricot)]/30 bg-[var(--apricot)]/[0.06] p-3 animate-card-in"
          data-testid="suggested-inventory-banner"
        >
          <p className="text-sm font-medium text-foreground">
            Ordilo hat etwas Neues erkannt
          </p>
          <div className="mt-2 space-y-1.5">
            {suggestedItems.map((item) => {
              const Icon = INVENTORY_ICONS[item.item_type] ?? Package;

              return (
                <div key={item.id} className="flex items-center gap-2">
                  <Icon className="size-4 shrink-0 text-[var(--apricot)]" strokeWidth={1.75} />
                  <span className="flex-1 text-sm text-foreground">{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {INVENTORY_LABELS[item.item_type] ?? "Sonstiges"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleConfirmSuggested(item.id)}
                    className="flex size-6 items-center justify-center rounded-ordilo-sm text-[var(--petrol)] transition-colors hover:bg-accent"
                    aria-label={`${item.name} bestätigen`}
                  >
                    <Check className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {confirmedItems.length > 0 && (
        <div className="space-y-2" data-testid="inventory-section">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">Inventar</h2>
            <button
              type="button"
              onClick={() => {
                resetInvForm();
                setInventorySheetOpen(true);
              }}
              className="flex items-center gap-1 text-xs font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)]"
            >
              <Plus className="size-3.5" />
              Hinzufügen
            </button>
          </div>
          <div className="divide-y divide-border rounded-ordilo-sm border border-border bg-card stagger-children">
            {confirmedItems.map((item) => {
              const Icon = INVENTORY_ICONS[item.item_type] ?? Package;
              const linkedMember = members.find((member) => member.id === item.linked_member_id);

              return (
                <div
                  key={item.id}
                  className="group flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-accent/20"
                  data-testid="inventory-row"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-ordilo-sm bg-[var(--petrol)]/8">
                    <Icon className="size-4 text-[var(--petrol)]" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {INVENTORY_LABELS[item.item_type] ?? "Sonstiges"}
                      {linkedMember && ` · ${linkedMember.name}`}
                    </p>
                  </div>
                  {item.tags.length > 0 && (
                    <div className="hidden shrink-0 gap-1 sm:flex">
                      {item.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-[var(--sand-warm)] px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setInvDeleteId(item.id)}
                    className="flex size-6 shrink-0 items-center justify-center rounded-ordilo-sm text-muted-foreground/40 transition-colors hover:bg-destructive/5 hover:text-destructive"
                    aria-label={`${item.name} entfernen`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {confirmedItems.length === 0 && suggestedItems.length === 0 && (
        <button
          type="button"
          onClick={() => {
            resetInvForm();
            setInventorySheetOpen(true);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-ordilo-sm border border-dashed border-border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-[var(--petrol)]/40 hover:bg-accent/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 press-scale"
          data-testid="add-inventory-button"
        >
          <Package className="size-4" aria-hidden="true" />
          Inventar hinzufügen
        </button>
      )}

      <Sheet open={inventorySheetOpen} onOpenChange={setInventorySheetOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[85dvh] max-w-md overflow-y-auto rounded-t-ordilo-xl"
        >
          <SheetHeader>
            <SheetTitle>Inventar hinzufügen</SheetTitle>
            <SheetDescription>
              Lege ein Auto, eine Versicherung oder ein anderes Objekt an. Ordilo erkennt es dann automatisch auf deinen Dokumenten.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-6">
            <div>
              <label className="text-sm font-medium text-foreground">Name</label>
              <input
                type="text"
                value={invName}
                onChange={(event) => setInvName(event.target.value)}
                placeholder="z.B. BMW X3, TK Krankenversicherung"
                className="mt-1 w-full rounded-ordilo-sm border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                data-testid="inv-name-input"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Typ</label>
              <select
                value={invType}
                onChange={(event) => setInvType(event.target.value)}
                className="mt-1 w-full appearance-none rounded-ordilo-sm border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                data-testid="inv-type-select"
              >
                {INVENTORY_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Person (optional)</label>
              <select
                value={invMember}
                onChange={(event) => setInvMember(event.target.value)}
                className="mt-1 w-full appearance-none rounded-ordilo-sm border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="">Keine Zuordnung</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Tags (optional)</label>
              <div className="mt-1">
                <TagInput
                  value={invTags}
                  onChange={setInvTags}
                  placeholder="z.B. Autokennzeichen, Versicherungsnummer"
                  testId="inv-tags"
                />
              </div>
            </div>
            {invError && (
              <p className="text-sm font-medium text-destructive">{invError}</p>
            )}
            <Button
              type="button"
              onClick={() => void handleAddInventory()}
              disabled={invSubmitting}
              className="w-full"
            >
              {invSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Wird hinzugefügt…
                </>
              ) : (
                "Hinzufügen"
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={!!invDeleteId}
        onOpenChange={(open) => {
          if (!open) {
            setInvDeleteId(null);
          }
        }}
      >
        <DialogContent className="max-w-md rounded-ordilo-md">
          <DialogHeader>
            <DialogTitle>Entfernen?</DialogTitle>
            <DialogDescription>
              Möchtest du diesen Eintrag wirklich entfernen?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (invDeleteId) {
                  void handleRemoveInventory(invDeleteId);
                }
              }}
              className="w-full"
            >
              Entfernen
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setInvDeleteId(null)}
              className="w-full"
            >
              Abbrechen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
