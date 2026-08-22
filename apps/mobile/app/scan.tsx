import { launchScanner } from "@dariyd/react-native-document-scanner";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
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
  X,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, OrdiloButton } from "@/src/components/ui";
import { useFamily } from "@/src/lib/family-context";
import {
  continueScannedDocumentPipeline,
  getScanMimeType,
  type ScannedDocument,
  type ScanProcessingStep,
  uploadScannedDocument,
  validateScannedDocument,
} from "@/src/lib/scan";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

type UploadState = "queued" | "uploading" | "processing" | "failed" | "done";
type QueueItem = ScannedDocument & {
  documentId?: string;
  error?: string;
  processingStep?: ScanProcessingStep;
  state: UploadState;
};

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
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addToQueue = useCallback((document: ScannedDocument): boolean => {
    const validationError = validateScannedDocument(document);
    if (validationError) {
      setError(validationError);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return false;
    }
    setQueue((current) => [...current, { ...document, state: "queued" }]);
    setError(null);
    return true;
  }, []);

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
      if (addToQueue(await combinePages(pages))) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      setError(
        "Der Dokumentenscanner konnte nicht geöffnet werden. Bitte prüfe den Kamerazugriff oder wähle ein Foto aus.",
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setScannerBusy(false);
    }
  }, [addToQueue, scannerBusy]);

  const uploadOne = useCallback(
    async (item: QueueItem) => {
      if (!family) return;
      setQueue((current) =>
        current.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, state: "uploading", error: undefined }
            : candidate,
        ),
      );
      let uploadedDocumentId: string | undefined;
      let processingStep: ScanProcessingStep | undefined;
      try {
        const result = await uploadScannedDocument(item, family.id);
        uploadedDocumentId = result.document_id;
        if (!result.server_pipeline) {
          await continueScannedDocumentPipeline(
            result.document_id,
            "ocr",
            (step) => {
              processingStep = step;
              setQueue((current) =>
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
        setQueue((current) =>
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
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        setQueue((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  documentId: uploadedDocumentId ?? candidate.documentId,
                  processingStep,
                  state: "failed",
                  error:
                    uploadedDocumentId
                      ? processingStep === "analysis"
                        ? "Die Analyse hat nicht geklappt. Du kannst sie erneut starten."
                        : "Die Texterkennung hat nicht geklappt. Du kannst sie erneut starten."
                      : "Der Upload hat nicht geklappt. Du kannst es erneut versuchen.",
                }
              : candidate,
          ),
        );
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [family],
  );

  const retryProcessing = useCallback(
    async (item: QueueItem) => {
      if (!item.documentId) {
        await uploadOne(item);
        return;
      }
      setQueue((current) =>
        current.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, state: "processing", error: undefined }
            : candidate,
        ),
      );
      let processingStep = item.processingStep ?? "ocr";
      try {
        await continueScannedDocumentPipeline(
          item.documentId,
          processingStep,
          (step) => {
            processingStep = step;
            setQueue((current) =>
              current.map((candidate) =>
                candidate.id === item.id
                  ? { ...candidate, processingStep: step, state: "processing" }
                  : candidate,
              ),
            );
          },
        );
        setQueue((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, processingStep: undefined, state: "done" }
              : candidate,
          ),
        );
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        setQueue((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  processingStep,
                  state: "failed",
                  error:
                    processingStep === "analysis"
                      ? "Die Analyse hat nicht geklappt. Bitte erneut versuchen."
                      : "Die Texterkennung hat nicht geklappt. Bitte erneut versuchen.",
                }
              : candidate,
          ),
        );
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [uploadOne],
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
      for (const image of images) addToQueue(image);
    } catch {
      setError("Das Foto konnte nicht vorbereitet werden. Bitte versuch es nochmal.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [addToQueue]);

  const pickFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: ["application/pdf", "image/*"],
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    addToQueue({
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

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={[typography.display, styles.title]}>Dokument scannen</Text>
          <Text style={[typography.timestamp, styles.subtitle]}>
            Ordilo richtet das Dokument für dich aus.
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Scanner schließen"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.close}
        >
          <X color={colors.mistDark} size={20} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.captureStage}>
          <View style={styles.captureIcon}>
            <ScanLine color={colors.harborBlue} size={30} strokeWidth={1.6} />
          </View>
          <Text style={[typography.display, styles.captureTitle]}>
            Brief scannen
          </Text>
          <Text style={[typography.body, styles.captureText]}>
            Kanten, Zuschnitt und mehrere Seiten übernimmt dein Gerät.
          </Text>
          <OrdiloButton
            disabled={scannerBusy}
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
          <Text style={styles.alternativeLabel}>Oder auswählen</Text>
          <View style={styles.secondaryActions}>
            <OrdiloButton
              icon={<Images color={colors.graphite} size={17} />}
              onPress={() => void pickImages()}
              title="Fotos"
              variant="outline"
            />
            <OrdiloButton
              icon={<FilePlus2 color={colors.graphite} size={17} />}
              onPress={() => void pickFile()}
              title="Datei"
              variant="outline"
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.warmWhite,
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
  },
  title: { color: colors.graphite },
  subtitle: { color: colors.mistDark, marginTop: spacing.xs },
  close: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  scrollContent: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.xl,
  },
  captureStage: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  captureIcon: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: 32,
    height: 64,
    justifyContent: "center",
    marginBottom: spacing.sm,
    width: 64,
  },
  captureTitle: { color: colors.graphite },
  captureText: {
    color: colors.mistDark,
    marginBottom: spacing.sm,
    maxWidth: 280,
    textAlign: "center",
  },
  alternatives: { gap: spacing.sm },
  alternativeLabel: {
    color: colors.mistDark,
    fontFamily: typography.timestamp.fontFamily,
    fontSize: typography.timestamp.fontSize,
    textAlign: "center",
  },
  secondaryActions: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
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
