import { useFocusEffect, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  ChevronRight,
  Copy,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Users,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, OrdiloButton, Screen, ScreenHeader } from "@/src/components/ui";
import {
  buildWhatsAppHref,
  createContact,
  filterContacts,
  getContactInitial,
  getContactReachLine,
  getContactSubtitle,
  loadContacts,
  mergeSavedContact,
  normalizePhoneForLink,
  sortContactsByName,
  splitContactsByStatus,
  updateContact,
  type Contact,
  type ContactInput,
} from "@/src/lib/contacts";
import { useFamily } from "@/src/lib/family-context";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

type Icon = typeof Phone;

const EMPTY_FORM: ContactInput = {
  name: "",
  organization: "",
  role: "",
  phone: "",
  email: "",
};

/**
 * Kontakte — the family address book, native edition.
 *
 * Fachliche Referenz ist src/app/(app)/dokumente/contacts-view.tsx, aber
 * nativ gedacht: ein Screen statt Drawer, Bottom-Sheets statt Dialoge,
 * systemnahe Aktionen (Anrufen, E-Mail, WhatsApp via Linking), Kopieren
 * per Tap mit Haptik, und alle echten Zustände (Laden, leer, Fehler mit
 * Retry, Pull-to-Refresh).
 */
export default function ContactsScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  const load = useCallback(
    async ({ refresh = false } = {}) => {
      if (!family) {
        setContacts([]);
        setLoading(false);
        return;
      }
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        setContacts(await loadContacts(family.id));
      } catch {
        setError(
          "Deine Kontakte konnten nicht geladen werden. Bitte versuch es nochmal.",
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

  // Keep the open detail sheet in sync after an edit saved successfully.
  const handleSaved = useCallback((saved: Contact) => {
    setContacts((current) => mergeSavedContact(current, saved));
    setSelected((current) => (current?.id === saved.id ? saved : current));
    setFormOpen(false);
    setEditing(null);
  }, []);

  const { suggested, confirmed } = useMemo(
    () => splitContactsByStatus(contacts),
    [contacts],
  );
  const visible = useMemo(
    () => sortContactsByName(filterContacts(confirmed, query)),
    [confirmed, query],
  );

  const countLabel = useMemo(() => {
    if (confirmed.length === 1) return "1 Kontakt der Familie";
    return `${confirmed.length} Kontakte der Familie`;
  }, [confirmed.length]);

  if (loading && contacts.length === 0) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator
          accessibilityLabel="Kontakte werden geladen"
          color={colors.harborBlue}
        />
      </Screen>
    );
  }

  if (error && contacts.length === 0) {
    return (
      <Screen>
        <DetailHeader title="Kontakte" onBack={() => router.back()} />
        <EmptyState
          icon={AlertCircle}
          heading="Kontakte nicht erreichbar"
          description={error}
        >
          <OrdiloButton
            onPress={() => void load()}
            size="lg"
            title="Erneut versuchen"
          />
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen>
      <DetailHeader title="Kontakte" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
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
        <ScreenHeader subtitle={countLabel} title="Kontakte" />

        <OrdiloButton
          icon={<Plus color={colors.warmWhite} size={18} strokeWidth={2.2} />}
          onPress={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          title="Kontakt hinzufügen"
        />

        {contacts.length > 0 ? (
          <View style={styles.search}>
            <Search color={colors.mistDark} size={19} strokeWidth={1.8} />
            <TextInput
              accessibilityLabel="Kontakte durchsuchen"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              onChangeText={setQuery}
              placeholder="Kontakte durchsuchen"
              placeholderTextColor={colors.mistDark}
              returnKeyType="search"
              style={styles.searchInput}
              value={query}
            />
          </View>
        ) : null}

        {error ? (
          <View accessibilityRole="alert" style={styles.inlineError}>
            <Text style={styles.inlineErrorText}>{error}</Text>
            <Pressable onPress={() => void load({ refresh: contacts.length > 0 })}>
              <Text style={styles.inlineErrorRetry}>Erneut versuchen</Text>
            </Pressable>
          </View>
        ) : null}

        {suggested.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>In Dokumenten gefunden</Text>
            <View style={styles.list}>
              {suggested.map((contact) => (
                <SuggestionRow
                  contact={contact}
                  key={contact.id}
                  onOpenSource={() =>
                    contact.source_document_id
                      ? router.push(`/document/${contact.source_document_id}`)
                      : undefined
                  }
                />
              ))}
            </View>
          </View>
        ) : null}

        {visible.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Kontakte</Text>
            <View style={styles.list}>
              {visible.map((contact) => (
                <ContactRow
                  contact={contact}
                  key={contact.id}
                  onPress={() => setSelected(contact)}
                />
              ))}
            </View>
          </View>
        ) : query.trim() ? (
          <View style={styles.filteredEmpty}>
            <Search color={colors.mist} size={28} strokeWidth={1.5} />
            <Text style={styles.filteredEmptyTitle}>Kein Kontakt gefunden</Text>
            <Text style={styles.filteredEmptyText}>
              Versuch es mit einem anderen Namen.
            </Text>
            <OrdiloButton
              onPress={() => setQuery("")}
              title="Suche löschen"
              variant="ghost"
            />
          </View>
        ) : suggested.length === 0 ? (
          <EmptyState
            icon={Users}
            heading="Noch keine Kontakte"
            description="Ordilo erkennt Kontaktdaten in Dokumenten. Du kannst auch selbst einen Kontakt anlegen."
          />
        ) : null}
      </ScrollView>

      <ContactDetailSheet
        contact={selected}
        onClose={() => setSelected(null)}
        onEdit={(contact) => {
          setSelected(null);
          setEditing(contact);
          setFormOpen(true);
        }}
        onOpenSource={(documentId) => router.push(`/document/${documentId}`)}
      />
      <ContactFormSheet
        contact={editing}
        familyId={family?.id ?? null}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
        visible={formOpen}
      />
    </Screen>
  );
}

function DetailHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.topbar}>
      <Pressable
        accessibilityLabel="Zurück"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={styles.back}
      >
        <ArrowLeft color={colors.graphite} size={22} />
      </Pressable>
      <Text style={styles.topTitle}>{title}</Text>
    </View>
  );
}

function ContactAvatar({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.avatar, large && styles.avatarLarge]}
    >
      <Text style={[styles.avatarText, large && styles.avatarTextLarge]}>
        {getContactInitial(name)}
      </Text>
    </View>
  );
}

function SuggestionRow({
  contact,
  onOpenSource,
}: {
  contact: Contact;
  onOpenSource: () => void;
}) {
  return (
    <View style={styles.suggestionRow}>
      <ContactAvatar name={contact.name} />
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {contact.name}
        </Text>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {contact.organization || contact.phone || contact.email}
        </Text>
      </View>
      {contact.source_document_id ? (
        <Pressable
          accessibilityHint="Öffnet das Dokument, in dem dieser Kontakt gefunden wurde"
          accessibilityLabel={`${contact.name} prüfen`}
          accessibilityRole="button"
          onPress={onOpenSource}
          style={({ pressed }) => [styles.reviewButton, pressed && styles.pressed]}
        >
          <Text style={styles.reviewButtonText}>Prüfen</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ContactRow({
  contact,
  onPress,
}: {
  contact: Contact;
  onPress: () => void;
}) {
  const subtitle = getContactSubtitle(contact);
  return (
    <Pressable
      accessibilityHint="Öffnet die Kontaktdaten"
      accessibilityLabel={contact.name}
      accessibilityRole="button"
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.contactRow, pressed && styles.pressed]}
    >
      <ContactAvatar name={contact.name} />
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {contact.name}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.rowMeta}>
            {subtitle}
          </Text>
        ) : null}
        {getContactReachLine(contact) ? (
          <Text numberOfLines={1} style={styles.rowReach}>
            {getContactReachLine(contact)}
          </Text>
        ) : null}
      </View>
      <ChevronRight color={colors.mistDark} size={18} />
    </Pressable>
  );
}

function ContactDetailSheet({
  contact,
  onClose,
  onEdit,
  onOpenSource,
}: {
  contact: Contact | null;
  onClose: () => void;
  onEdit: (contact: Contact) => void;
  onOpenSource: (documentId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!contact) return null;
  const whatsapp = contact.phone ? buildWhatsAppHref(contact.phone) : null;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      transparent
      visible
    >
      <Pressable onPress={onClose} style={styles.modalOverlay}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <ContactAvatar large name={contact.name} />
            <View style={styles.sheetHeaderCopy}>
              <Text numberOfLines={2} style={styles.sheetTitle}>
                {contact.name}
              </Text>
              <Text numberOfLines={1} style={styles.sheetSubtitle}>
                {getContactSubtitle(contact) || "Kontakt"}
              </Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.sheetBody}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.actionGrid}>
              <ContactAction
                href={contact.phone ? `tel:${normalizePhoneForLink(contact.phone)}` : null}
                icon={Phone}
                label="Anrufen"
              />
              <ContactAction
                href={contact.email ? `mailto:${contact.email}` : null}
                icon={Mail}
                label="E-Mail"
              />
              <ContactAction
                href={whatsapp}
                icon={MessageCircle}
                label="WhatsApp"
              />
            </View>
            {contact.phone && !whatsapp ? (
              <Text style={styles.whatsappHint}>
                Für WhatsApp braucht die Nummer eine internationale Vorwahl,
                zum Beispiel +49.
              </Text>
            ) : null}

            <View style={styles.detailCard}>
              {contact.phone ? (
                <DetailValueRow icon={Phone} label="Telefon" value={contact.phone} />
              ) : null}
              {contact.email ? (
                <DetailValueRow icon={Mail} label="E-Mail" value={contact.email} />
              ) : null}
              {contact.organization ? (
                <DetailValueRow
                  icon={Building2}
                  label="Organisation"
                  value={contact.organization}
                />
              ) : null}
            </View>

            {contact.source_document_id ? (
              <Pressable
                accessibilityHint="Öffnet das Dokument, aus dem dieser Kontakt stammt"
                accessibilityLabel="Quelldokument öffnen"
                accessibilityRole="button"
                onPress={() => onOpenSource(contact.source_document_id!)}
                style={({ pressed }) => [styles.sourceButton, pressed && styles.pressed]}
              >
                <Text style={styles.sourceButtonText}>Quelldokument öffnen</Text>
                <ChevronRight color={colors.harborBlue} size={18} />
              </Pressable>
            ) : null}
          </ScrollView>

          <View style={styles.sheetFooter}>
            <OrdiloButton
              onPress={() => onEdit(contact)}
              title="Kontakt bearbeiten"
              variant="outline"
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ContactAction({
  href,
  icon: ActionIcon,
  label,
}: {
  href: string | null;
  icon: Icon;
  label: string;
}) {
  const open = async () => {
    if (!href) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const supported = await Linking.canOpenURL(href);
      if (!supported) throw new Error("No handler");
      await Linking.openURL(href);
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <Pressable
      accessibilityHint={
        href ? `Öffnet ${label} auf diesem Gerät` : `${label} ist nicht verfügbar`
      }
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: !href }}
      disabled={!href}
      onPress={() => void open()}
      style={({ pressed }) => [
        styles.action,
        href && styles.actionActive,
        pressed && styles.pressed,
        !href && styles.actionDisabled,
      ]}
    >
      <ActionIcon
        color={href ? colors.harborBlue : colors.mistDark}
        size={20}
        strokeWidth={1.8}
      />
      <Text style={[styles.actionText, !href && styles.actionTextDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

function DetailValueRow({
  icon: RowIcon,
  label,
  value,
}: {
  icon: Icon;
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const copy = async () => {
    const success = await Clipboard.setStringAsync(value);
    if (!success) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <View style={styles.detailRow}>
      <RowIcon color={colors.mistDark} size={18} strokeWidth={1.8} />
      <View style={styles.detailValue}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text selectable style={styles.detailText}>
          {value}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={`${label} kopieren`}
        accessibilityRole="button"
        hitSlop={6}
        onPress={() => void copy()}
        style={styles.iconButton}
      >
        {copied ? (
          <Check color={colors.harborBlue} size={18} />
        ) : (
          <Copy color={colors.harborBlue} size={18} />
        )}
      </Pressable>
    </View>
  );
}

function ContactFormSheet({
  contact,
  familyId,
  onClose,
  onSaved,
  visible,
}: {
  contact: Contact | null;
  familyId: string | null;
  onClose: () => void;
  onSaved: (contact: Contact) => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<ContactInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form whenever the sheet opens for another contact.
  useEffect(() => {
    if (!visible) return;
    void Promise.resolve().then(() => {
      setForm(
        contact
          ? {
              name: contact.name,
              organization: contact.organization ?? "",
              role: contact.role ?? "",
              phone: contact.phone ?? "",
              email: contact.email ?? "",
            }
          : EMPTY_FORM,
      );
      setError(null);
      setSaving(false);
    });
  }, [visible, contact]);

  const patch = useCallback(
    (key: keyof ContactInput) => (value: string) =>
      setForm((current) => ({ ...current, [key]: value })),
    [],
  );

  const save = async () => {
    if (!familyId || saving) return;
    setSaving(true);
    setError(null);
    const result = contact
      ? await updateContact(contact.id, familyId, form)
      : await createContact(familyId, form);
    if (!result.success) {
      setSaving(false);
      setError(result.error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(false);
    onSaved(result.contact);
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      transparent
      visible={visible}
    >
      <Pressable onPress={onClose} style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            accessibilityViewIsModal
            onPress={(event) => event.stopPropagation()}
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              {contact ? "Kontakt bearbeiten" : "Neuer Kontakt"}
            </Text>
            <Text style={styles.sheetFormHint}>
              Telefonnummer oder E-Mail-Adresse reicht.
            </Text>
            <ScrollView
              contentContainerStyle={styles.formBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <FormField
                autoFocus
                label="Name"
                onChangeText={patch("name")}
                value={form.name}
              />
              <FormField
                label="Organisation"
                onChangeText={patch("organization")}
                value={form.organization ?? ""}
              />
              <FormField
                label="Rolle"
                onChangeText={patch("role")}
                value={form.role ?? ""}
              />
              <FormField
                keyboardType="phone-pad"
                label="Telefon"
                onChangeText={patch("phone")}
                value={form.phone ?? ""}
              />
              <FormField
                autoCapitalize="none"
                keyboardType="email-address"
                label="E-Mail"
                onChangeText={patch("email")}
                value={form.email}
              />
              {error ? (
                <Text accessibilityRole="alert" style={styles.formError}>
                  {error}
                </Text>
              ) : null}
            </ScrollView>
            <View style={styles.sheetFooter}>
              <OrdiloButton
                disabled={saving || !familyId}
                icon={
                  saving ? (
                    <ActivityIndicator color={colors.warmWhite} size="small" />
                  ) : undefined
                }
                onPress={() => void save()}
                size="lg"
                title={saving ? "Wird gespeichert …" : "Kontakt speichern"}
              />
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function FormField({
  autoCapitalize = "sentences",
  autoFocus = false,
  keyboardType = "default",
  label,
  onChangeText,
  value,
}: {
  autoCapitalize?: "none" | "sentences";
  autoFocus?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad";
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        autoFocus={autoFocus}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        style={styles.fieldInput}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  topbar: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 44,
  },
  back: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  topTitle: { color: colors.graphite, ...typography.title },
  content: { gap: spacing.md, paddingBottom: spacing["2xl"] },
  search: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.base,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: 12,
  },
  searchInput: { color: colors.graphite, flex: 1, ...typography.body },
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
  inlineErrorText: { color: colors.destructive, flex: 1, ...typography.timestamp },
  inlineErrorRetry: { color: colors.destructive, ...typography.label },
  section: { gap: spacing.sm },
  sectionHeading: { color: colors.graphite, ...typography.title },
  list: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    overflow: "hidden",
  },
  suggestionRow: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderBottomColor: colors.mistLight,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  contactRow: {
    alignItems: "center",
    borderBottomColor: colors.mistLight,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  avatarLarge: { height: 56, width: 56 },
  avatarText: {
    color: colors.warmWhite,
    fontFamily: typography.display.fontFamily,
    fontSize: 16,
  },
  avatarTextLarge: { fontSize: 20 },
  rowCopy: { flex: 1, gap: 1, minWidth: 0 },
  rowTitle: { color: colors.graphite, ...typography.title },
  rowMeta: { color: colors.mistDark, ...typography.timestamp },
  rowReach: { color: colors.harborBlue, ...typography.timestamp },
  reviewButton: {
    alignItems: "center",
    borderColor: colors.harborBlue,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  reviewButtonText: { color: colors.harborBlue, ...typography.label },
  filteredEmpty: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.md,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  filteredEmptyTitle: { color: colors.graphite, ...typography.title },
  filteredEmptyText: {
    color: colors.mistDark,
    textAlign: "center",
    ...typography.timestamp,
  },
  pressed: { opacity: 0.76 },
  modalOverlay: {
    backgroundColor: "rgba(38, 36, 33, 0.28)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.warmWhite,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: "88%",
    paddingHorizontal: spacing.md,
  },
  sheetHandle: {
    alignSelf: "center",
    backgroundColor: colors.mistLight,
    borderRadius: radii.pill,
    height: 4,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
    width: 40,
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  sheetHeaderCopy: { flex: 1, gap: 2, minWidth: 0 },
  sheetTitle: { color: colors.graphite, ...typography.display },
  sheetSubtitle: { color: colors.mistDark, ...typography.timestamp },
  sheetFormHint: { color: colors.mistDark, ...typography.timestamp },
  sheetBody: { gap: spacing.md, paddingTop: spacing.sm },
  actionGrid: { flexDirection: "row", gap: spacing.sm },
  action: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 56,
  },
  actionActive: { borderColor: "rgba(48, 84, 96, 0.35)" },
  actionDisabled: { opacity: 0.4 },
  actionText: { color: colors.harborBlue, ...typography.label },
  actionTextDisabled: { color: colors.mistDark },
  whatsappHint: { color: colors.mistDark, ...typography.label },
  detailCard: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  detailRow: {
    alignItems: "center",
    borderBottomColor: colors.mistLight,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 52,
    paddingVertical: spacing.xs,
  },
  detailValue: { flex: 1, gap: 1, minWidth: 0 },
  detailLabel: { color: colors.mistDark, ...typography.label },
  detailText: { color: colors.graphite, ...typography.body },
  iconButton: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  sourceButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 44,
  },
  sourceButtonText: { color: colors.harborBlue, ...typography.title },
  sheetFooter: { paddingTop: spacing.sm },
  formBody: { gap: spacing.sm, paddingTop: spacing.sm },
  field: { gap: spacing.xs },
  fieldLabel: { color: colors.mistDark, ...typography.label },
  fieldInput: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.base,
    borderWidth: 1,
    color: colors.graphite,
    minHeight: 44,
    paddingHorizontal: 12,
    ...typography.body,
  },
  formError: { color: colors.destructive, ...typography.timestamp },
});
