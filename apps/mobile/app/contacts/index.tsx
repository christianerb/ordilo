import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Users,
} from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";

import {
  ContactAvatar,
  ContactFormSheet,
  getCallHref,
  getWhatsAppHref,
  openContactHref,
} from "@/src/components/contacts";
import { EmptyState, OrdiloButton, Screen, ScreenHeader } from "@/src/components/ui";
import {
  filterContacts,
  getContactReachLine,
  getContactSubtitle,
  groupContactsIntoSections,
  loadContacts,
  mergeSavedContact,
  splitContactsByStatus,
  type Contact,
} from "@/src/lib/contacts";
import { useFamily } from "@/src/lib/family-context";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

/**
 * Kontakte — the family address book as a native list.
 *
 * Alphabet sections in German phonebook order (DIN 5007-1), swipe
 * shortcuts for Anrufen/WhatsApp (accelerators only — the same actions
 * live on the detail route), and a detail push instead of a sheet, so
 * /contacts/<id> is deep-linkable and keeps the iOS back gesture.
 */
export default function ContactsScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);

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

  const handleCreated = useCallback((saved: Contact) => {
    setContacts((current) => mergeSavedContact(current, saved));
    setFormOpen(false);
  }, []);

  const { suggested, confirmed } = useMemo(
    () => splitContactsByStatus(contacts),
    [contacts],
  );
  const sections = useMemo(
    () => groupContactsIntoSections(filterContacts(confirmed, query)),
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
        <ListHeader title="Kontakte" onBack={() => router.back()} />
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

  const searching = Boolean(query.trim());

  return (
    <Screen>
      <ListHeader title="Kontakte" onBack={() => router.back()} />
      <SectionList
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(contact) => contact.id}
        ListEmptyComponent={
          searching ? (
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
            <View style={styles.emptyGrow}>
              <EmptyState
                icon={Users}
                heading="Noch keine Kontakte"
                description="Ordilo erkennt Kontaktdaten in Dokumenten. Du kannst auch selbst einen Kontakt anlegen."
              />
            </View>
          ) : null
        }
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <ScreenHeader subtitle={countLabel} title="Kontakte" />
            <OrdiloButton
              icon={<Plus color={colors.warmWhite} size={18} strokeWidth={2.2} />}
              onPress={() => setFormOpen(true)}
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
                <Pressable
                  onPress={() => void load({ refresh: contacts.length > 0 })}
                >
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
            {sections.length > 0 ? (
              <Text style={styles.sectionHeading}>Kontakte</Text>
            ) : null}
          </View>
        }
        refreshControl={
          <RefreshControl
            colors={[colors.harborBlue]}
            onRefresh={() => void load({ refresh: true })}
            refreshing={refreshing}
            tintColor={colors.harborBlue}
          />
        }
        renderItem={({ item, index, section }) => (
          <SwipeableContactRow
            contact={item}
            first={index === 0}
            last={index === section.data.length - 1}
            onPress={() => router.push(`/contacts/${item.id}`)}
          />
        )}
        renderSectionHeader={({ section }) => (
          <Text style={styles.alphabetHeader}>{section.title}</Text>
        )}
        sections={sections}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled
      />

      <ContactFormSheet
        contact={null}
        familyId={family?.id ?? null}
        onClose={() => setFormOpen(false)}
        onSaved={handleCreated}
        visible={formOpen}
      />
    </Screen>
  );
}

function ListHeader({
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

/**
 * One contact row with swipe shortcuts. Swiping left reveals Anrufen and
 * WhatsApp — pure accelerators (the detail route shows the same actions
 * as visible buttons), never destructive, and the row snaps back.
 */
function SwipeableContactRow({
  contact,
  first,
  last,
  onPress,
}: {
  contact: Contact;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const callHref = getCallHref(contact);
  const whatsappHref = getWhatsAppHref(contact);

  const runAction = (href: string) => {
    swipeableRef.current?.close();
    void openContactHref(href);
  };

  const row = (
    <Pressable
      accessibilityHint="Öffnet die Kontaktdaten"
      accessibilityLabel={contact.name}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.contactRow,
        last && styles.contactRowLast,
        pressed && styles.pressed,
      ]}
    >
      <ContactAvatar name={contact.name} />
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {contact.name}
        </Text>
        {getContactSubtitle(contact) ? (
          <Text numberOfLines={1} style={styles.rowMeta}>
            {getContactSubtitle(contact)}
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

  const cardStyle = [
    styles.sectionCard,
    first && styles.sectionCardFirst,
    last && styles.sectionCardLast,
  ];

  if (!callHref && !whatsappHref) {
    return <View style={cardStyle}>{row}</View>;
  }

  return (
    <View style={cardStyle}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        friction={2}
        onSwipeableWillOpen={() => void Haptics.selectionAsync()}
        overshootRight={false}
        renderRightActions={() => (
          <View style={styles.swipeActions}>
            {callHref ? (
              <Pressable
                accessibilityHint="Öffnet die Telefon-App"
                accessibilityLabel={`${contact.name} anrufen`}
                accessibilityRole="button"
                onPress={() => runAction(callHref)}
                style={({ pressed }) => [
                  styles.swipeAction,
                  styles.swipeCall,
                  pressed && styles.pressed,
                ]}
              >
                <Phone color={colors.warmWhite} size={19} strokeWidth={2} />
                <Text style={styles.swipeCallText}>Anrufen</Text>
              </Pressable>
            ) : null}
            {whatsappHref ? (
              <Pressable
                accessibilityHint="Öffnet WhatsApp"
                accessibilityLabel={`${contact.name} per WhatsApp anschreiben`}
                accessibilityRole="button"
                onPress={() => runAction(whatsappHref)}
                style={({ pressed }) => [
                  styles.swipeAction,
                  styles.swipeWhatsApp,
                  pressed && styles.pressed,
                ]}
              >
                <MessageCircle
                  color={colors.harborBlue}
                  size={19}
                  strokeWidth={2}
                />
                <Text style={styles.swipeWhatsAppText}>WhatsApp</Text>
              </Pressable>
            ) : null}
          </View>
        )}
        rightThreshold={40}
      >
        {row}
      </ReanimatedSwipeable>
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
  content: { flexGrow: 1, gap: 0, paddingBottom: spacing["2xl"] },
  headerContent: { gap: spacing.md, paddingBottom: spacing.md },
  emptyGrow: { flexGrow: 1, justifyContent: "center" },
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
  alphabetHeader: {
    backgroundColor: colors.warmWhite,
    color: colors.mistDark,
    paddingBottom: spacing.xs,
    paddingTop: spacing.sm,
    ...typography.label,
  },
  list: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionCard: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  sectionCardFirst: {
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.sm,
    borderTopWidth: 1,
    overflow: "hidden",
  },
  sectionCardLast: {
    borderBottomLeftRadius: radii.sm,
    borderBottomRightRadius: radii.sm,
    borderBottomWidth: 1,
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
    backgroundColor: colors.sand,
    borderBottomColor: colors.mistLight,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  contactRowLast: { borderBottomWidth: 0 },
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
  swipeActions: { flexDirection: "row" },
  swipeAction: {
    alignItems: "center",
    gap: spacing.xs,
    justifyContent: "center",
    minWidth: 84,
    paddingHorizontal: spacing.sm,
  },
  swipeCall: { backgroundColor: colors.harborBlue },
  swipeCallText: { color: colors.warmWhite, ...typography.label },
  swipeWhatsApp: {
    backgroundColor: colors.sandLight,
    borderColor: "rgba(48, 84, 96, 0.35)",
    borderLeftWidth: 1,
  },
  swipeWhatsAppText: { color: colors.harborBlue, ...typography.label },
  filteredEmpty: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.xl,
  },
  filteredEmptyTitle: { color: colors.graphite, ...typography.title },
  filteredEmptyText: {
    color: colors.mistDark,
    textAlign: "center",
    ...typography.timestamp,
  },
  pressed: { opacity: 0.76 },
});
