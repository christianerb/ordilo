import { launchScanner } from "@dariyd/react-native-document-scanner";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import {
  manipulateAsync,
  SaveFormat,
} from "expo-image-manipulator";
import * as Print from "expo-print";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  DOCUMENT_PIPELINE_STEPS,
  getDocumentPipelineStepsCompleted,
  type DocumentPipelineStatus,
} from "@ordilo/document-contract";
import {
  Check,
  FilePlus2,
  Images,
  ScanLine,
  Upload,
  X,
  XCircle,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useReducedMotion } from "react-native-reanimated";

import {
  ScanProcessingHero,
  type ScanProcessingStage,
} from "@/src/components/scan-processing-hero";
import {
  OrdiloFormBody,
  OrdiloFormSheet,
} from "@/src/components/sheet";
import {
  OrdiloButton,
  Screen,
  SpringPressable,
  cardRestShadow,
} from "@/src/components/ui";
import { ScanHeroIllustration } from "@/src/components/scan-hero-illustration";
import { useFamily } from "@/src/lib/family-context";
import {
  continueScannedDocumentPipeline,
  getScanMimeType,
  loadPersistedScanQueue,
  persistScanQueue,
  removeStagedScannedDocument,
  stageScannedDocument,
  type ScannedDocument,
  type PersistedScanQueueItem,
  type ScanQueueState,
  type ScanProcessingStep,
  uploadScannedDocument,
  validateScannedDocument,
  waitForScannedDocumentAnalysis,
} from "@/src/lib/scan";
import {
  completionEntering,
  contentEntering,
} from "@/src/theme/motion";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { success, fail } from "@/src/lib/feedback";

type UploadState = ScanQueueState | "done";
type QueueItem = Omit<PersistedScanQueueItem, "state"> & {
  state: UploadState;
};

type ScanFlow =
  | { phase: "capture" }
  | {
      phase: "processing";
      itemId: string;
      documentId?: string;
      status: "uploading" | DocumentPipelineStatus;
      serverPipeline?: boolean;
      error?: string;
    };

function getProcessingStage(
  status: "uploading" | DocumentPipelineStatus,
): ScanProcessingStage {
  if (status === "uploading") return "upload";
  if (status === "uploaded" || status === "ocr_processing") return "ocr";
  return "analysis";
}

const PROCESSING_COPY: Record<
  ScanProcessingStage,
  { heading: string; description: string }
> = {
  upload: {
    heading: "Dein Dokument macht sich auf den Weg",
    description: "Ordilo lädt es sicher hoch. Gleich beginnt die Texterkennung.",
  },
  ocr: {
    heading: "Ordilo liest aufmerksam mit",
    description: "Zeile für Zeile wird der Inhalt erkannt und für dich vorbereitet.",
  },
  analysis: {
    heading: "Ordilo sortiert das Wichtigste",
    description: "Namen, Termine und Aufgaben werden gefunden. Danach prüft ihr alles gemeinsam.",
  },
};

function ScanSecondaryAction({
  accessibilityLabel,
  disabled,
  icon,
  label,
  onPress,
}: {
  accessibilityLabel: string;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <SpringPressable
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={styles.secondaryAction}
    >
      <View style={styles.secondaryActionIcon}>{icon}</View>
      <Text style={styles.secondaryActionLabel}>{label}</Text>
    </SpringPressable>
  );
}

function isPersistedQueueItem(
  item: QueueItem,
): item is QueueItem & { state: Exclude<UploadState, "done"> } {
  return item.state !== "done";
}

function createDocumentId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function prepareImage(uri: string, name: string): Promise<ScannedDocument> {
  const image = await manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    { compress: 0.72, format: SaveFormat.JPEG },
  );
  const info = await FileSystem.getInfoAsync(image.uri);
  return {
    id: createDocumentId(),
    uri: image.uri,
    name: name.replace(/\.[^.]+$/, "") + ".jpg",
    mimeType: "image/jpeg",
    size: info.exists ? info.size : undefined,
  };
}

async function combinePages(pages: ScannedDocument[]): Promise<ScannedDocument> {
  if (pages.length === 1) return pages[0];
  const imageTags = await Promise.all(
    pages.map(async (page) => {
      const base64 = await FileSystem.readAsStringAsync(page.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return `<section><img src="data:image/jpeg;base64,${base64}" /></section>`;
    }),
  );
  const result = await Print.printToFileAsync({
    html: `<html><head><style>
      @page { margin: 0; } body { margin: 0; }
      section { page-break-after: always; height: 100vh; display: flex; align-items: center; justify-content: center; }
      img { width: 100%; height: auto; }
    </style></head><body>${imageTags.join("")}</body></html>`,
  });
  const info = await FileSystem.getInfoAsync(result.uri);
  return {
    id: createDocumentId(),
    uri: result.uri,
    name: `Scan-${new Date().toISOString().slice(0, 10)}.pdf`,
    mimeType: "application/pdf",
    size: info.exists ? info.size : undefined,
  };
}

/**
 * A system-native document intake:
 * - iOS opens VisionKit for automatic edge detection, crop, perspective
 *   correction and multi-page review.
 * - Android opens ML Kit's document scanner with the same outcome.
 *
 * Ordilo owns only the calm next step: validating and uploading the finished
 * document to its existing OCR/analysis pipeline.
 */
export default function ScanModal() {
  const router = useRouter();
  const { auto } = useLocalSearchParams<{ auto?: string }>();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { family } = useFamily();
  const [sheetVisible, setSheetVisible] = useState(true);
  const [flow, setFlow] = useState<ScanFlow>({ phase: "capture" });
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueHydrated, setQueueHydrated] = useState(false);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const bodyRef = useRef<ScrollView>(null);
  const followFlowRef = useRef(true);
  const processingAbortRef = useRef<AbortController | null>(null);
  const processingPromiseRef = useRef<Promise<void> | null>(null);
  const detachServerPipelineRef = useRef(false);
  // Opened from an explicit „scannen“ CTA: the camera is the point, so it
  // opens by itself once — the sheet behind it stays as the fallback
  // (photos, files, a queue that still needs attention). The dock opens
  // the sheet itself, so photos and files are one tap away too.
  const autoLaunchRef = useRef(auto === "1");

  const updateQueue = useCallback(
    async (transform: (current: QueueItem[]) => QueueItem[]) => {
      const next = transform(queueRef.current);
      queueRef.current = next;
      setQueue(next);
      await persistScanQueue(next.filter(isPersistedQueueItem));
      return next;
    },
    [],
  );

  const markQueueFailed = useCallback(
    async (
      itemId: string,
      patch: Pick<QueueItem, "documentId" | "processingStep" | "error">,
    ) => {
      try {
        await updateQueue((current) =>
          current.map((candidate) =>
            candidate.id === itemId
              ? { ...candidate, ...patch, state: "failed" }
              : candidate,
          ),
        );
      } catch {
        // The in-memory retry state is already updated. A later checkpoint
        // can recover if storage was temporarily unavailable.
      }
    },
    [updateQueue],
  );

  useEffect(() => {
    void (async () => {
      const stored = await loadPersistedScanQueue();
      const recovered: QueueItem[] = stored.map((item): QueueItem =>
          item.state === "uploading" || item.state === "processing"
            ? {
                ...item,
                state: "failed" as const,
                error: item.documentId
                  ? "Die Verarbeitung wurde unterbrochen. Du kannst sie fortsetzen."
                  : "Der Upload wurde unterbrochen. Du kannst ihn fortsetzen.",
              }
            : item,
      );
      queueRef.current = recovered;
      setQueue(recovered);
      await persistScanQueue(recovered.filter(isPersistedQueueItem));
      setQueueHydrated(true);
    })().catch(() => setQueueHydrated(true));
  }, []);

  useEffect(() => {
    return () => {
      followFlowRef.current = false;
      processingAbortRef.current?.abort();
    };
  }, []);

  const addToQueue = useCallback(async (document: ScannedDocument): Promise<boolean> => {
    const validationError = validateScannedDocument(document);
    if (validationError) {
      setError(validationError);
      void fail();
      return false;
    }
    try {
      const staged = await stageScannedDocument(document);
      await updateQueue((current) => [
        ...current,
        { ...staged, state: "queued" },
      ]);
      setError(null);
      bodyRef.current?.scrollTo({ animated: false, y: 0 });
      return true;
    } catch {
      setError("Das Dokument konnte nicht sicher gespeichert werden. Bitte versuch es nochmal.");
      void fail();
      return false;
    }
  }, [updateQueue]);

  const runSystemScanner = useCallback(async () => {
    if (scannerBusy) return;
    setScannerBusy(true);
    try {
      const result = await launchScanner({ quality: 0.78 });
      if (result.didCancel) return;
      if (result.error || !result.images?.length) {
        throw new Error(result.errorMessage ?? "Scanner returned no images.");
      }

      const pages = await Promise.all(
        result.images.map((image, index) =>
          prepareImage(image.uri, image.fileName || `Scan-${index + 1}.jpg`),
        ),
      );
      if (await addToQueue(await combinePages(pages))) {
        void success();
      }
    } catch {
      setError(
        "Der Dokumentenscanner konnte nicht geöffnet werden. Bitte prüfe den Kamerazugriff oder wähle ein Foto aus.",
      );
      void fail();
    } finally {
      setScannerBusy(false);
    }
  }, [addToQueue, scannerBusy]);

  useEffect(() => {
    if (!queueHydrated || !autoLaunchRef.current) return;
    autoLaunchRef.current = false;
    const hasWork = queueRef.current.some(
      (item) => item.state === "queued" || item.state === "failed",
    );
    if (hasWork) return;
    void runSystemScanner();
  }, [queueHydrated, runSystemScanner]);

  const processQueueItem = useCallback(
    async (item: QueueItem) => {
      if (!family && !item.documentId) return;
      processingAbortRef.current?.abort();
      const controller = new AbortController();
      processingAbortRef.current = controller;
      detachServerPipelineRef.current = false;
      let documentId = item.documentId;
      let processingStep = item.processingStep;
      let serverPipeline = item.serverPipeline ?? false;
      let pipelineStatus: "uploading" | DocumentPipelineStatus =
        processingStep === "analysis" ? "analyzing" : "ocr_processing";

      const reportClientStep = async (step: ScanProcessingStep) => {
        processingStep = step;
        pipelineStatus = step === "ocr" ? "ocr_processing" : "analyzing";
        if (followFlowRef.current) {
          setFlow({
            phase: "processing",
            itemId: item.id,
            documentId,
            serverPipeline,
            status: pipelineStatus,
          });
        }
        await updateQueue((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  documentId,
                  processingStep: step,
                  serverPipeline: false,
                  state: "processing",
                }
              : candidate,
          ),
        );
      };

      try {
        followFlowRef.current = true;
        setFlow({
          phase: "processing",
          itemId: item.id,
          documentId,
          serverPipeline,
          status: documentId ? pipelineStatus : "uploading",
        });
        if (!documentId) {
          await updateQueue((current) =>
            current.map((candidate) =>
              candidate.id === item.id
                ? { ...candidate, state: "uploading", error: undefined }
                : candidate,
            ),
          );
          const result = await uploadScannedDocument(item, family!.id);
          documentId = result.document_id;
          processingStep = "ocr";
          pipelineStatus = result.status;
          serverPipeline = result.server_pipeline;

          if (followFlowRef.current) {
            setFlow({
              phase: "processing",
              itemId: item.id,
              documentId,
              serverPipeline,
              status: pipelineStatus,
            });
          }
          // Persist the server ID before OCR so recovery never uploads a
          // duplicate after interruption.
          await updateQueue((current) =>
            current.map((candidate) =>
              candidate.id === item.id
                ? {
                    ...candidate,
                    documentId,
                    processingStep,
                    serverPipeline,
                    state: "processing",
                  }
                : candidate,
            ),
          );

          if (!result.server_pipeline) {
            await continueScannedDocumentPipeline(
              documentId,
              processingStep,
              reportClientStep,
              controller.signal,
            );
          }
        } else {
          await updateQueue((current) =>
            current.map((candidate) =>
              candidate.id === item.id
                ? { ...candidate, state: "processing", error: undefined }
                : candidate,
            ),
          );
          if (!serverPipeline) {
            await continueScannedDocumentPipeline(
              documentId,
              processingStep ?? "ocr",
              reportClientStep,
              controller.signal,
            );
          }
        }

        await waitForScannedDocumentAnalysis(documentId, async (status) => {
          pipelineStatus = status;
          if (
            (status === "ocr_done" || status === "analyzing") &&
            processingStep !== "analysis"
          ) {
            processingStep = "analysis";
            await updateQueue((current) =>
              current.map((candidate) =>
                candidate.id === item.id
                  ? { ...candidate, processingStep }
                  : candidate,
              ),
            );
          }
          if (followFlowRef.current) {
            setFlow({
              phase: "processing",
              itemId: item.id,
              documentId,
              serverPipeline,
              status,
            });
          }
        }, undefined, undefined, controller.signal);

        await updateQueue((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  documentId,
                  processingStep: undefined,
                  state: "done",
                }
              : candidate,
          ),
        );
        await removeStagedScannedDocument(item.uri);
        void success();
        if (followFlowRef.current) {
          router.replace({
            pathname: "/document/[id]",
            params: { id: documentId, source: "scan" },
          });
        }
      } catch (caughtError) {
        const interrupted =
          caughtError instanceof Error && caughtError.name === "AbortError";
        if (interrupted && detachServerPipelineRef.current) return;
        const errorMessage = caughtError instanceof Error
          ? caughtError.message
          : "Das Dokument konnte nicht verarbeitet werden.";
        const itemError = interrupted
          ? "Die Verarbeitung wurde unterbrochen. Du kannst sie fortsetzen."
          : documentId
          ? processingStep === "analysis"
            ? "Die Analyse hat nicht geklappt. Du kannst sie erneut starten."
            : "Die Texterkennung hat nicht geklappt. Du kannst sie erneut starten."
          : "Der Upload hat nicht geklappt. Du kannst es erneut versuchen.";
        await markQueueFailed(item.id, {
          documentId,
          processingStep,
          error: itemError,
        });
        if (followFlowRef.current) {
          setFlow({
            phase: "processing",
            itemId: item.id,
            documentId,
            serverPipeline,
            status: pipelineStatus,
            error: errorMessage || itemError,
          });
        }
        if (!interrupted || followFlowRef.current) void fail();
      } finally {
        if (processingAbortRef.current === controller) {
          processingAbortRef.current = null;
        }
      }
    },
    [family, markQueueFailed, router, updateQueue],
  );

  const startQueueItem = useCallback(async (item: QueueItem) => {
    const processing = processQueueItem(item);
    processingPromiseRef.current = processing;
    await processing;
    if (processingPromiseRef.current === processing) {
      processingPromiseRef.current = null;
    }
  }, [processQueueItem]);

  const uploadQueued = useCallback(async () => {
    const item = queue.find(
      (candidate) =>
        candidate.state === "queued" || candidate.state === "failed",
    );
    if (!item) return;
    await startQueueItem(item);
  }, [queue, startQueueItem]);

  const pickImages = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled) return;
    try {
      const images = await Promise.all(
        result.assets.map((asset, index) =>
          prepareImage(asset.uri, asset.fileName ?? `Foto-${index + 1}.jpg`),
        ),
      );
      for (const image of images) await addToQueue(image);
    } catch {
      setError("Das Foto konnte nicht vorbereitet werden. Bitte versuch es nochmal.");
      void fail();
    }
  }, [addToQueue]);

  const pickFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: ["application/pdf", "image/*"],
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    await addToQueue({
      id: createDocumentId(),
      uri: asset.uri,
      name: asset.name,
      mimeType: getScanMimeType(asset.mimeType, asset.name),
      size: asset.size,
    });
  }, [addToQueue]);

  const removeQueued = useCallback(async (item: QueueItem) => {
    await Promise.allSettled([
      updateQueue((current) => current.filter((candidate) => candidate.id !== item.id)),
      removeStagedScannedDocument(item.uri),
    ]);
  }, [updateQueue]);

  const actionableCount = queue.filter(
    (item) => item.state === "queued" || item.state === "failed",
  ).length;
  const isProcessing = queue.some(
    (item) => item.state === "uploading" || item.state === "processing",
  );
  const close = useCallback(() => setSheetVisible(false), []);
  const finishClose = useCallback(() => router.back(), [router]);
  const leaveProcessing = useCallback(async (
    keepRunning: boolean,
    item?: QueueItem,
  ) => {
    followFlowRef.current = false;
    detachServerPipelineRef.current = keepRunning;
    processingAbortRef.current?.abort();
    await processingPromiseRef.current;
    if (keepRunning && item) {
      await Promise.allSettled([
        updateQueue((current) =>
          current.filter((candidate) => candidate.id !== item.id),
        ),
        removeStagedScannedDocument(item.uri),
      ]);
    }
    router.back();
  }, [router, updateQueue]);

  if (flow.phase === "processing") {
    const item = queue.find((candidate) => candidate.id === flow.itemId);
    const completedSteps =
      flow.status === "uploading"
        ? 0
        : getDocumentPipelineStepsCompleted(flow.status);
    const failed = Boolean(flow.error);
    const processingStage = getProcessingStage(flow.status);
    const processingCopy = PROCESSING_COPY[processingStage];
    const canContinueInBackground = flow.serverPipeline === true && !failed;
    const leaveTitle = canContinueInBackground
      ? "Im Hintergrund weiterlaufen"
      : failed
        ? "Zur Ablage"
        : "Später fortsetzen";

    return (
      <Screen
        style={[
          styles.processingScreen,
          {
            paddingBottom: Math.max(insets.bottom, spacing.md),
            paddingTop: insets.top,
          },
        ]}
      >
        <View style={styles.processingTopBar}>
          <View>
            <Text style={styles.processingEyebrow}>Dokument aufnehmen</Text>
            <Text style={styles.processingTopTitle}>Ordilo ist dran</Text>
          </View>
          <Pressable
            accessibilityLabel={leaveTitle}
            onPress={() =>
              void leaveProcessing(canContinueInBackground, item)
            }
            style={styles.closeButton}
          >
            <X color={colors.graphite} size={22} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.processingScroller}
          showsVerticalScrollIndicator={false}
          style={styles.processingScroll}
        >
          <Animated.View
            entering={contentEntering()}
            key={failed ? "failed" : "processing"}
            style={styles.processingContent}
          >
            <View style={styles.characterWrap}>
              {failed ? (
                <View style={styles.failedCharacter}>
                  <XCircle color={colors.destructive} size={40} />
                </View>
              ) : (
                <ScanProcessingHero stage={processingStage} />
              )}
            </View>
            <Animated.View
              entering={contentEntering()}
              key={failed ? "failed-copy" : processingStage}
              style={styles.processingMessage}
            >
              <Text style={styles.processingHeading}>
                {failed ? "Das hat noch nicht geklappt" : processingCopy.heading}
              </Text>
              <Text style={styles.processingCopy}>
                {failed ? flow.error : processingCopy.description}
              </Text>
            </Animated.View>

            {item ? (
              <View style={styles.processingFile}>
                <FilePlus2 color={colors.harborBlue} size={18} />
                <Text numberOfLines={1} style={styles.processingFileName}>
                  {item.name}
                </Text>
              </View>
            ) : null}

            {!failed ? (
              <View style={styles.backgroundInfo}>
                <Text style={styles.backgroundInfoTitle}>
                  {canContinueInBackground
                    ? "Du kannst ruhig weiter"
                    : "Bitte noch kurz geöffnet lassen"}
                </Text>
                <Text style={styles.backgroundInfoText}>
                  {canContinueInBackground
                    ? "Du kannst diese Ansicht verlassen oder die App schließen. Ordilo arbeitet im Hintergrund weiter. Wenn du später zurückkommst, siehst du hier den Stand."
                    : "Dieses Dokument wird gerade auf deinem Gerät vorbereitet. Lass diese Ansicht geöffnet, bis der nächste Schritt beginnt."}
                </Text>
              </View>
            ) : null}

            <View style={styles.stepCard}>
              {DOCUMENT_PIPELINE_STEPS.map((step, index) => {
                const done = index < completedSteps;
                const active = !failed && index === completedSteps;
                const failedStep = failed && index === completedSteps;

                return (
                  <View
                    key={step.key}
                    style={[
                      styles.stepRow,
                      index > 0 && styles.stepRowBorder,
                    ]}
                  >
                    <Animated.View
                      entering={done ? completionEntering(reduceMotion) : undefined}
                      key={`${step.key}-${done ? "done" : active ? "active" : "waiting"}`}
                      style={[
                        styles.stepIcon,
                        done && styles.stepIconDone,
                        active && styles.stepIconActive,
                        failedStep && styles.stepIconFailed,
                      ]}
                    >
                      {done ? (
                        <Check color={colors.warmWhite} size={16} strokeWidth={3} />
                      ) : active ? (
                        reduceMotion ? (
                          <View style={styles.activeDot} />
                        ) : (
                          <ActivityIndicator color={colors.harborBlue} size="small" />
                        )
                      ) : failedStep ? (
                        <X color={colors.destructive} size={16} strokeWidth={2.5} />
                      ) : (
                        <View style={styles.stepDot} />
                      )}
                    </Animated.View>
                    <Text
                      style={[
                        styles.stepLabel,
                        (done || active) && styles.stepLabelCurrent,
                      ]}
                    >
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        </ScrollView>

        <View style={styles.processingActions}>
          {failed && item ? (
            <OrdiloButton
              onPress={() => void startQueueItem(item)}
              size="lg"
              title="Erneut versuchen"
            />
          ) : null}
          <OrdiloButton
            onPress={() =>
              void leaveProcessing(canContinueInBackground, item)
            }
            size="lg"
            title={leaveTitle}
            variant={failed ? "ghost" : "outline"}
          />
        </View>
      </Screen>
    );
  }

  return (
    <OrdiloFormSheet
      closeAccessibilityLabel="Scanner schließen"
      dismissDisabled={isProcessing}
      onClose={close}
      onDismiss={finishClose}
      subtitle="Ordilo liest mit und legt alles für euch ab."
      title="Etwas hinzufügen"
      visible={sheetVisible}
    >
      <OrdiloFormBody
        contentContainerStyle={styles.scrollContent}
        ref={bodyRef}
      >
        {error ? (
          <View accessibilityRole="alert" style={styles.error}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {queue.length > 0 ? (
          <View style={styles.queueCard}>
            <View style={styles.rowHeader}>
              <Text style={[typography.title, styles.rowTitle]}>
                {actionableCount > 0
                  ? actionableCount === 1
                    ? "1 Dokument wartet"
                    : `${actionableCount} Dokumente warten`
                  : "In Arbeit"}
              </Text>
              {actionableCount > 0 ? (
                <OrdiloButton
                  disabled={!family || isProcessing}
                  icon={<Upload color={colors.warmWhite} size={16} />}
                  onPress={() => void uploadQueued()}
                  title="Hochladen"
                />
              ) : null}
            </View>
            {queue.map((item, index) => (
              <View key={item.id} style={[styles.queueRow, index > 0 && styles.queueRowDivider]}>
                <View style={styles.queueIcon}>
                  {item.state === "uploading" || item.state === "processing" ? (
                    <ActivityIndicator color={colors.harborBlue} size="small" />
                  ) : item.state === "failed" ? (
                    <XCircle color={colors.destructive} size={18} />
                  ) : (
                    <FilePlus2 color={colors.harborBlue} size={18} />
                  )}
                </View>
                <View style={styles.queueDetails}>
                  <Text numberOfLines={1} style={[typography.title, styles.rowTitle]}>
                    {item.name}
                  </Text>
                  <Text numberOfLines={2} style={[typography.timestamp, item.state === "failed" ? styles.queueStatusFailed : styles.queueStatus]}>
                    {item.state === "done"
                      ? "Hochgeladen, wird vorbereitet"
                      : item.state === "uploading"
                        ? "Wird hochgeladen"
                        : item.state === "processing"
                          ? item.processingStep === "analysis"
                            ? "Ordilo versteht den Inhalt"
                            : "Ordilo liest den Text"
                          : item.state === "failed"
                            ? item.error
                            : "Bereit"}
                  </Text>
                </View>
                {item.state === "done" ? (
                  <Check color={colors.harborBlue} size={20} />
                ) : null}
                {item.state === "failed" ? (
                  <OrdiloButton
                    onPress={() => void startQueueItem(item)}
                    title="Erneut"
                    variant="outline"
                  />
                ) : null}
                {item.state === "queued" ? (
                  <Pressable
                    accessibilityLabel={`${item.name} entfernen`}
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => void removeQueued(item)}
                    style={styles.queueRemove}
                  >
                    <X color={colors.mistDark} size={16} strokeWidth={2.2} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <SpringPressable
          accessibilityHint="Öffnet die Kamera. Kanten, Zuschnitt und mehrere Seiten erkennt dein Gerät."
          accessibilityLabel="Dokument scannen"
          disabled={scannerBusy || !queueHydrated}
          onPress={() => void runSystemScanner()}
          style={styles.captureStage}
        >
          <ScanHeroIllustration height={queue.length > 0 ? 120 : 170} />
          <View style={styles.captureCopy}>
            <Text style={[typography.display, styles.captureTitle]}>
              {scannerBusy ? "Kamera öffnet sich …" : "Brief scannen"}
            </Text>
            <Text style={[typography.timestamp, styles.captureText]}>
              Mehrere Seiten gehen in einem Zug.
            </Text>
          </View>
          <View style={styles.captureButton}>
            {scannerBusy ? (
              <ActivityIndicator color={colors.warmWhite} size="small" />
            ) : (
              <ScanLine color={colors.warmWhite} size={22} strokeWidth={2.2} />
            )}
          </View>
        </SpringPressable>

        <View style={styles.secondaryActions}>
          <ScanSecondaryAction
            accessibilityLabel="Fotos auswählen"
            disabled={!queueHydrated}
            icon={<Images color={colors.harborBlue} size={20} strokeWidth={1.8} />}
            label="Aus Fotos"
            onPress={() => void pickImages()}
          />
          <ScanSecondaryAction
            accessibilityLabel="Datei auswählen"
            disabled={!queueHydrated}
            icon={<FilePlus2 color={colors.harborBlue} size={20} strokeWidth={1.8} />}
            label="PDF oder Datei"
            onPress={() => void pickFile()}
          />
        </View>
        <Text style={styles.privacyNote}>
          Deine Dokumente bleiben in eurem Familienbuch und werden nur für
          euch gelesen.
        </Text>
      </OrdiloFormBody>
    </OrdiloFormSheet>
  );
}

const styles = StyleSheet.create({
  processingScreen: {
    justifyContent: "space-between",
  },
  processingScroll: {
    flex: 1,
  },
  processingScroller: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: spacing.md,
  },
  processingTopBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 64,
  },
  processingEyebrow: {
    color: colors.mistDark,
    ...typography.label,
  },
  processingTopTitle: {
    color: colors.graphite,
    ...typography.display,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  processingContent: {
    alignItems: "center",
    alignSelf: "center",
    gap: spacing.sm,
    maxWidth: 420,
    width: "100%",
  },
  characterWrap: {
    alignItems: "center",
    height: 166,
    justifyContent: "center",
  },
  failedCharacter: {
    alignItems: "center",
    backgroundColor: colors.destructiveBackground,
    borderRadius: radii.pill,
    height: 80,
    justifyContent: "center",
    width: 80,
  },
  processingHeading: {
    ...typography.display,
    color: colors.harborBlueDarker,
    fontSize: 23,
    lineHeight: 30,
    textAlign: "center",
  },
  processingMessage: {
    alignItems: "center",
    gap: spacing.sm,
  },
  processingCopy: {
    color: colors.mistDark,
    maxWidth: 340,
    textAlign: "center",
    ...typography.body,
  },
  processingFile: {
    alignItems: "center",
    backgroundColor: colors.washSageSoft,
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    maxWidth: "100%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  processingFileName: {
    color: colors.harborBlueDarker,
    flexShrink: 1,
    ...typography.timestamp,
  },
  backgroundInfo: {
    backgroundColor: colors.washSageSoft,
    borderRadius: radii.sm,
    gap: spacing.xs,
    marginTop: spacing.md,
    padding: spacing.md,
    width: "100%",
  },
  backgroundInfoTitle: {
    color: colors.harborBlueDarker,
    ...typography.title,
  },
  backgroundInfoText: {
    color: colors.mistDark,
    ...typography.timestamp,
  },
  stepCard: {
    ...cardRestShadow,
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    width: "100%",
  },
  stepRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 64,
  },
  stepRowBorder: {
    borderTopColor: colors.mistLight,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stepIcon: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderColor: colors.mistLight,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  stepIconDone: {
    backgroundColor: colors.harborBlue,
    borderColor: colors.harborBlue,
  },
  stepIconActive: {
    backgroundColor: colors.blueSoft,
    borderColor: colors.harborBlue,
  },
  activeDot: {
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    height: 8,
    width: 8,
  },
  stepIconFailed: {
    backgroundColor: colors.destructiveBackground,
    borderColor: colors.destructive,
  },
  stepDot: {
    backgroundColor: colors.mist,
    borderRadius: radii.pill,
    height: 6,
    width: 6,
  },
  stepLabel: {
    color: colors.mistDark,
    flex: 1,
    ...typography.body,
  },
  stepLabelCurrent: {
    color: colors.graphite,
    ...typography.title,
  },
  processingActions: {
    gap: spacing.sm,
  },
  scrollContent: {
    gap: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  captureStage: {
    ...cardRestShadow,
    alignItems: "center",
    backgroundColor: colors.washSageSoft,
    borderColor: colors.mistLight,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    overflow: "hidden",
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  captureCopy: {
    alignItems: "center",
    gap: 2,
  },
  captureTitle: {
    color: colors.harborBlueDarker,
    fontSize: 22,
    lineHeight: 29,
    textAlign: "center",
  },
  captureText: {
    color: colors.mistDark,
    textAlign: "center",
  },
  captureButton: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    height: 56,
    justifyContent: "center",
    marginTop: spacing.sm,
    width: 56,
  },
  secondaryActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  privacyNote: {
    color: colors.mistDark,
    paddingHorizontal: spacing.sm,
    textAlign: "center",
    ...typography.label,
    lineHeight: 16,
  },
  queueRowDivider: {
    borderTopColor: colors.mistLight,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  queueStatusFailed: { color: colors.destructive },
  queueRemove: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  secondaryAction: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: spacing.sm,
  },
  secondaryActionIcon: {
    alignItems: "center",
    backgroundColor: colors.washSageSoft,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  secondaryActionLabel: {
    color: colors.graphite,
    ...typography.title,
  },
  error: {
    backgroundColor: colors.destructiveBackground,
    borderColor: colors.destructive,
    borderRadius: radii.sm,
    borderWidth: 1,
    padding: spacing.sm,
  },
  errorText: { color: colors.destructive, fontFamily: typography.timestamp.fontFamily },
  queueCard: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  rowHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  rowTitle: { color: colors.graphite, flexShrink: 1 },
  queueRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  queueIcon: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.base,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  queueDetails: { flex: 1, gap: 2 },
  queueStatus: { color: colors.mistDark },
});
