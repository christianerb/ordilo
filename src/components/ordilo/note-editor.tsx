"use client";

import { useCallback, useRef, useState } from "react";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Eye,
  PencilLine,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatMarkdown } from "@/components/ordilo/chat-markdown";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NoteEditorProps {
  /** Current markdown content. */
  value: string;
  /** Called when the content changes. */
  onChange: (value: string) => void;
  /** Optional attached image preview URL (object URL or data URL). */
  imagePreview?: string | null;
  /** Called when the user removes the attached image. */
  onRemoveImage?: () => void;
  /** Placeholder for the textarea. */
  placeholder?: string;
  /** Optional className for the outer container. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Toolbar helpers
// ---------------------------------------------------------------------------

/**
 * Wrap the current selection (or insert) with prefix/suffix markers.
 * If no text is selected, a placeholder is inserted between the markers
 * and selected so the user can type over it.
 */
function wrapSelection(
  textarea: HTMLTextAreaElement,
  prefix: string,
  suffix: string,
  placeholder: string,
): string {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.slice(0, start);
  const selected = textarea.value.slice(start, end) || placeholder;
  const after = textarea.value.slice(end);

  const newValue = before + prefix + selected + suffix + after;
  const insertStart = start + prefix.length;
  const insertEnd = insertStart + selected.length;

  // Restore focus and selection after React re-renders.
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(insertStart, insertEnd);
  });

  return newValue;
}

/**
 * Prefix each line in the selection (or the current line if empty) with
 * the given marker. Used for headings and list items.
 */
function prefixLines(
  textarea: HTMLTextAreaElement,
  prefix: string,
): string {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);

  // Expand to full lines.
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEnd = after.includes("\n") ? end + after.indexOf("\n") : textarea.value.length;

  const fullBefore = textarea.value.slice(0, lineStart);
  const fullSelected = textarea.value.slice(lineStart, lineEnd);
  const fullAfter = textarea.value.slice(lineEnd);

  const newLines = fullSelected.split("\n").map((line) => {
    if (line.startsWith(prefix)) return line;
    return prefix + line;
  });

  const newValue = fullBefore + newLines.join("\n") + fullAfter;

  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(lineStart, lineStart + newValue.slice(lineStart).split("\n")[0].length);
  });

  return newValue;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Note Editor — a lightweight markdown editor with a formatting toolbar
 * and a toggle between "Schreiben" (edit) and "Vorschau" (preview).
 *
 * Uses the existing ChatMarkdown component for rendering the preview, so
 * the preview matches the same styling used in the chat/search UI. No
 * heavy WYSIWYG dependency — just a textarea with toolbar buttons that
 * insert markdown syntax around the selection.
 */
export function NoteEditor({
  value,
  onChange,
  imagePreview,
  onRemoveImage,
  placeholder = "Schreib hier deine Notiz ...",
  className,
}: NoteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  const applyWrap = useCallback(
    (prefix: string, suffix: string, placeholderText: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      onChange(wrapSelection(textarea, prefix, suffix, placeholderText));
    },
    [onChange],
  );

  const applyPrefix = useCallback(
    (prefix: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      onChange(prefixLines(textarea, prefix));
    },
    [onChange],
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            label="Fett"
            onClick={() => applyWrap("**", "**", "Text")}
            icon={Bold}
          />
          <ToolbarButton
            label="Kursiv"
            onClick={() => applyWrap("*", "*", "Text")}
            icon={Italic}
          />
          <ToolbarButton
            label="Überschrift"
            onClick={() => applyPrefix("## ")}
            icon={Heading2}
          />
          <ToolbarButton
            label="Liste"
            onClick={() => applyPrefix("- ")}
            icon={List}
          />
          <ToolbarButton
            label="Nummerierte Liste"
            onClick={() => applyPrefix("1. ")}
            icon={ListOrdered}
          />
        </div>

        {/* Edit / Preview toggle */}
        <div className="flex items-center gap-0.5 rounded-ordilo-sm border border-border bg-[var(--sand)] p-0.5">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={cn(
              "flex items-center gap-1 rounded-ordilo-sm px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              mode === "edit"
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={mode === "edit"}
          >
            <PencilLine className="size-3" aria-hidden="true" />
            Schreiben
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={cn(
              "flex items-center gap-1 rounded-ordilo-sm px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              mode === "preview"
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={mode === "preview"}
          >
            <Eye className="size-3" aria-hidden="true" />
            Vorschau
          </button>
        </div>
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element -- object URL preview, not a static asset */}
          <img
            src={imagePreview}
            alt="Anhang"
            className="max-h-32 rounded-ordilo-sm border border-border object-contain"
          />
          {onRemoveImage && (
            <button
              type="button"
              onClick={onRemoveImage}
              className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-foreground text-background shadow-md transition-colors hover:bg-foreground/80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Bild entfernen"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Editor / Preview area */}
      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={8}
          className="w-full resize-y rounded-ordilo-sm border border-border bg-[var(--sand)] px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-[var(--petrol)] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Notiz bearbeiten"
          data-testid="note-editor-textarea"
        />
      ) : (
        <div
          className="min-h-[180px] rounded-ordilo-sm border border-border bg-[var(--sand)] px-3 py-2.5"
          data-testid="note-editor-preview"
        >
          {value.trim() ? (
            <ChatMarkdown content={value} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Noch nichts geschrieben. Wechsel zurück zu Schreiben, um loszulegen.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToolbarButton
// ---------------------------------------------------------------------------

function ToolbarButton({
  label,
  onClick,
  icon: Icon,
}: {
  label: string;
  onClick: () => void;
  icon: typeof Bold;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      aria-label={label}
      title={label}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
