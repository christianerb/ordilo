"use client";

import {
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";
import {
  getStatusLabel,
  getStatusBadgeClasses,
  isProcessingStatus,
  getFileIcon,
  FAILED_CARD_COPY,
} from "@/lib/schemas/document";
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from "@/lib/schemas/extraction";
import { CardActions } from "@/components/ordilo/card-actions";

/**
 * Props for the DocumentCard component.
 */
export interface DocumentCardProps {
  /** Document title (may be null before analysis). Falls back to filename. */
  title?: string | null;
  /** Original filename — used as fallback when title is null. */
  originalFilename?: string | null;
  /** MIME type — determines the file icon. */
  mimeType?: string | null;
  /** Document status — drives the status badge and processing animation. */
  status: string;
  /** Created-at ISO timestamp — shown as relative date. */
  createdAt?: string | null;
  /** Error message — accepted for API compatibility but NOT rendered. Friendly German copy is shown instead (VAL-REVIEW-014). */
  errorMessage?: string | null;
  /** Click handler — when provided, the card is interactive (navigates to detail). */
  onClick?: () => void;
  /** Retry handler — shown when status is "failed". Re-triggers the failed pipeline step. */
  onRetry?: () => void;
  /** Edit handler — opens the edit sheet when provided. */
  onEdit?: () => void;
  /** Delete handler — opens the delete confirmation when provided. */
  onDelete?: () => void;
  /** Optional document type (enum value, e.g. "invoice"). When provided, the German label is rendered alongside the title. Unknown/null values render nothing. */
  documentType?: string | null;
  /** Optional additional className. */
  className?: string;
}

/**
 * Resolve the German document-type label for a given type value.
 *
 * Returns the German label (e.g. "Rechnung" for "invoice") when the value
 * is a known document type, or null when the value is null/undefined/unknown
 * so that no type badge is rendered.
 *
 * @param documentType - A document_type enum value, or null/undefined.
 * @returns The German label, or null.
 */
function getDocumentTypeLabel(
  documentType: string | null | undefined,
): string | null {
  if (!documentType) return null;
  return DOCUMENT_TYPE_LABELS[documentType as DocumentType] ?? null;
}

/**
 * Status icon shown next to the badge for quick visual scanning.
 */
function getStatusIcon(status: string): LucideIcon | null {
  if (isProcessingStatus(status)) return Loader2;
  if (status === "confirmed") return CheckCircle2;
  if (status === "failed") return AlertCircle;
  if (status === "ocr_done" || status === "analyzed") return CheckCircle2;
  if (status === "uploaded") return Clock;
  return null;
}

/**
 * Document Card — displays a single document with a file-type icon,
 * title (or filename fallback), status badge, and optional processing
 * animation, error display, and retry affordance.
 *
 * Visual design:
 * - Warm card surface (sand) with 12px radius and soft shadow
 * - Compact file-type icon (40px sand-light square, 12px radius, mist-dark icon)
 * - Title and relative timestamp in the center
 * - Status badge on the right with German label and color coding
 * - Processing animation (spinning loader) when status is ocr_processing or analyzing
 * - Failed state shows error message and retry button
 *
 * @example
 * <DocumentCard
 *   title="Stromrechnung Juli"
 *   originalFilename="invoice.pdf"
 *   mimeType="application/pdf"
 *   status="uploaded"
 *   createdAt="2026-07-04T12:00:00Z"
 *   onClick={() => navigateToDetail()}
 * />
 */
export function DocumentCard({
  title,
  originalFilename,
  mimeType,
  status,
  createdAt,
  onClick,
  onRetry,
  onEdit,
  onDelete,
  documentType,
  className,
}: DocumentCardProps) {
  const isProcessing = isProcessingStatus(status);
  const isFailed = status === "failed";
  const StatusIcon = getStatusIcon(status);
  const FileIcon = getFileIcon(mimeType);
  const displayTitle = title?.trim() || originalFilename || "Dokument";
  const relativeTime = formatRelativeTime(createdAt);
  const typeLabel = getDocumentTypeLabel(documentType);

  const content = (
    <>
      {/* File-type icon */}
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-ordilo-sm"
        style={{ backgroundColor: "var(--secondary)" }}
        aria-hidden="true"
      >
        <FileIcon
          className="size-4.5"
          style={{ color: "var(--mist-dark)" }}
          strokeWidth={1.5}
        />
      </div>

      {/* Title + document type + timestamp */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-foreground">{displayTitle}</p>
          {typeLabel && (
            <span
              data-testid="document-type-badge"
              className="inline-flex shrink-0 items-center rounded-full border border-[var(--petrol)]/20 bg-[var(--petrol)]/10 px-1.5 py-0.5 text-[11px] font-medium text-[var(--petrol)]"
            >
              {typeLabel}
            </span>
          )}
        </div>
        {relativeTime && (
          <p className="truncate text-xs tabular-nums text-muted-foreground">{relativeTime}</p>
        )}
        {isFailed && (
          <p
            className="mt-0.5 truncate text-xs text-destructive"
            data-testid="document-failed-copy"
          >
            {FAILED_CARD_COPY}
          </p>
        )}
      </div>

      {/* Status badge + processing indicator + actions */}
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex items-center gap-1.5">
          <span
            data-testid={`status-badge-${status}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
              getStatusBadgeClasses(status),
            )}
          >
            {StatusIcon && (
              <StatusIcon
                className={cn("size-3", isProcessing && "animate-spin")}
                aria-hidden="true"
              />
            )}
            {getStatusLabel(status)}
          </span>

          {/* Card actions menu ("..." → edit / delete) */}
          <CardActions onEdit={onEdit} onDelete={onDelete} />
        </div>

        {/* Retry button for failed documents */}
        {isFailed && onRetry && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            className="inline-flex items-center gap-1 rounded-ordilo-sm px-2 py-1 text-xs font-medium text-[var(--petrol)] transition-colors hover:bg-[var(--petrol)]/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="Nochmal versuchen"
            data-testid="document-retry-button"
          >
            <RefreshCw className="size-3" aria-hidden="true" />
            Nochmal versuchen
          </button>
        )}
      </div>
    </>
  );

  // When onClick is provided, wrap in a button for navigation.
  // Otherwise, render as a div (display-only).
  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        data-testid="document-card"
        data-status={status}
        className={cn(
          "flex items-center gap-2 rounded-ordilo-sm bg-card p-2.5 shadow-card card-lift focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 cursor-pointer",
          className,
        )}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      data-testid="document-card"
      data-status={status}
      className={cn(
        "flex items-center gap-2 rounded-ordilo-sm bg-card p-2.5 shadow-card",
        className,
      )}
    >
      {content}
    </div>
  );
}
