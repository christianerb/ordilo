"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Camera, FileText, FolderPlus, type LucideIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useScanActions } from "@/lib/scan/scan-context";
import { useCollections } from "@/lib/collections/collections-context";
import type { CollectionFormValues } from "@/components/ordilo/collection-form";

const CollectionForm = dynamic(() =>
  import("@/components/ordilo/collection-form").then((m) => m.CollectionForm),
);

/**
 * The + button's action sheet — the composer's "+" no longer scans directly
 * (VAL-NAV's old inline camera icon); it opens this list of everything the +
 * can start: scanning a document, jotting a note, or starting a collection.
 * Picking "Neue Sammlung" swaps the sheet's own content to the collection
 * form instead of stacking a second Sheet on top (Radix nested sheets fight
 * over the same overlay/focus trap).
 */
export function ComposerActionSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { openWizard, openCreateNote } = useScanActions();
  const { addCollection } = useCollections();
  const [view, setView] = useState<"actions" | "collection">("actions");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const close = () => onOpenChange(false);

  const handleCollectionSubmit = async (values: CollectionFormValues) => {
    setServerError(null);
    setIsSubmitting(true);
    const result = await addCollection(values);
    setIsSubmitting(false);

    if (!result.success) {
      setServerError(result.error);
      return;
    }
    close();
    router.refresh();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        // Reset back to the action list once the sheet has closed, so
        // reopening it never lands mid-collection-form.
        if (!next) {
          setView("actions");
          setServerError(null);
        }
      }}
    >
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85dvh] max-w-md overflow-y-auto rounded-t-ordilo-xl"
        data-testid="composer-action-sheet"
      >
        {view === "actions" ? (
          <>
            <SheetHeader>
              <SheetTitle>Aktionen</SheetTitle>
              <SheetDescription>
                Dokument scannen, Notiz erstellen oder eine neue Sammlung anlegen.
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-1 px-4 pb-6">
              <ActionRow
                icon={Camera}
                label="Scannen"
                testId="composer-action-scan"
                onClick={() => {
                  close();
                  openWizard();
                }}
              />
              <ActionRow
                icon={FileText}
                label="Notiz erstellen"
                testId="composer-action-note"
                onClick={() => {
                  close();
                  openCreateNote();
                }}
              />
              <ActionRow
                icon={FolderPlus}
                label="Neue Sammlung"
                testId="composer-action-collection"
                onClick={() => setView("collection")}
              />
            </div>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Sammlung hinzufügen</SheetTitle>
              <SheetDescription>
                Gib der Sammlung einen Namen, ein Icon und eine Farbe.
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">
              <CollectionForm
                submitLabel="Sammlung hinzufügen"
                onSubmit={handleCollectionSubmit}
                isSubmitting={isSubmitting}
                serverError={serverError}
                onClearServerError={() => setServerError(null)}
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ActionRow({
  icon: Icon,
  label,
  onClick,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex items-center gap-3 rounded-ordilo-sm px-3 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-foreground"
        aria-hidden="true"
      >
        <Icon className="size-5" />
      </span>
      {label}
    </button>
  );
}
