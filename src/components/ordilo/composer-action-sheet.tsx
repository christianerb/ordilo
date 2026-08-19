"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ImageUp, FileText, FolderPlus, type LucideIcon } from "lucide-react";
import {
  OrdiloDrawer,
  OrdiloDrawerBody,
  OrdiloDrawerHeader,
} from "@/components/ordilo/ordilo-drawer";
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
  const { openUploadPicker, openCreateNote } = useScanActions();
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
    <OrdiloDrawer
      variant="form"
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        // Reset back to the action list once the drawer has closed, so
        // reopening it never lands mid-collection-form.
        if (!next) {
          setView("actions");
          setServerError(null);
        }
      }}
      data-testid="composer-action-sheet"
    >
      {view === "actions" ? (
        <>
          <OrdiloDrawerHeader
            title="Aktionen"
            description="Foto oder PDF hochladen, Notiz erstellen oder eine neue Sammlung anlegen."
          />
          <OrdiloDrawerBody>
            <div className="grid gap-1">
              <ActionRow
                icon={ImageUp}
                label="Foto oder PDF hochladen"
                testId="composer-action-upload"
                onClick={() => {
                  close();
                  openUploadPicker();
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
          </OrdiloDrawerBody>
        </>
      ) : (
        <>
          <OrdiloDrawerHeader
            title="Sammlung hinzufügen"
            description="Gib der Sammlung einen Namen, ein Icon und eine Farbe."
          />
          <OrdiloDrawerBody>
            <CollectionForm
              submitLabel="Sammlung hinzufügen"
              onSubmit={handleCollectionSubmit}
              isSubmitting={isSubmitting}
              serverError={serverError}
              onClearServerError={() => setServerError(null)}
            />
          </OrdiloDrawerBody>
        </>
      )}
    </OrdiloDrawer>
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
      className="flex items-center gap-3 rounded-ordilo-sm px-3 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent focus-ring"
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
