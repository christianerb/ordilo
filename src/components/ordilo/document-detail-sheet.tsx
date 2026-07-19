"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ReviewCard } from "@/components/ordilo/review-card";
import { getFileIcon } from "@/lib/schemas/document";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type DocRow = Database["public"]["Tables"]["documents"]["Row"];

/**
 * Document Detail Sheet — a right-side slide-in panel that shows the full
 * `ReviewCard` for a single document, regardless of its pipeline status.
 *
 * Used by the documents table (and any other entry point that wants a
 * non-inline detail view) so clicking a row opens the same rich analysis,
 * metadata, and actions as the inline review flow, without needing to
 * navigate away or expand a card in place.
 */
export function DocumentDetailSheet({
  document,
  open,
  onOpenChange,
  onConfirmSuccess,
  onReanalyzeSuccess,
  onRetry,
}: {
  document: DocRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmSuccess?: () => void;
  onReanalyzeSuccess?: () => void;
  onRetry?: (documentId: string) => void;
}) {
  const FileIcon = document ? getFileIcon(document.mime_type) : FileText;
  const displayTitle =
    document?.title?.trim() || document?.original_filename || "Dokument";
  const [desktop, setDesktop] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);

  useMountEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(media.matches);
    sync();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setComparisonOpen(false);
        onOpenChange(nextOpen);
      }}
    >
      <SheetContent
        side={desktop ? "right" : "bottom"}
        className={cn(
          "w-full gap-0 p-0",
          desktop
            ? comparisonOpen
              ? "lg:max-w-[min(92vw,80rem)]"
              : "lg:max-w-xl xl:max-w-[42rem]"
            : "max-h-[90dvh] rounded-t-ordilo-xl",
        )}
        data-testid="document-detail-sheet"
      >
        <SheetHeader className="border-b border-border bg-[var(--sand)]/70 px-5 py-4">
          <SheetTitle className="flex items-center gap-2 pr-8 text-[15px]">
            <FileIcon
              className="size-4 shrink-0 text-[var(--mist-dark)]"
              aria-hidden="true"
            />
            <span className="truncate">{displayTitle}</span>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Details und Metadaten für dieses Dokument
          </SheetDescription>
        </SheetHeader>

        {document && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <ReviewCard
              key={`${document.id}:${document.status}`}
              documentId={document.id}
              status={document.status}
              errorMessage={document.error_message}
              failureStage={document.failure_stage}
              failureCode={document.failure_code}
              onConfirmSuccess={onConfirmSuccess}
              onReanalyzeSuccess={onReanalyzeSuccess}
              onRetry={onRetry ? () => onRetry(document.id) : undefined}
              onOriginalPreviewChange={setComparisonOpen}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
