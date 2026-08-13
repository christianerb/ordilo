"use client";

import {
  useCallback,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import type { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { getFailedStage } from "@/lib/schemas/document";
import { createNote } from "@/lib/notes";
import { retryFailedDocument } from "@/lib/document-retry";
import type { DocumentType } from "@/lib/schemas/extraction";
import type { DocumentRow } from "@/lib/scan/scan-context-types";
import type {
  FetchDocumentByIdFn,
  FetchDocumentsFn,
} from "@/lib/scan/scan-pipeline-refs";

type BrowserSupabaseClient = ReturnType<typeof createClient>;

/**
 * Single-document actions: retry a failed pipeline stage, delete a
 * document, and the note-creation sheet.
 */
export function useDocumentActions({
  supabase,
  ensureFamilyId,
  familyIdRef,
  fetchDocumentsRef,
  fetchDocumentByIdRef,
  documentsLoadedRef,
  triggeredAnalysisRef,
  serverPipelineRef,
  documentsRef,
  setDocuments,
  expandedDocIdRef,
  updateTrackedDocument,
  closeDocument,
  wizardDocIdRef,
  setWizardDocId,
  setWizardDocument,
}: {
  supabase: BrowserSupabaseClient;
  ensureFamilyId: () => Promise<string | null>;
  familyIdRef: RefObject<string | null>;
  fetchDocumentsRef: RefObject<FetchDocumentsFn>;
  fetchDocumentByIdRef: RefObject<FetchDocumentByIdFn>;
  documentsLoadedRef: RefObject<boolean>;
  triggeredAnalysisRef: RefObject<Set<string>>;
  serverPipelineRef: RefObject<Set<string>>;
  documentsRef: RefObject<DocumentRow[]>;
  setDocuments: Dispatch<SetStateAction<DocumentRow[]>>;
  expandedDocIdRef: RefObject<string | null>;
  updateTrackedDocument: (
    documentId: string,
    updater: (doc: DocumentRow) => DocumentRow,
  ) => void;
  closeDocument: () => void;
  wizardDocIdRef: RefObject<string | null>;
  setWizardDocId: Dispatch<SetStateAction<string | null>>;
  setWizardDocument: Dispatch<SetStateAction<DocumentRow | null>>;
}) {
  const router = useRouter();
  const [createNoteOpen, setCreateNoteOpen] = useState(false);
  // The collection category the note is filed into, set by openCreateNote.
  const [createNoteCategory, setCreateNoteCategory] = useState<string | null>(null);

  const handleRetryFailed = useCallback(
    async (documentId: string) => {
      // Failed-stage routing needs `ocr_text`/`page_count`, which the
      // trimmed list fetch intentionally no longer carries — read the two
      // fields directly for this one document.
      const { data: stageRow, error: stageError } = await supabase
        .from("documents")
        .select("ocr_text, page_count, failure_stage")
        .eq("id", documentId)
        .maybeSingle();
      if (stageError || !stageRow) {
        toast.error("Fehlerdetails konnten nicht geladen werden.");
        return;
      }

      const stage = getFailedStage(stageRow);
      let retryError: string | null = null;

      // Clear the server-pipeline and analysis-triggered flags so the
      // retry path can re-trigger analysis after OCR completes.
      serverPipelineRef.current.delete(documentId);
      triggeredAnalysisRef.current.delete(documentId);

      if (stage === "ocr") {
        updateTrackedDocument(documentId, (current) => ({
          ...current,
          status: "ocr_processing",
          error_message: null,
          failure_stage: null,
          failure_code: null,
          failed_at: null,
        }));
        try {
          await retryFailedDocument(documentId, stage);
        } catch (error) {
          retryError =
            error instanceof Error ? error.message : "OCR konnte nicht neu gestartet werden.";
        }
      } else {
        updateTrackedDocument(documentId, (current) => ({
          ...current,
          status: "analyzing",
          error_message: null,
          failure_stage: null,
          failure_code: null,
          failed_at: null,
        }));
        try {
          await retryFailedDocument(documentId, stage);
        } catch (error) {
          retryError =
            error instanceof Error
              ? error.message
              : "Analyse konnte nicht neu gestartet werden.";
        }
      }

      if (documentsLoadedRef.current) {
        await fetchDocumentsRef.current();
      }
      await fetchDocumentByIdRef.current(documentId, {
        syncExpanded: expandedDocIdRef.current === documentId,
        syncWizard: wizardDocIdRef.current === documentId,
        syncList: documentsLoadedRef.current,
        allowAutoAnalyze: stage === "ocr",
      });
      if (retryError) toast.error(retryError);
    },
    [
      supabase,
      updateTrackedDocument,
      serverPipelineRef,
      triggeredAnalysisRef,
      documentsLoadedRef,
      fetchDocumentsRef,
      fetchDocumentByIdRef,
      expandedDocIdRef,
      wizardDocIdRef,
    ],
  );

  const handleDeleteDocument = useCallback(
    async (documentId: string) => {
      // Optimistic delete: the document disappears immediately (list +
      // open sheets), the server call runs in the background, and a
      // failure restores the document with a German toast. No full-list
      // refetch, no jank.
      const removed = documentsRef.current.find(
        (doc) => doc.id === documentId,
      );
      setDocuments((prev) =>
        prev.filter((current) => current.id !== documentId),
      );
      if (expandedDocIdRef.current === documentId) {
        closeDocument();
      }
      if (wizardDocIdRef.current === documentId) {
        setWizardDocId(null);
        setWizardDocument(null);
      }

      const restore = () => {
        if (removed) {
          setDocuments((prev) =>
            prev.some((d) => d.id === documentId) ? prev : [removed, ...prev],
          );
        }
        toast.error("Löschen hat nicht geklappt. Bitte nochmal versuchen.");
      };

      // The API route removes the DB row AND the Storage file with the
      // service-role client (the private bucket rejects browser-client
      // removals, which used to orphan files).
      // Report the outcome so callers stop announcing success regardless:
      // the page used to fire toast.success right after this resolved, so a
      // failed delete produced both an error and a success toast while the
      // document was visibly back in the list.
      try {
        const response = await fetch(`/api/documents/${documentId}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          restore();
          return false;
        }
        return true;
      } catch {
        restore();
        return false;
      }
    },
    [
      closeDocument,
      documentsRef,
      setDocuments,
      expandedDocIdRef,
      wizardDocIdRef,
      setWizardDocId,
      setWizardDocument,
    ],
  );

  const openCreateNote = useCallback((options?: { category?: string }) => {
    setCreateNoteCategory(options?.category ?? null);
    setCreateNoteOpen(true);
  }, []);

  const closeCreateNote = useCallback(() => {
    setCreateNoteOpen(false);
    setCreateNoteCategory(null);
  }, []);

  const handleCreateNote = useCallback(
    async (params: {
      title: string;
      content: string;
      documentType: DocumentType;
      secret: string;
      file: File | null;
    }) => {
      const fid = familyIdRef.current ?? await ensureFamilyId();
      if (!fid) return;

      const result = await createNote({
        title: params.title,
        content: params.content,
        documentType: params.documentType,
        familyId: fid,
        category: createNoteCategory ?? undefined,
        secret: params.secret || undefined,
        file: params.file,
      });

      // Pre-mark as triggered so fetchDocuments doesn't auto-trigger
      // analyze in parallel with the direct call below (409 race).
      triggeredAnalysisRef.current.add(result.document_id);

      // Refresh server components so pages that fetch their own documents
      // (e.g. the collection detail page) show the new note immediately —
      // its category is already set at creation, so it files itself into
      // the collection before analysis even runs.
      router.refresh();

      // Refresh the document list so the new note appears.
      if (documentsLoadedRef.current) {
        await fetchDocumentsRef.current(fid);
      }

      // Trigger analysis (same as the scan pipeline does after OCR).
      // The scan context's polling will pick up the "analyzing" → "analyzed"
      // transition and the document will appear in the review queue.
      try {
        const response = await fetch(`/api/documents/${result.document_id}/analyze`, {
          method: "POST",
        });
        if (!response.ok) {
          triggeredAnalysisRef.current.delete(result.document_id);
        }
      } catch {
        // Analysis trigger failed — the document is still in "ocr_done"
        // and the polling loop will retry automatically.
        triggeredAnalysisRef.current.delete(result.document_id);
      }

      // Fetch the updated document to reflect the "analyzing" status.
      if (documentsLoadedRef.current) {
        await fetchDocumentsRef.current(fid);
      }
    },
    [
      ensureFamilyId,
      familyIdRef,
      triggeredAnalysisRef,
      documentsLoadedRef,
      fetchDocumentsRef,
      createNoteCategory,
      router,
    ],
  );

  return {
    handleRetryFailed,
    handleDeleteDocument,
    createNoteOpen,
    createNoteCategory,
    openCreateNote,
    closeCreateNote,
    handleCreateNote,
  };
}
