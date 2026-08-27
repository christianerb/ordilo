import { useFocusEffect, useRouter } from "expo-router";
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  FolderPlus,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
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
  EmptyState,
  ListSkeleton,
  OrdiloButton,
  Screen,
  ScreenHeader,
} from "@/src/components/ui";
import {
  countDocumentsPerCollection,
  createCollection,
  fetchCollections,
  fetchDocumentCategories,
  getCollectionColor,
  type Collection,
} from "@/src/lib/collections";
import { useFamily } from "@/src/lib/family-context";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { success } from "@/src/lib/feedback";

/**
 * Sammlungen — the family's persistent document folders. Native list with
 * counts, pull-to-refresh and a bottom-sheet create form. Documents land
 * in a collection via their category matching the collection's name, so
 * the empty state teaches that link instead of promising a magic import.
 */
export default function SammlungenScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(
    async ({ refresh = false } = {}) => {
      if (!family) {
        setCollections([]);
        setCounts(new Map());
        setLoading(false);
        return;
      }
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [rows, categories] = await Promise.all([
          fetchCollections(family.id),
          fetchDocumentCategories(family.id),
        ]);
        setCollections(rows);
        setCounts(countDocumentsPerCollection(rows, categories));
      } catch {
        setError(
          "Deine Sammlungen konnten nicht geladen werden. Bitte versuch es nochmal.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [family],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const subtitle = useMemo(() => {
    if (collections.length === 0) return "Ordne die Dokumente deiner Familie";
    if (collections.length === 1) return "1 Sammlung";
    return `${collections.length} Sammlungen`;
  }, [collections.length]);

  if (loading && collections.length === 0) {
    return (
      <Screen>
        <BackBar onBack={() => router.back()} />
        <ScreenHeader subtitle="Sammlungen werden geladen" title="Sammlungen" />
        <ListSkeleton rows={4} />
      </Screen>
    );
  }

  if (error && collections.length === 0) {
    return (
      <Screen>
        <BackBar onBack={() => router.back()} />
        <View style={styles.centerFill}>
          <EmptyState
            icon={AlertCircle}
            heading="Sammlungen nicht erreichbar"
            description={error}
          >
            <OrdiloButton
              onPress={() => void load()}
              size="lg"
              title="Erneut versuchen"
            />
          </EmptyState>
        </View>
      </Screen>
    );
  }

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
        <BackBar onBack={() => router.back()} />

        <ScreenHeader title="Sammlungen" subtitle={subtitle} />

        {error ? (
          <View accessibilityRole="alert" style={styles.inlineError}>
            <Text style={styles.inlineErrorText}>{error}</Text>
            <Pressable onPress={() => void load({ refresh: true })}>
              <Text style={styles.inlineErrorRetry}>Erneut versuchen</Text>
            </Pressable>
          </View>
        ) : null}

        {collections.length > 0 ? (
          <View style={styles.list}>
            {collections.map((collection) => (
              <CollectionRow
                collection={collection}
                count={counts.get(collection.id) ?? 0}
                key={collection.id}
                onPress={() => router.push(`/sammlungen/${collection.id}`)}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            icon={FolderPlus}
            heading="Noch keine Sammlungen"
            description="Sammlungen sind Ordner für eure Dokumente. Ein Dokument landet automatisch in einer Sammlung, wenn seine Kategorie dazu passt."
          >
            <OrdiloButton
              onPress={() => setCreateOpen(true)}
              size="lg"
              title="Sammlung anlegen"
            />
          </EmptyState>
        )}

        {collections.length > 0 ? (
          <OrdiloButton
            onPress={() => setCreateOpen(true)}
            size="lg"
            title="Neue Sammlung"
            variant="outline"
          />
        ) : null}
      </ScrollView>

      <CollectionFormSheet
        onClose={() => setCreateOpen(false)}
        onSubmit={async (values) => {
          if (!family) {
            return { success: false, error: "Deine Familie lädt noch. Bitte einen Moment warten." };
          }
          const result = await createCollection(family.id, values);
          if (!result.success) return { success: false, error: result.error };
          await success();
          await load();
          return { success: true };
        }}
        submitLabel="Sammlung anlegen"
        title="Neue Sammlung"
        visible={createOpen}
      />
    </Screen>
  );
}

function CollectionRow({
  collection,
  count,
  onPress,
}: {
  collection: Collection;
  count: number;
  onPress: () => void;
}) {
  const color = getCollectionColor(collection.color);
  const countLabel =
    count === 0
      ? "Noch keine Dokumente"
      : count === 1
        ? "1 Dokument"
        : `${count} Dokumente`;

  return (
    <Pressable
      accessibilityHint="Öffnet die Sammlung"
      accessibilityLabel={`${collection.name}, ${countLabel}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.rowIcon, { backgroundColor: color.bg }]}>
        <CollectionIcon iconKey={collection.icon} color={color.fg} size={20} strokeWidth={1.75} />
      </View>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {collection.name}
        </Text>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {countLabel}
        </Text>
      </View>
      <ChevronRight color={colors.mist} size={20} strokeWidth={1.8} />
    </Pressable>
  );
}

/**
 * Explicit way back — the overview is pushed outside the tab navigator
 * and the root stack shows no header, so the swipe-back gesture must not
 * be the only exit (visible in the loading and error states too).
 */
function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.backBar}>
      <Pressable
        accessibilityHint="Zurück zur Ablage"
        accessibilityLabel="Zurück"
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <ArrowLeft color={colors.graphite} size={22} strokeWidth={1.8} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  centerFill: { alignItems: "center", flex: 1, justifyContent: "center" },
  backBar: { alignItems: "flex-start", paddingTop: spacing.sm },
  backButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  content: { gap: spacing.md, paddingBottom: spacing["2xl"] },
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
  row: {
    alignItems: "center",
    borderBottomColor: colors.mistLight,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowIcon: {
    alignItems: "center",
    borderRadius: radii.sm,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  rowCopy: { flex: 1, gap: 1, minWidth: 0 },
  rowTitle: { color: colors.graphite, ...typography.title },
  rowMeta: { color: colors.mistDark, ...typography.label },
  pressed: { opacity: 0.76 },
});
