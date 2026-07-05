"use client";

import {
  FileText,
  ImageIcon,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getStatusLabel,
  getStatusBadgeClasses,
  isProcessingStatus,
  isImageMimeType,
  isPdfMimeType,
  FAILED_CARD_COPY,
} from "@/lib/schemas/document";

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
  /** Optional additional className. */
  className?: string;
}

/**
 * Get the appropriate file icon based on MIME type.
 */
function getFileIcon(mimeType: string | null | undefined): LucideIcon {
  if (mimeType && isImageMimeType(mimeType)) return ImageIcon;
  if (mimeType && isPdfMimeType(mimeType)) return FileText;
  return FileText;
}

/**
 * Get a human-readable relative time in German.
 * e.g. "vor 2 Stunden", "vor 3 Tagen", "gerade eben".
 */
function formatRelativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;

  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "gerade eben";
  if (diffMinutes < 60) return `vor ${diffMinutes} Minute${diffMinutes === 1 ? "" : "n"}`;
  if (diffHours < 24) return `vor ${diffHours} Stunde${diffHours === 1 ? "" : "n"}`;
  if (diffDays < 7) return `vor ${diffDays} Tag${diffDays === 1 ? "" : "en"}`;

  // For older dates, show DD.MM.YYYY
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
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
 * - Warm card surface (sand) with 20px radius and soft shadow
 * - File-type icon (image or PDF) on the left
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
  className,
}: DocumentCardProps) {
  const isProcessing = isProcessingStatus(status);
  const isFailed = status === "failed";
  const StatusIcon = getStatusIcon(status);
  const FileIcon = getFileIcon(mimeType);
  const displayTitle = title?.trim() || originalFilename || "Dokument";
  const relativeTime = formatRelativeTime(createdAt);

  const content = (
    <>
      {/* File-type icon */}
      <div
        className="flex size-12 shrink-0 items-center justify-center rounded-ordilo-sm"
        style={{ backgroundColor: "var(--secondary)" }}
        aria-hidden="true"
      >
        <FileIcon
          className="size-6"
          style={{ color: "var(--mist-dark)" }}
          strokeWidth={1.5}
        />
      </div>

      {/* Title + timestamp */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{displayTitle}</p>
        {relativeTime && (
          <p className="truncate text-sm text-muted-foreground">{relativeTime}</p>
        )}
        {isFailed && (
          <p
            className="mt-0.5 truncate text-sm text-destructive"
            data-testid="document-failed-copy"
          >
            {FAILED_CARD_COPY}
          </p>
        )}
      </div>

      {/* Status badge + processing indicator */}
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span
          data-testid={`status-badge-${status}`}
          className={cn(
            "inline-flex items-center gap-1 rounded-ordilo-pill border px-2.5 py-1 text-xs font-medium",
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

        {/* Retry button for failed documents */}
        {isFailed && onRetry && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            className="inline-flex items-center gap-1 rounded-ordilo-sm px-2 py-1 text-xs font-medium text-[var(--petrol)] transition-colors hover:bg-[var(--petrol)]/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="Erneut versuchen"
            data-testid="document-retry-button"
          >
            <RefreshCw className="size-3" aria-hidden="true" />
            Erneut versuchen
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
          "flex items-center gap-3 rounded-ordilo-md border border-border bg-card p-4 shadow-card transition-all hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 cursor-pointer",
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
        "flex items-center gap-3 rounded-ordilo-md border border-border bg-card p-4 shadow-card",
        className,
      )}
    >
      {content}
    </div>
  );
}
