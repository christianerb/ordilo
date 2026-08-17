"use client";

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { createClient } from "@/lib/supabase/client";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { isProcessingStatus } from "@/lib/schemas/document";
import { DOCUMENT_LIST_COLUMNS } from "@/lib/scan/document-list-columns";
import type { DocumentRow } from "@/lib/scan/scan-context-types";
import type {
  FetchDocumentByIdFn,
  FetchDocumentsFn,
} from "@/lib/scan/scan-pipeline-refs";
import type { ScanWizardStep } from "@/components/ordilo/scan-wizard/scan-wizard";

type BrowserSupabaseClient = ReturnType<typeof createClient>;

/**
 * The family's document list: initial fetch, realtime subscription,
 * polling heartbeat, and the auto-analyze trigger.
 *
 * The fetch callbacks also sync the "tracked" copies of a document — the
 * expanded detail sheet and the wizard's review step — which is why the
 * wizard's state refs and setters are passed in.
 */
export function useDocumentList({
  supabase,
  ensureFamilyId,
  familyIdRef,
  fetchDocumentsRef,
  fetchDocumentByIdRef,
  triggeredAnalysisRef,
  documentsLoadedRef,
  wizardOpenRef,
  wizardStepRef,
  wizardDocIdRef,
  wizardDocumentRef,
  setWizardDocument,
  setWizardStep,
}: {
  supabase: BrowserSupabaseClient;
  ensureFamilyId: () => Promise<string | null>;
  familyIdRef: RefObject<string | null>;
  fetchDocumentsRef: RefObject<FetchDocumentsFn>;
  fetchDocumentByIdRef: RefObject<FetchDocumentByIdFn>;
  triggeredAnalysisRef: RefObject<Set<string>>;
  documentsLoadedRef: RefObject<boolean>;
  wizardOpenRef: RefObject<boolean>;
  wizardStepRef: RefObject<ScanWizardStep>;
  wizardDocIdRef: RefObject<string | null>;
  wizardDocumentRef: RefObject<DocumentRow | null>;
  setWizardDocument: Dispatch<SetStateAction<DocumentRow | null>>;
  setWizardStep: Dispatch<SetStateAction<ScanWizardStep>>;
}) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [expandedDocument, setExpandedDocument] = useState<DocumentRow | null>(null);

  const seededPreExistingRef = useRef(false);
  const initialDocumentsLoadedRef = useRef(false);
  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const expandedDocIdRef = useRef(expandedDocId);
  expandedDocIdRef.current = expandedDocId;
  const expandedDocumentRef = useRef(expandedDocument);
  expandedDocumentRef.current = expandedDocument;

  const triggerAnalysisRef = useRef<(documentId: string) => Promise<void>>(
    () => Promise.resolve(),
  );

  const fetchDocuments = useCallback(
    async (familyIdOverride?: string) => {
      const fid = familyIdOverride ?? familyIdRef.current ?? await ensureFamilyId();
      if (!fid) {
        documentsLoadedRef.current = true;
        initialDocumentsLoadedRef.current = true;
        setDocuments([]);
        setLoadingDocs(false);
        return;
      }

      if (!initialDocumentsLoadedRef.current) {
        setLoadingDocs(true);
      }

      const { data: listData, error } = await supabase
        .from("documents")
        .select(DOCUMENT_LIST_COLUMNS)
        .eq("family_id", fid)
        .order("created_at", { ascending: false });
      // The trimmed selection carries every column except the heavy
      // `ocr_text`, which no list consumer reads.
      const data = (listData as DocumentRow[] | null)?.filter(
        (document) => !document.deleted_at,
      ) ?? null;

      if (error || !data) {
        // Leave whatever is already on screen and report the failure, instead
        // of falling through to an empty list that reads as "nothing scanned
        // yet" and blocks every later refresh (documentsLoadedRef stays false).
        setDocumentsError(
          "Deine Dokumente konnten nicht geladen werden. Bitte Verbindung prüfen.",
        );
        initialDocumentsLoadedRef.current = true;
        setLoadingDocs(false);
        return;
      }

      setDocumentsError(null);

      if (!seededPreExistingRef.current) {
        for (const doc of data) {
          if (doc.status === "ocr_done") {
            triggeredAnalysisRef.current.add(doc.id);
          }
        }
        seededPreExistingRef.current = true;
      }

      setDocuments(data);
      documentsLoadedRef.current = true;

      if (expandedDocIdRef.current) {
        setExpandedDocument(
          data.find((doc) => doc.id === expandedDocIdRef.current) ?? null,
        );
      }
      if (wizardDocIdRef.current) {
        // Only overwrite when the row is actually in the fetched list.
        // A list fetch that races the insert (or momentarily misses the
        // row) must not null out the wizard document — that blanked the
        // review step mid-flow.
        const wizardDoc = data.find((doc) => doc.id === wizardDocIdRef.current);
        if (wizardDoc) setWizardDocument(wizardDoc);
      }

      for (const doc of data) {
        if (doc.status === "ocr_done" && !triggeredAnalysisRef.current.has(doc.id)) {
          triggeredAnalysisRef.current.add(doc.id);
          setDocuments((prev) =>
            prev.map((current) =>
              current.id === doc.id
                ? { ...current, status: "analyzing", error_message: null }
                : current,
            ),
          );
          triggerAnalysisRef.current(doc.id);
        }
      }

      if (
        wizardOpenRef.current &&
        wizardStepRef.current === "processing" &&
        wizardDocIdRef.current
      ) {
        const currentWizardDoc = data.find((doc) => doc.id === wizardDocIdRef.current);
        if (currentWizardDoc?.status === "analyzed") {
          setWizardStep("review");
        }
      }

      initialDocumentsLoadedRef.current = true;
      setLoadingDocs(false);
    },
    [
      ensureFamilyId,
      supabase,
      familyIdRef,
      documentsLoadedRef,
      triggeredAnalysisRef,
      expandedDocIdRef,
      wizardOpenRef,
      wizardStepRef,
      wizardDocIdRef,
      setWizardDocument,
      setWizardStep,
    ],
  );
  fetchDocumentsRef.current = fetchDocuments;

  const fetchDocumentById = useCallback(
    async (
      documentId: string,
      options?: {
        syncExpanded?: boolean;
        syncWizard?: boolean;
        syncList?: boolean;
        allowAutoAnalyze?: boolean;
      },
    ) => {
      const { data, error } = await supabase
        .from("documents")
        .select(DOCUMENT_LIST_COLUMNS)
        .eq("id", documentId)
        .order("created_at", { ascending: false });

      const document = (data as DocumentRow[] | null)?.find(
        (candidate) => !candidate.deleted_at,
      ) ?? null;

      if (error || !document) {
        if (options?.syncExpanded && expandedDocIdRef.current === documentId) {
          setExpandedDocument(null);
        }
        if (options?.syncWizard && wizardDocIdRef.current === documentId) {
          setWizardDocument(null);
        }
        return null;
      }

      if (options?.syncList && documentsLoadedRef.current) {
        setDocuments((prev) => {
          const next = prev.some((doc) => doc.id === document.id)
            ? prev.map((doc) => (doc.id === document.id ? document : doc))
            : [document, ...prev];
          return next.sort((a, b) => b.created_at.localeCompare(a.created_at));
        });
      }

      if (options?.syncExpanded && expandedDocIdRef.current === documentId) {
        setExpandedDocument(document);
      }
      if (options?.syncWizard && wizardDocIdRef.current === documentId) {
        setWizardDocument(document);
      }

      if (
        options?.allowAutoAnalyze &&
        document.status === "ocr_done" &&
        !triggeredAnalysisRef.current.has(document.id)
      ) {
        triggeredAnalysisRef.current.add(document.id);
        const optimisticDoc = {
          ...document,
          status: "analyzing" as DocumentRow["status"],
          error_message: null,
        };

        if (options.syncList && documentsLoadedRef.current) {
          setDocuments((prev) =>
            prev.map((doc) => (doc.id === document.id ? optimisticDoc : doc)),
          );
        }
        if (options.syncExpanded && expandedDocIdRef.current === documentId) {
          setExpandedDocument(optimisticDoc);
        }
        if (options.syncWizard && wizardDocIdRef.current === documentId) {
          setWizardDocument(optimisticDoc);
        }
        void triggerAnalysisRef.current(document.id);
        return optimisticDoc;
      }

      if (
        options?.syncWizard &&
        wizardOpenRef.current &&
        wizardStepRef.current === "processing" &&
        wizardDocIdRef.current === documentId &&
        document.status === "analyzed"
      ) {
        setWizardStep("review");
      }

      return document;
    },
    [
      supabase,
      documentsLoadedRef,
      triggeredAnalysisRef,
      expandedDocIdRef,
      wizardOpenRef,
      wizardStepRef,
      wizardDocIdRef,
      setWizardDocument,
      setWizardStep,
    ],
  );
  fetchDocumentByIdRef.current = fetchDocumentById;

  const loadDocuments = useCallback(async () => {
    await fetchDocumentsRef.current();
  }, [fetchDocumentsRef]);

  /**
   * Seed the list with server-rendered documents instead of refetching.
   *
   * /dokumente's server component already fetched the exact same column
   * set, so seeding skips the duplicate full-table fetch on mount while
   * still marking the list as loaded — realtime/polling delta sync takes
   * over from there. Mirrors fetchDocuments' first-load seeding:
   * pre-existing ocr_done docs are recorded as already-triggered so they
   * don't re-fire analysis.
   */
  const seedDocuments = useCallback(
    (initialDocuments: DocumentRow[]) => {
      // The provider persists across SPA navigations — once a live load
      // happened, its fresher data wins and seeding would clobber it.
      if (documentsLoadedRef.current) return;

      for (const doc of initialDocuments) {
        if (doc.status === "ocr_done") {
          triggeredAnalysisRef.current.add(doc.id);
        }
      }
      seededPreExistingRef.current = true;

      setDocuments(initialDocuments);
      setDocumentsError(null);
      documentsLoadedRef.current = true;
      initialDocumentsLoadedRef.current = true;
      setLoadingDocs(false);
    },
    [documentsLoadedRef, triggeredAnalysisRef],
  );

  const updateTrackedDocument = useCallback(
    (documentId: string, updater: (doc: DocumentRow) => DocumentRow) => {
      if (documentsLoadedRef.current) {
        setDocuments((prev) =>
          prev.map((doc) => (doc.id === documentId ? updater(doc) : doc)),
        );
      }
      if (expandedDocumentRef.current?.id === documentId) {
        setExpandedDocument((prev) => (prev ? updater(prev) : prev));
      }
      if (wizardDocumentRef.current?.id === documentId) {
        setWizardDocument((prev) => (prev ? updater(prev) : prev));
      }
    },
    [documentsLoadedRef, expandedDocumentRef, wizardDocumentRef, setWizardDocument],
  );

  const hasProcessingDocs = documents.some((doc) => isProcessingStatus(doc.status));
  const hasProcessingDocsRef = useRef(hasProcessingDocs);
  hasProcessingDocsRef.current = hasProcessingDocs;

  // --- Realtime: push-based status updates for the family's documents. ---
  // Every pipeline transition (uploaded → ocr_processing → … → analyzed)
  // arrives as a postgres_changes event; the handler refetches just that
  // one document (trimmed columns) and reuses the existing sync logic —
  // including the wizard's processing → review transition and the
  // auto-analyze trigger. Polling below stays as a safety net but drops
  // to a slow heartbeat while the subscription is live.
  const realtimeReadyRef = useRef(false);
  const pollTickRef = useRef(0);

  useMountEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      // The family id is resolved once per session and never changes, so
      // a mount-only subscription is sufficient.
      const fid = await ensureFamilyId();
      if (cancelled || !fid) return;
      // Defensive: test mocks (and any non-realtime client) don't
      // implement channel(); the 1.5s polling keeps working unchanged.
      if (typeof supabase.channel !== "function") return;

      const handleChange = (payload: { new?: { id?: string } | null }) => {
        const documentId = payload.new?.id;
        if (!documentId) return;
        void fetchDocumentByIdRef.current(documentId, {
          syncWizard: wizardDocIdRef.current === documentId,
          syncExpanded: expandedDocIdRef.current === documentId,
          syncList: documentsLoadedRef.current,
          allowAutoAnalyze: true,
        });
      };

      channel = supabase
        .channel(`documents-changes-${fid}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "documents",
            filter: `family_id=eq.${fid}`,
          },
          handleChange,
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "documents",
            filter: `family_id=eq.${fid}`,
          },
          handleChange,
        )
        .subscribe((status) => {
          if (!cancelled) {
            realtimeReadyRef.current = status === "SUBSCRIBED";
          }
        });
    })();

    return () => {
      cancelled = true;
      realtimeReadyRef.current = false;
      if (channel) void supabase.removeChannel(channel);
    };
  });

  useMountEffect(() => {
    const interval = setInterval(() => {
      pollTickRef.current += 1;
      // Fast 1.5s polling only while the wizard shows the processing step —
      // the one moment someone is actively watching a document move through
      // the pipeline. Everything else rides on the realtime subscription,
      // with polling as a safety net only (15s while realtime is live, 4.5s
      // when the subscription is down) so background pages don't refetch
      // the full document list every 1.5s.
      const wizardProcessing =
        wizardOpenRef.current &&
        wizardStepRef.current === "processing" &&
        !!wizardDocIdRef.current;
      if (!wizardProcessing) {
        const heartbeatTicks = realtimeReadyRef.current ? 10 : 3;
        if (pollTickRef.current % heartbeatTicks !== 0) {
          return;
        }
      }
      if (documentsLoadedRef.current && hasProcessingDocsRef.current) {
        // Delta refresh: refetch only the documents currently moving
        // through the pipeline (usually 0–2 rows), never the whole table.
        // The full-list refetch ran on every heartbeat as long as ANY doc
        // sat in a processing status — one stuck row meant downloading
        // every document (summaries included) every 15s forever.
        // ocr_done is watched too: analysis is triggered client-side, so
        // a missed trigger needs the safety net (fetchDocumentById with
        // allowAutoAnalyze re-fires it).
        for (const doc of documentsRef.current) {
          if (!isProcessingStatus(doc.status) && doc.status !== "ocr_done") {
            continue;
          }
          void fetchDocumentByIdRef.current(doc.id, {
            syncList: true,
            syncExpanded: expandedDocIdRef.current === doc.id,
            syncWizard: wizardDocIdRef.current === doc.id,
            allowAutoAnalyze: true,
          });
        }
      }
      if (
        expandedDocIdRef.current &&
        expandedDocumentRef.current &&
        isProcessingStatus(expandedDocumentRef.current.status)
      ) {
        void fetchDocumentByIdRef.current(expandedDocIdRef.current, {
          syncExpanded: true,
        });
      }
      if (
        wizardOpenRef.current &&
        wizardStepRef.current === "processing" &&
        wizardDocIdRef.current &&
        (!wizardDocumentRef.current ||
          wizardDocumentRef.current.status === "ocr_done" ||
          isProcessingStatus(wizardDocumentRef.current.status))
      ) {
        void fetchDocumentByIdRef.current(wizardDocIdRef.current, {
          syncWizard: true,
          syncList: documentsLoadedRef.current,
          allowAutoAnalyze: true,
        });
      }
    }, 1500);
    return () => clearInterval(interval);
  });

  const triggerAnalysis = useCallback(
    async (documentId: string) => {
      try {
        const response = await fetch(`/api/documents/${documentId}/analyze`, {
          method: "POST",
        });
        if (!response.ok) throw new Error(String(response.status));
      } catch {
        // Release the "already triggered" marker so the polling loop can try
        // again. Keeping it meant the document sat at ocr_done forever — the
        // wizard spinning on "Inhalt wird verstanden", the list stuck on
        // "Sortiert" — with no error state and nothing to retry.
        triggeredAnalysisRef.current.delete(documentId);
      }
      if (documentsLoadedRef.current) {
        await fetchDocumentsRef.current();
      }
      await fetchDocumentByIdRef.current(documentId, {
        syncExpanded: expandedDocIdRef.current === documentId,
        syncWizard: wizardDocIdRef.current === documentId,
        syncList: documentsLoadedRef.current,
      });
    },
    [
      documentsLoadedRef,
      triggeredAnalysisRef,
      fetchDocumentsRef,
      fetchDocumentByIdRef,
      expandedDocIdRef,
      wizardDocIdRef,
    ],
  );
  triggerAnalysisRef.current = triggerAnalysis;

  const handleConfirmSuccess = useCallback(() => {
    if (documentsLoadedRef.current) {
      void fetchDocumentsRef.current();
      return;
    }
    if (expandedDocIdRef.current) {
      void fetchDocumentByIdRef.current(expandedDocIdRef.current, {
        syncExpanded: true,
      });
    }
  }, [documentsLoadedRef, fetchDocumentsRef, fetchDocumentByIdRef, expandedDocIdRef]);

  const handleReanalyzeSuccess = useCallback(() => {
    if (documentsLoadedRef.current) {
      void fetchDocumentsRef.current();
    }
    if (expandedDocIdRef.current) {
      void fetchDocumentByIdRef.current(expandedDocIdRef.current, {
        syncExpanded: true,
        syncList: documentsLoadedRef.current,
      });
    }
  }, [documentsLoadedRef, fetchDocumentsRef, fetchDocumentByIdRef, expandedDocIdRef]);

  const openDocument = useCallback(
    async (documentId: string) => {
      const existing = documentsRef.current.find((doc) => doc.id === documentId);
      if (existing) {
        setExpandedDocument(existing);
        setExpandedDocId(documentId);
        return;
      }
      const document = await fetchDocumentByIdRef.current(documentId);
      if (document) {
        setExpandedDocument(document);
        setExpandedDocId(documentId);
      }
    },
    [documentsRef, fetchDocumentByIdRef],
  );

  const closeDocument = useCallback(() => {
    setExpandedDocId(null);
    setExpandedDocument(null);
  }, []);

  return {
    documents,
    setDocuments,
    documentsRef,
    loadingDocs,
    documentsError,
    expandedDocId,
    setExpandedDocId,
    expandedDocument,
    expandedDocIdRef,
    expandedDocumentRef,
    loadDocuments,
    seedDocuments,
    updateTrackedDocument,
    openDocument,
    closeDocument,
    handleConfirmSuccess,
    handleReanalyzeSuccess,
  };
}
