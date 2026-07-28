"use client";

import { useRef } from "react";
import type { DocumentRow } from "@/lib/scan/scan-context-types";

/** Options for the single-document fetch — see use-document-list. */
export interface FetchDocumentByIdOptions {
  syncExpanded?: boolean;
  syncWizard?: boolean;
  syncList?: boolean;
  allowAutoAnalyze?: boolean;
}

export type FetchDocumentsFn = (familyIdOverride?: string) => Promise<void>;
export type FetchDocumentByIdFn = (
  documentId: string,
  options?: FetchDocumentByIdOptions,
) => Promise<DocumentRow | null>;

/**
 * Mutable refs shared across the scan sub-hooks.
 *
 * The document list, upload queue, wizard, and document actions call into
 * each other in a cycle (an upload refetches the list; a list fetch can
 * advance the wizard; the wizard starts uploads). Wiring the live
 * callbacks directly would re-create every callback on every render, so
 * the hooks communicate through these stable refs instead: the owning
 * hook fills `ref.current` during render, and consuming hooks call
 * `ref.current(...)` at event time, always reaching the latest closure.
 */
export function useScanPipelineRefs() {
  const fetchDocumentsRef = useRef<FetchDocumentsFn>(() => Promise.resolve());
  const fetchDocumentByIdRef = useRef<FetchDocumentByIdFn>(() =>
    Promise.resolve(null),
  );
  const triggeredAnalysisRef = useRef<Set<string>>(new Set());
  /** Document IDs whose pipeline is handled server-side (skip client triggers). */
  const serverPipelineRef = useRef<Set<string>>(new Set());
  const documentsLoadedRef = useRef(false);

  return {
    fetchDocumentsRef,
    fetchDocumentByIdRef,
    triggeredAnalysisRef,
    serverPipelineRef,
    documentsLoadedRef,
  };
}
