import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Pencil,
  Trash2,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CollectionFormSheet } from "@/src/components/collection-form-sheet";
import { CollectionIcon } from "@/src/components/collection-icon";
import {
  ConfirmDialog,
  ConfirmDialogEmphasis,
} from "@/src/components/confirm-dialog";
import {
  DetailTopBar,
  EmptyState,
  ListSkeleton,
  OrdiloButton,
  Screen,
} from "@/src/components/ui";
import {
  deleteCollection,
  fetchCollectionDocuments,
  fetchCollections,
  getCollectionColor,
  updateCollection,
  type Collection,
  type CollectionDocument,
} from "@/src/lib/collections";
import { useFamily } from "@/src/lib/family-context";
import {
  formatDocumentDate,
  getDocumentStatusLabel,
  getDocumentTypeLabel,
} from "@/src/lib/library";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { success } from "@/src/lib/feedback";

/**
 * Collection detail ("Sammlung") — the documents linked to one folder.
 * The link is the case-insensitive match between document category and
 * collection name, so a rename cascades onto the documents (handled in
 * updateCollection) while a delete leaves them untouched.
 */
export default function SammlungDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { family } = useFamily();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [documents, setDocuments] = useState<CollectionDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(
    async ({ refresh = false } = {}) => {
      if (!family || !id) {
        setLoading(false);
        return;
      }
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const collections = await fetchCollections(family.id);
        const current = collections.find((entry) => entry.id === id) ?? null;
        setCollection(current);
        if (!current) {
          setError("Diese Sammlung wurde nicht gefunden. Vielleicht wurde sie gelöscht.");
          setDocuments([]);
          return;
        }
        setDocuments(await fetchCollectionDocuments(family.id, current.name));
      } catch {
        setError(
          "Die Sammlung konnte nicht geladen werden. Bitte versuch es nochmal.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [family, id],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const confirmDelete = useCallback(async () => {
    if (!collection) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteCollection(collection.id);
      if (!result.success) {
        setDeleteError(result.error);
        return;
      }
      await success();
      setDeleteOpen(false);
      router.back();
    } catch {
      setDeleteError("Keine Verbindung. Bitte prüfe dein Internet und versuch's nochmal.");
    } finally {
      setDeleting(false);
    }
  }, [collection, router]);

  if (loading && !collection) {
    return (
      <Screen>
        <DetailTopBar onBack={() => router.back()} title="Sammlung" />
        <ListSkeleton rows={5} />
      </Screen>
    );
  }

  if (!collection) {
    return (
      <Screen style={styles.center}>
        <EmptyState
          icon={AlertCircle}
          heading="Sammlung nicht gefunden"
          description={error ?? "Diese Sammlung gibt es nicht (mehr)."}
        >
          <OrdiloButton
            onPress={() => router.back()}
            size="lg"
            title="Zurück"
            variant="outline"
          />
        </EmptyState>
      </Screen>
    );
  }

  const color = getCollectionColor(collection.color);
  const countLabel =
    documents.length === 0
      ? "Noch keine Dokumente"
      : documents.length === 1
        ? "1 Dokument"
        : `${documents.length} Dokumente`;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.harborBlue]}
            onRefresh={() => void load({ refresh: true })}
            refreshing={refreshing}
            tintColor={colors.harborBlue}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <DetailTopBar
          onBack={() => router.back()}
          trailing={(
            <View style={styles.topBarActions}>
              <Pressable
                accessibilityHint="Name, Icon oder Farbe ändern"
                accessibilityLabel="Sammlung bearbeiten"
                accessibilityRole="button"
                onPress={() => setEditOpen(true)}
                style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
              >
                <Pencil color={colors.mistDark} size={18} strokeWidth={1.8} />
              </Pressable>
              <Pressable
                accessibilityHint="Löscht nur den Ordner, die Dokumente bleiben"
                accessibilityLabel="Sammlung löschen"
                accessibilityRole="button"
                onPress={() => {
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
                style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
              >
                <Trash2 color={colors.destructive} size={18} strokeWidth={1.8} />
              </Pressable>
            </View>
          )}
        />

        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: color.bg }]}>
            <CollectionIcon iconKey={collection.icon} color={color.fg} size={24} strokeWidth={1.75} />
          </View>
          <View style={styles.headerCopy}>
            <Text numberOfLines={2} style={styles.headerTitle}>
              {collection.name}
            </Text>
            <Text style={styles.headerMeta}>{countLabel}</Text>
          </View>
        </View>

        {error ? (
          <View accessibilityRole="alert" style={styles.inlineError}>
            <Text style={styles.inlineErrorText}>{error}</Text>
            <Pressable onPress={() => void load({ refresh: true })}>
              <Text style={styles.inlineErrorRetry}>Erneut versuchen</Text>
            </Pressable>
          </View>
        ) : null}

        {documents.length > 0 ? (
          <View style={styles.list}>
            {documents.map((document) => (
              <DocumentRow
                document={document}
                key={document.id}
                onPress={() => router.push(`/document/${document.id}`)}
              />
            ))}
          </View>
        ) : (
          !error && (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconCircle}>
                <CollectionIcon iconKey={collection.icon} color={colors.mist} size={36} strokeWidth={1.5} />
              </View>
              <Text style={styles.emptyHeading}>Noch keine Dokumente hier</Text>
              <Text style={styles.emptyText}>
                Dokumente landen hier automatisch, sobald ihre Kategorie zu
                dieser Sammlung passt.
              </Text>
            </View>
          )
        )}
      </ScrollView>

      <CollectionFormSheet
        initialValues={{
          name: collection.name,
          icon: collection.icon,
          color: collection.color,
        }}
        onClose={() => setEditOpen(false)}
        onSubmit={async (values) => {
          const result = await updateCollection(collection, values);
          if (!result.success) return { success: false, error: result.error };
          setCollection(result.collection);
          await load();
          return { success: true };
        }}
        submitLabel="Änderungen speichern"
        title="Sammlung bearbeiten"
        visible={editOpen}
      />

      <ConfirmDialog
        error={deleteError}
        loading={deleting}
        loadingLabel="Wird gelöscht …"
        message={(
          <>
            Möchtest du <ConfirmDialogEmphasis>{collection.name}</ConfirmDialogEmphasis>{" "}
            wirklich löschen? Keine Sorge, die Dokumente bleiben erhalten.
          </>
        )}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
        title="Sammlung löschen"
        visible={deleteOpen}
      />
    </Screen>
  );
}

function DocumentRow({
  document,
  onPress,
}: {
  document: CollectionDocument;
  onPress: () => void;
}) {
  const title = document.title?.trim() || document.original_filename || "Dokument";
  const typeLabel = getDocumentTypeLabel(document.document_type);
  const needsReview = document.status === "analyzed";
  const failed = document.status === "failed";

  return (
    <Pressable
      accessibilityHint="Öffnet die Dokumentansicht"
      accessibilityLabel={`${title}, ${getDocumentStatusLabel(document.status)}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.documentRow, pressed && styles.pressed]}
    >
      <View style={styles.documentIcon}>
        <FileText color={colors.mistDark} size={20} strokeWidth={1.7} />
      </View>
      <View style={styles.documentCopy}>
        <Text numberOfLines={1} style={styles.documentTitle}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.documentMeta}>
          {[typeLabel, formatDocumentDate(document.created_at)]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      <View
        style={[
          styles.status,
          needsReview && styles.statusReview,
          failed && styles.statusFailed,
        ]}
      >
        {document.status === "confirmed" ? (
          <CheckCircle2 color={colors.harborBlue} size={14} />
        ) : null}
        <Text
          numberOfLines={1}
          style={[
            styles.statusText,
            needsReview && styles.statusReviewText,
            failed && styles.statusFailedText,
          ]}
        >
          {getDocumentStatusLabel(document.status)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  centerFill: { alignItems: "center", flex: 1, justifyContent: "center" },
  content: { gap: spacing.md, paddingBottom: spacing["2xl"] },
  topBarActions: { flexDirection: "row", gap: spacing.xs },
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  headerIcon: {
    alignItems: "center",
    borderRadius: radii.md,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  headerCopy: { flex: 1, gap: 2, minWidth: 0 },
  headerTitle: { color: colors.graphite, ...typography.display },
  headerMeta: { color: colors.mistDark, ...typography.timestamp },
  inlineError: {
    alignItems: "center",
    backgroundColor: colors.destructiveBackground,
    borderColor: colors.destructive,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
  },
  inlineErrorText: {
    color: colors.destructive,
    flex: 1,
    ...typography.timestamp,
  },
  inlineErrorRetry: {
    color: colors.destructive,
    ...typography.label,
  },
  list: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    overflow: "hidden",
  },
  documentRow: {
    alignItems: "center",
    borderBottomColor: colors.mistLight,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  documentIcon: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.sm,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  documentCopy: { flex: 1, gap: 1, minWidth: 0 },
  documentTitle: { color: colors.graphite, ...typography.title },
  documentMeta: { color: colors.mistDark, ...typography.label },
  status: {
    alignItems: "center",
    backgroundColor: colors.blueSoft,
    borderColor: "rgba(48, 84, 96, 0.2)",
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 3,
    maxWidth: 96,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusReview: {
    backgroundColor: colors.sandWarm,
    borderColor: "rgba(228, 96, 24, 0.25)",
  },
  statusFailed: {
    backgroundColor: colors.destructiveBackground,
    borderColor: "rgba(192, 57, 43, 0.25)",
  },
  statusText: { color: colors.harborBlue, ...typography.label },
  statusReviewText: { color: colors.warmApricot },
  statusFailedText: { color: colors.destructive },
  emptyBox: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.md,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyIconCircle: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderRadius: 40,
    height: 80,
    justifyContent: "center",
    width: 80,
  },
  emptyHeading: { color: colors.graphite, ...typography.headline },
  emptyText: {
    color: colors.mistDark,
    textAlign: "center",
    ...typography.timestamp,
  },
  pressed: { opacity: 0.76 },
});
