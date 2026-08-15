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
      if (!fid) {
        throw new Error(
          "Deine Familie konnte nicht geladen werden. Bitte Seite neu laden.",
        );
      }

      // Only the save itself is awaited. Everything after it — list
      // refetch, server-component refresh, LLM enrichment — used to run
      // inside this await, so the sheet sat on "Wird gespeichert ..." for
      // the whole analysis (many seconds on mobile) even though the note
      // was safely stored after the first request.
      const result = await createNote({
        title: params.title,
        content: params.content,
        documentType: params.documentType,
        familyId: fid,
        category: createNoteCategory ?? undefined,
        secret: params.secret || undefined,
        file: params.file,
      });

      // Pre-mark as triggered so the list's auto-analyze never races the
      // server-side job or the fallback call below (409 race).
      triggeredAnalysisRef.current.add(result.document_id);

      // Show the note right away. The save response carries the stored row
      // in the list column shape, so this is the real record — not a
      // guess — and realtime/polling simply update it in place.
      const created = result.document;
      if (created) {
        setDocuments((prev) =>
          prev.some((doc) => doc.id === created.id) ? prev : [created, ...prev],
        );
      }

      // Everything below is deliberately NOT awaited: the caller closes the
      // sheet as soon as this resolves, and the user stays on the page they
      // were on while the rest catches up in the background. Nothing in
      // here may reject either — the note is already saved, so a failing
      // refresh must stay silent instead of becoming an unhandled
      // rejection long after the sheet closed.
      void (async () => {
        try {
          // Refresh server components so pages that fetch their own
          // documents (the collection detail page, the home counters) pick
          // the new note up — its category is already set at creation, so
          // it files itself into the collection before analysis even runs.
          router.refresh();

          if (documentsLoadedRef.current) {
            await fetchDocumentsRef.current(fid);
          }

          // The server enqueues enrichment itself (`server_pipeline`).
          // Only fall back to a direct analyze call when it could not.
          if (result.server_pipeline) return;

          try {
            const response = await fetch(
              `/api/documents/${result.document_id}/analyze`,
              { method: "POST" },
            );
            if (!response.ok) {
              triggeredAnalysisRef.current.delete(result.document_id);
            }
          } catch {
            // Trigger failed — the note itself is saved and confirmed; the
            // polling loop and the job worker both retry the enrichment.
            triggeredAnalysisRef.current.delete(result.document_id);
          }

          if (documentsLoadedRef.current) {
            await fetchDocumentsRef.current(fid);
          }
        } catch {
          // The note is stored; realtime and the next poll reconcile the
          // list. Never surface this to the user.
        }
      })();
    },
    [
      ensureFamilyId,
      familyIdRef,
      triggeredAnalysisRef,
      documentsLoadedRef,
      fetchDocumentsRef,
      createNoteCategory,
      setDocuments,
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
