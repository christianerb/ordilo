import { launchScanner } from "@dariyd/react-native-document-scanner";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import {
  manipulateAsync,
  SaveFormat,
} from "expo-image-manipulator";
import * as Print from "expo-print";
import { useRouter } from "expo-router";
import {
  Check,
  FilePlus2,
  Images,
  ScanLine,
  Upload,
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
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  OrdiloFormBody,
  OrdiloFormSheet,
} from "@/src/components/sheet";
import {
  Card,
  OrdiloButton,
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
  type ScanProcessingStep,
  uploadScannedDocument,
  validateScannedDocument,
} from "@/src/lib/scan";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { success, fail } from "@/src/lib/feedback";

type UploadState = "queued" | "uploading" | "processing" | "failed" | "done";
type QueueItem = ScannedDocument & {
  documentId?: string;
  error?: string;
  processingStep?: ScanProcessingStep;
  state: UploadState;
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
  const { family } = useFamily();
  const [sheetVisible, setSheetVisible] = useState(true);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueHydrated, setQueueHydrated] = useState(false);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queueRef = useRef<QueueItem[]>([]);

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

  const uploadOne = useCallback(
    async (item: QueueItem) => {
      if (!family) return;
      let uploadedDocumentId: string | undefined;
      let processingStep: ScanProcessingStep | undefined;
      try {
        await updateQueue((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, state: "uploading", error: undefined }
              : candidate,
          ),
        );
        const result = await uploadScannedDocument(item, family.id);
        uploadedDocumentId = result.document_id;
        // The document ID must reach durable storage before OCR starts.
        // After a process interruption, retry can then resume this server
        // document instead of uploading a duplicate.
        await updateQueue((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  documentId: result.document_id,
                  processingStep: "ocr",
                  state: "processing",
                }
              : candidate,
          ),
        );
        if (!result.server_pipeline) {
          await continueScannedDocumentPipeline(
            result.document_id,
            "ocr",
            async (step) => {
              processingStep = step;
              await updateQueue((current) =>
                current.map((candidate) =>
                  candidate.id === item.id
                    ? {
                        ...candidate,
                        documentId: result.document_id,
                        processingStep: step,
                        state: "processing",
                      }
                    : candidate,
                ),
              );
            },
          );
        }
        await updateQueue((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  documentId: result.document_id,
                  processingStep: undefined,
                  state: "done",
                }
              : candidate,
          ),
        );
        await removeStagedScannedDocument(item.uri);
        void success();
      } catch {
        await markQueueFailed(item.id, {
          documentId: uploadedDocumentId ?? item.documentId,
          processingStep,
          error: uploadedDocumentId
            ? processingStep === "analysis"
              ? "Die Analyse hat nicht geklappt. Du kannst sie erneut starten."
              : "Die Texterkennung hat nicht geklappt. Du kannst sie erneut starten."
            : "Der Upload hat nicht geklappt. Du kannst es erneut versuchen.",
        });
        void fail();
      }
    },
    [family, markQueueFailed, updateQueue],
  );

  const retryProcessing = useCallback(
    async (item: QueueItem) => {
      if (!item.documentId) {
        await uploadOne(item);
        return;
      }
      let processingStep = item.processingStep ?? "ocr";
      try {
        await updateQueue((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, state: "processing", error: undefined }
              : candidate,
          ),
        );
        await continueScannedDocumentPipeline(
          item.documentId,
          processingStep,
          async (step) => {
            processingStep = step;
            await updateQueue((current) =>
              current.map((candidate) =>
                candidate.id === item.id
                  ? { ...candidate, processingStep: step, state: "processing" }
                  : candidate,
              ),
            );
          },
        );
        await updateQueue((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, processingStep: undefined, state: "done" }
              : candidate,
          ),
        );
        await removeStagedScannedDocument(item.uri);
        void success();
      } catch {
        await markQueueFailed(item.id, {
          documentId: item.documentId,
          processingStep,
          error:
            processingStep === "analysis"
              ? "Die Analyse hat nicht geklappt. Bitte erneut versuchen."
              : "Die Texterkennung hat nicht geklappt. Bitte erneut versuchen.",
        });
        void fail();
      }
    },
    [markQueueFailed, updateQueue, uploadOne],
  );

  const uploadQueued = useCallback(async () => {
    for (const item of queue) {
      if (item.state === "queued") {
        await uploadOne(item);
      } else if (item.state === "failed") {
        await retryProcessing(item);
      }
    }
  }, [queue, retryProcessing, uploadOne]);

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

  const actionableCount = queue.filter(
    (item) => item.state === "queued" || item.state === "failed",
  ).length;
  const isProcessing = queue.some(
    (item) => item.state === "uploading" || item.state === "processing",
  );
  const close = useCallback(() => setSheetVisible(false), []);
  const finishClose = useCallback(() => router.back(), [router]);

  return (
    <OrdiloFormSheet
      closeAccessibilityLabel="Scanner schließen"
      dismissDisabled={isProcessing}
      onClose={close}
      onDismiss={finishClose}
      subtitle="Ordilo richtet das Dokument für dich aus."
      title="Dokument scannen"
      visible={sheetVisible}
    >
      <OrdiloFormBody contentContainerStyle={styles.scrollContent}>
        <View style={styles.captureStage}>
          <ScanHeroIllustration />
          <Text style={[typography.display, styles.captureTitle]}>
            Brief scannen
          </Text>
          <Text style={[typography.body, styles.captureText]}>
            Kanten, Zuschnitt und mehrere Seiten übernimmt dein Gerät.
          </Text>
          <OrdiloButton
            disabled={scannerBusy || !queueHydrated}
            icon={
              scannerBusy ? (
                <ActivityIndicator color={colors.warmWhite} />
              ) : (
                <ScanLine color={colors.warmWhite} size={18} />
              )
            }
            onPress={() => void runSystemScanner()}
            size="lg"
            title={scannerBusy ? "Scanner wird geöffnet" : "Dokument scannen"}
          />
        </View>

        <View style={styles.alternatives}>
          <View style={styles.alternativeHeading}>
            <View style={styles.alternativeLine} />
            <Text style={styles.alternativeLabel}>Oder auswählen</Text>
            <View style={styles.alternativeLine} />
          </View>
          <View style={styles.secondaryActions}>
            <ScanSecondaryAction
              accessibilityLabel="Fotos auswählen"
              disabled={!queueHydrated}
              icon={<Images color={colors.harborBlue} size={20} strokeWidth={1.8} />}
              label="Fotos"
              onPress={() => void pickImages()}
            />
            <ScanSecondaryAction
              accessibilityLabel="Datei auswählen"
              disabled={!queueHydrated}
              icon={<FilePlus2 color={colors.harborBlue} size={20} strokeWidth={1.8} />}
              label="Datei"
              onPress={() => void pickFile()}
            />
          </View>
        </View>

        {error ? (
          <View accessibilityRole="alert" style={styles.error}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {queue.length > 0 ? (
          <Card style={styles.queueCard}>
            <View style={styles.rowHeader}>
              <Text style={[typography.title, styles.rowTitle]}>
                Bereit zum Hochladen
              </Text>
              {actionableCount > 0 ? (
                <OrdiloButton
                  disabled={!family || isProcessing}
                  icon={<Upload color={colors.warmWhite} size={16} />}
                  onPress={() => void uploadQueued()}
                  title={actionableCount === 1 ? "Weiter" : `${actionableCount} verarbeiten`}
                />
              ) : null}
            </View>
            {queue.map((item) => (
              <View key={item.id} style={styles.queueRow}>
                <View style={styles.queueIcon}>
                  {item.state === "uploading" || item.state === "processing" ? (
                    <ActivityIndicator color={colors.harborBlue} size="small" />
                  ) : (
                    <Upload color={colors.harborBlue} size={17} />
                  )}
                </View>
                <View style={styles.queueDetails}>
                  <Text numberOfLines={1} style={[typography.title, styles.rowTitle]}>
                    {item.name}
                  </Text>
                  <Text style={[typography.timestamp, styles.queueStatus]}>
                    {item.state === "done"
                      ? "Hochgeladen, wird vorbereitet"
                      : item.state === "uploading"
                        ? "Wird hochgeladen"
                        : item.state === "processing"
                          ? item.processingStep === "analysis"
                            ? "Inhalt wird verstanden"
                            : "Text wird erkannt"
                          : item.state === "failed"
                            ? item.error
                            : "Bereit zum Hochladen"}
                  </Text>
                </View>
                {item.state === "done" ? (
                  <Check color={colors.harborBlue} size={20} />
                ) : null}
                {item.state === "failed" ? (
                  <OrdiloButton
                    onPress={() => void retryProcessing(item)}
                    title="Erneut"
                    variant="outline"
                  />
                ) : null}
              </View>
            ))}
          </Card>
        ) : null}
      </OrdiloFormBody>
    </OrdiloFormSheet>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  captureStage: {
    ...cardRestShadow,
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.sm,
    overflow: "hidden",
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  captureTitle: {
    color: colors.harborBlueDarker,
    fontSize: 22,
    lineHeight: 29,
  },
  captureText: {
    color: colors.mistDark,
    marginBottom: spacing.md,
    maxWidth: 300,
    textAlign: "center",
  },
  alternatives: { gap: spacing.md },
  alternativeHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  alternativeLine: {
    backgroundColor: colors.mistLight,
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  alternativeLabel: {
    color: colors.mistDark,
    fontFamily: typography.timestamp.fontFamily,
    fontSize: typography.timestamp.fontSize,
    textAlign: "center",
  },
  secondaryActions: {
    flexDirection: "row",
    gap: spacing.sm,
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
    minHeight: 64,
    paddingHorizontal: spacing.md,
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
  queueCard: { gap: spacing.sm },
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
