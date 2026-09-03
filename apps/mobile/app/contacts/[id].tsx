import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle, ChevronRight, Trash2, Users } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
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
import { ConfirmDialog } from "@/src/components/confirm-dialog";
import { DetailTopBar, EmptyState, ListSkeleton, OrdiloButton, Screen } from "@/src/components/ui";
import {
  deleteContact,
  getContactSubtitle,
  loadContact,
  type Contact,
} from "@/src/lib/contacts";
import { useFamily } from "@/src/lib/family-context";
import { fail, success } from "@/src/lib/feedback";
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      <DetailTopBar onBack={() => router.back()} title="Kontakt" />

      {loading ? (
        <View style={styles.content}>
          <ListSkeleton rows={3} />
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
          <OrdiloButton
            icon={<Trash2 color={colors.destructive} size={18} strokeWidth={1.8} />}
            onPress={() => {
              setDeleteError(null);
              setDeleteOpen(true);
            }}
            size="lg"
            title="Kontakt löschen"
            variant="ghost"
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
      <ConfirmDialog
        error={deleteError}
        loading={deleting}
        loadingLabel="Wird gelöscht …"
        message={
          contact?.source_document_id
            ? `"${contact.name}" wird entfernt und nicht erneut aus dem Quelldokument angelegt.`
            : `"${contact?.name ?? "Dieser Kontakt"}" wird aus euren Kontakten entfernt.`
        }
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          if (!contact || !family || deleting) return;
          setDeleting(true);
          setDeleteError(null);
          void deleteContact(contact.id, family.id)
            .then(async () => {
              await success();
              router.back();
            })
            .catch(async () => {
              setDeleting(false);
              setDeleteError(
                "Der Kontakt konnte nicht gelöscht werden. Bitte versuch es nochmal.",
              );
              await fail();
            });
        }}
        title="Kontakt löschen?"
        visible={deleteOpen}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
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
