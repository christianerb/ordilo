import { CameraView, useCameraPermissions } from "expo-camera";
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
  Camera,
  Check,
  FilePlus2,
  Images,
  ScanLine,
  Trash2,
  Upload,
  X,
} from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
  getScanMimeType,
  type ScannedDocument,
  uploadScannedDocument,
  validateScannedDocument,
} from "@/src/lib/scan";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

type UploadState = "queued" | "uploading" | "failed" | "done";
type QueueItem = ScannedDocument & {
  error?: string;
  state: UploadState;
};

const MAX_CAPTURED_PAGES = 10;

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
 * Native document capture with the same server pipeline as the web scanner.
 * Pages stay local until the user explicitly adds the scan to the upload
 * queue. Uploads are one-at-a-time, so retrying a failed document never
 * duplicates the successful ones.
 */
export default function ScanModal() {
  const router = useRouter();
  const { family } = useFamily();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [pages, setPages] = useState<ScannedDocument[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addToQueue = useCallback((document: ScannedDocument) => {
    const validationError = validateScannedDocument(document);
    if (validationError) {
      setError(validationError);
      return;
    }
    setQueue((current) => [...current, { ...document, state: "queued" }]);
    setError(null);
  }, []);

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
      try {
        await uploadScannedDocument(item, family.id);
        setQueue((current) =>
          current.map((candidate) =>
            candidate.id === item.id ? { ...candidate, state: "done" } : candidate,
          ),
        );
      } catch {
        setQueue((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  state: "failed",
                  error:
                    "Der Upload hat nicht geklappt. Du kannst es erneut versuchen.",
                }
              : candidate,
          ),
        );
      }
    },
    [family],
  );

  const uploadQueued = useCallback(async () => {
    for (const item of queue) {
      if (item.state === "queued" || item.state === "failed") {
        await uploadOne(item);
      }
    }
  }, [queue, uploadOne]);

  const capturePage = useCallback(async () => {
    if (!cameraRef.current || captureBusy || pages.length >= MAX_CAPTURED_PAGES) {
      return;
    }
    setCaptureBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) throw new Error("Capture returned no image.");
      const page = await prepareImage(photo.uri, `Scan-${pages.length + 1}.jpg`);
      setPages((current) => [...current, page]);
      setError(null);
    } catch {
      setError("Das Foto konnte nicht aufgenommen werden. Bitte versuch es nochmal.");
    } finally {
      setCaptureBusy(false);
    }
  }, [captureBusy, pages.length]);

  const finishPages = useCallback(async () => {
    if (!pages.length) return;
    setCaptureBusy(true);
    try {
      addToQueue(await combinePages(pages));
      setPages([]);
    } catch {
      setError("Die Seiten konnten nicht zusammengefügt werden. Bitte versuch es nochmal.");
    } finally {
      setCaptureBusy(false);
    }
  }, [addToQueue, pages]);

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
    }
  }, [addToQueue]);

  const pickFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: ["application/pdf", "image/*"],
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    const document = {
      id: createDocumentId(),
      uri: asset.uri,
      name: asset.name,
      mimeType: getScanMimeType(asset.mimeType, asset.name),
      size: asset.size,
    };
    addToQueue(document);
  }, [addToQueue]);

  const pendingCount = queue.filter((item) => item.state !== "done").length;
  const cameraReady = permission?.granted;

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={[typography.display, styles.title]}>Dokument scannen</Text>
          <Text style={[typography.timestamp, styles.subtitle]}>
            Foto machen, auswählen oder als PDF hochladen
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

      {cameraReady ? (
        <View style={styles.cameraFrame}>
          <CameraView
            facing="back"
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.cameraGuide}>
            <View style={styles.guideBorder} />
            <Text style={styles.cameraHint}>Dokument im Rahmen ausrichten</Text>
          </View>
        </View>
      ) : (
        <Card style={styles.permissionCard}>
          <Camera color={colors.harborBlue} size={28} />
          <Text style={[typography.title, styles.permissionTitle]}>
            Kamera freigeben
          </Text>
          <Text style={[typography.timestamp, styles.permissionText]}>
            So kannst du Briefe direkt abfotografieren. Du kannst auch ein Foto
            oder eine Datei auswählen.
          </Text>
          <OrdiloButton
            icon={<Camera color={colors.warmWhite} size={18} />}
            onPress={() => void requestPermission()}
            title="Kamera erlauben"
          />
        </Card>
      )}

      <View style={styles.captureActions}>
        <OrdiloButton
          disabled={!cameraReady || captureBusy || pages.length >= MAX_CAPTURED_PAGES}
          icon={
            captureBusy ? (
              <ActivityIndicator color={colors.warmWhite} />
            ) : (
              <ScanLine color={colors.warmWhite} size={18} />
            )
          }
          onPress={() => void capturePage()}
          size="lg"
          title={pages.length ? "Weitere Seite" : "Foto aufnehmen"}
        />
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

      {pages.length > 0 ? (
        <Card style={styles.pagesCard}>
          <View style={styles.rowHeader}>
            <Text style={[typography.title, styles.rowTitle]}>
              {pages.length === 1 ? "1 Seite aufgenommen" : `${pages.length} Seiten aufgenommen`}
            </Text>
            <Text style={styles.pageLimit}>{MAX_CAPTURED_PAGES - pages.length} frei</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pageTray}>
              {pages.map((page, index) => (
                <View key={page.id} style={styles.pagePreview}>
                  <Image source={{ uri: page.uri }} style={styles.pageImage} />
                  <Pressable
                    accessibilityLabel={`Seite ${index + 1} verwerfen`}
                    accessibilityRole="button"
                    onPress={() =>
                      setPages((current) =>
                        current.filter((candidate) => candidate.id !== page.id),
                      )
                    }
                    style={styles.removePage}
                  >
                    <Trash2 color={colors.warmWhite} size={14} />
                  </Pressable>
                  <Text style={styles.pageNumber}>{index + 1}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
          <OrdiloButton
            disabled={captureBusy}
            onPress={() => void finishPages()}
            title={pages.length === 1 ? "Foto zur Warteschlange" : "Seiten zusammenfügen"}
          />
        </Card>
      ) : null}

      {error ? (
        <View accessibilityRole="alert" style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {queue.length > 0 ? (
        <Card style={styles.queueCard}>
          <View style={styles.rowHeader}>
            <Text style={[typography.title, styles.rowTitle]}>
              Warteschlange
            </Text>
            {pendingCount > 0 ? (
              <OrdiloButton
                disabled={!family || queue.some((item) => item.state === "uploading")}
                icon={<Upload color={colors.warmWhite} size={16} />}
                onPress={() => void uploadQueued()}
                title={pendingCount === 1 ? "Hochladen" : `${pendingCount} hochladen`}
              />
            ) : null}
          </View>
          {queue.map((item) => (
            <View key={item.id} style={styles.queueRow}>
              <View style={styles.queueIcon}>
                {item.state === "uploading" ? (
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
                  onPress={() => void uploadOne(item)}
                  title="Erneut"
                  variant="outline"
                />
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.warmWhite,
    flex: 1,
    gap: spacing.md,
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
  cameraFrame: {
    backgroundColor: colors.harborBlueDarker,
    borderRadius: radii.md,
    flex: 1,
    minHeight: 240,
    overflow: "hidden",
  },
  cameraGuide: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  guideBorder: {
    borderColor: colors.warmApricot,
    borderRadius: radii.sm,
    borderWidth: 2,
    height: "76%",
    maxHeight: 340,
    maxWidth: 260,
    width: "78%",
  },
  cameraHint: {
    backgroundColor: "rgba(25, 50, 50, 0.78)",
    borderRadius: radii.pill,
    color: colors.warmWhite,
    fontFamily: typography.timestamp.fontFamily,
    fontSize: typography.timestamp.fontSize,
    marginTop: spacing.md,
    overflow: "hidden",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  permissionCard: {
    alignItems: "center",
    flex: 1,
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 240,
    padding: spacing.lg,
  },
  permissionTitle: { color: colors.graphite, marginTop: spacing.sm },
  permissionText: {
    color: colors.mistDark,
    marginBottom: spacing.sm,
    maxWidth: 290,
    textAlign: "center",
  },
  captureActions: { gap: spacing.sm },
  secondaryActions: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
  },
  pagesCard: { gap: spacing.sm },
  rowHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  rowTitle: { color: colors.graphite, flexShrink: 1 },
  pageLimit: {
    color: colors.mistDark,
    fontFamily: typography.timestamp.fontFamily,
    fontSize: typography.timestamp.fontSize,
  },
  pageTray: { flexDirection: "row", gap: spacing.sm },
  pagePreview: { height: 78, position: "relative", width: 58 },
  pageImage: {
    borderColor: colors.mistLight,
    borderRadius: radii.base,
    borderWidth: 1,
    height: 78,
    width: 58,
  },
  removePage: {
    alignItems: "center",
    backgroundColor: colors.graphite,
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
    position: "absolute",
    right: -6,
    top: -6,
    width: 24,
  },
  pageNumber: {
    backgroundColor: colors.harborBlue,
    borderRadius: 8,
    color: colors.warmWhite,
    fontFamily: typography.label.fontFamily,
    fontSize: 11,
    left: 4,
    overflow: "hidden",
    paddingHorizontal: 5,
    paddingVertical: 1,
    position: "absolute",
    top: 4,
  },
  error: {
    backgroundColor: "#FDECEA",
    borderColor: colors.destructive,
    borderRadius: radii.sm,
    borderWidth: 1,
    padding: spacing.sm,
  },
  errorText: { color: colors.destructive, fontFamily: typography.timestamp.fontFamily },
  queueCard: { gap: spacing.sm, marginBottom: spacing.md },
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
