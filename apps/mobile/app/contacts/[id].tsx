import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle, ArrowLeft, ChevronRight, Users } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  ContactActionGrid,
  ContactAvatar,
  ContactDetailsCard,
  ContactFormSheet,
} from "@/src/components/contacts";
import { EmptyState, OrdiloButton, Screen } from "@/src/components/ui";
import {
  getContactSubtitle,
  loadContact,
  type Contact,
} from "@/src/lib/contacts";
import { useFamily } from "@/src/lib/family-context";
import { colors, spacing, typography } from "@/src/theme/tokens";

/**
 * Contact detail as a real stack route (/contacts/<id>) — native push
 * transition with the iOS back gesture, deep-linkable for the platform
 * layer, and no modal that could sit above a pushed source document.
 */
export default function ContactDetailScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id || !family) {
      setError("Der Kontakt fehlt.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const value = await loadContact(id, family.id);
      setContact(value);
      if (!value) {
        setError("Dieser Kontakt wurde nicht gefunden.");
      }
    } catch {
      setContact(null);
      setError(
        "Der Kontakt kann gerade nicht geladen werden. Bitte versuch es nochmal.",
      );
    } finally {
      setLoading(false);
    }
  }, [id, family]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  return (
    <Screen style={styles.screen}>
      <View style={styles.topbar}>
        <Pressable
          accessibilityLabel="Zurück"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.back}
        >
          <ArrowLeft color={colors.graphite} size={22} />
        </Pressable>
        <Text style={styles.topTitle}>Kontakt</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator
            accessibilityLabel="Kontakt wird geladen"
            color={colors.harborBlue}
          />
        </View>
      ) : !contact ? (
        <EmptyState
          icon={AlertCircle}
          heading="Kontakt nicht verfügbar"
          description={error ?? "Dieser Kontakt kann gerade nicht geöffnet werden."}
        >
          <OrdiloButton
            onPress={() => void load()}
            size="lg"
            title="Erneut versuchen"
          />
        </EmptyState>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.identity}>
            <ContactAvatar large name={contact.name} />
            <View style={styles.identityCopy}>
              <Text style={styles.name}>{contact.name}</Text>
              <Text style={styles.subtitle}>
                {getContactSubtitle(contact) || "Kontakt der Familie"}
              </Text>
            </View>
          </View>

          <ContactActionGrid contact={contact} />
          <ContactDetailsCard contact={contact} />

          {contact.source_document_id ? (
            <Pressable
              accessibilityHint="Öffnet das Dokument, aus dem dieser Kontakt stammt"
              accessibilityLabel="Quelldokument öffnen"
              accessibilityRole="button"
              onPress={() =>
                router.push(`/document/${contact.source_document_id}`)
              }
              style={({ pressed }) => [
                styles.sourceButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.sourceButtonText}>Quelldokument öffnen</Text>
              <ChevronRight color={colors.harborBlue} size={18} />
            </Pressable>
          ) : null}

          <OrdiloButton
            icon={<Users color={colors.graphite} size={18} strokeWidth={1.8} />}
            onPress={() => setFormOpen(true)}
            size="lg"
            title="Kontakt bearbeiten"
            variant="outline"
          />
        </ScrollView>
      )}

      <ContactFormSheet
        contact={contact}
        familyId={family?.id ?? null}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => {
          setContact(saved);
          setFormOpen(false);
        }}
        visible={formOpen}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  topbar: {
    alignItems: "center",
    borderBottomColor: colors.mistLight,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  back: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  topTitle: { color: colors.graphite, ...typography.title },
  center: { alignItems: "center", flex: 1, justifyContent: "center" },
  content: {
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: spacing["2xl"],
  },
  identity: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  identityCopy: { flex: 1, gap: 2, minWidth: 0 },
  name: { color: colors.graphite, ...typography.display },
  subtitle: { color: colors.mistDark, ...typography.timestamp },
  sourceButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 44,
  },
  sourceButtonText: { color: colors.harborBlue, ...typography.title },
  pressed: { opacity: 0.76 },
});
