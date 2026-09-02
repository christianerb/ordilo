import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Cake,
  Check,
  Copy,
  LogOut,
  Settings,
  Share2,
  UserPlus,
  Users,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmDialog } from "@/src/components/confirm-dialog";
import { AvatarStack, PersonAvatar } from "@/src/components/person";
import {
  OrdiloFormBody,
  OrdiloFormField,
  OrdiloFormFooter,
  OrdiloFormInput,
  OrdiloFormSheet,
} from "@/src/components/sheet";
import {
  DetailTopBar,
  EmptyState,
  IconTile,
  InlineNotice,
  ListGroup,
  ListRow,
  ListSkeleton,
  OrdiloButton,
  Screen,
  ScreenHeader,
  SectionHeader,
} from "@/src/components/ui";
import { getApiUrl } from "@/src/lib/api";
import { useFamily } from "@/src/lib/family-context";
import { createFamilyInvite } from "@/src/lib/invites";
import { listMembers, updateMember, type MemberRow } from "@/src/lib/onboarding-actions";
import { AVATAR_COLORS } from "@/src/lib/onboarding";
import { memberToPerson } from "@/src/lib/people";
import { useSession } from "@/src/lib/session";
import { colors, radii, sizes, spacing, typography } from "@/src/theme/tokens";

/**
 * Familie — who Ordilo works for. A stack screen reached from the faces in
 * the Start header: the people (with role and birthday), one calm way to
 * invite someone, and the door to the device settings and the account.
 * Editing a person happens in a sheet; the family itself shows up on
 * every row of the app, which is why this list does not need a tab.
 */
export default function FamilieScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useSession();
  const { family } = useFamily();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberRow | null>(null);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const loadSeqRef = useRef(0);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMembers = useCallback(async ({
    refresh = false,
    silent = false,
  }: {
    refresh?: boolean;
    silent?: boolean;
  } = {}) => {
    const sequence = ++loadSeqRef.current;
    if (!family) {
      setMembers([]);
      setLoading(false);
      return;
    }
    if (refresh) setRefreshing(true);
    else if (!silent) setLoading(true);
    setMemberError(null);
    const result = await listMembers(family.id);
    if (sequence !== loadSeqRef.current) return;
    if (result.success) setMembers(result.data);
    else setMemberError(result.error);
    setLoading(false);
    setRefreshing(false);
  }, [family]);

  useFocusEffect(useCallback(() => {
    void loadMembers({ silent: true });
  }, [loadMembers]));

  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
  }, []);

  const shareInvite = useCallback(async (url: string) => {
    try {
      await Share.share({
        title: "Ordilo — Familieneinladung",
        message: `Komm in unseren Ordilo-Familienordner:\n${url}`,
      });
    } catch {
      // Dismissing the native share sheet keeps the invite ready to copy.
    }
  }, []);

  const handleInvite = useCallback(async () => {
    if (creating || !family?.isOwner) return;
    setCreating(true);
    setInviteError(null);

    const result = await createFamilyInvite(family.id);
    setCreating(false);

    if (!result.success) {
      setInviteError(result.error);
      return;
    }

    const url = `${getApiUrl()}/invite/${result.token}`;
    setInviteUrl(url);
    await shareInvite(url);
  }, [creating, family, shareInvite]);

  const handleCopy = useCallback(async () => {
    if (!inviteUrl) return;
    const ok = await Clipboard.setStringAsync(inviteUrl);
    if (!ok) return;
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2_000);
  }, [inviteUrl]);

  const saveMember = useCallback(async (
    member: MemberRow,
    values: { name: string; avatarColor: string; birthdate: string },
  ) => {
    if (!family) return { success: false, error: "Deine Familie konnte nicht geladen werden." };
    const result = await updateMember(family.id, member.id, {
      name: values.name,
      avatar_color: values.avatarColor,
      birthdate: values.birthdate,
    });
    if (result.success) {
      setMembers((current) =>
        current.map((candidate) => candidate.id === member.id ? result.data : candidate),
      );
    }
    return result.success
      ? { success: true }
      : { success: false, error: result.error };
  }, [family]);

  const people = useMemo(() => members.map(memberToPerson), [members]);
  const subtitle = useMemo(() => {
    if (loading && members.length === 0) return "Wird geladen …";
    if (members.length === 0) return "Noch niemand eingetragen";
    return members.length === 1 ? "1 Person" : `${members.length} Personen`;
  }, [loading, members.length]);

  return (
    <Screen style={styles.screen}>
      <DetailTopBar onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.lg },
        ]}
        refreshControl={
          <RefreshControl
            colors={[colors.harborBlue]}
            onRefresh={() => void loadMembers({ refresh: true })}
            refreshing={refreshing}
            tintColor={colors.harborBlue}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          subtitle={subtitle}
          title={family?.name ? `Familie ${family.name}` : "Familie"}
          trailing={people.length > 0 ? <AvatarStack max={4} people={people} size={36} /> : undefined}
        />

        {loading && members.length === 0 ? (
          <ListSkeleton rows={3} />
        ) : memberError ? (
          <EmptyState
            description={memberError}
            heading="Familie nicht erreichbar"
            icon={Users}
          >
            <OrdiloButton onPress={() => void loadMembers()} size="lg" title="Erneut versuchen" />
          </EmptyState>
        ) : (
          <View style={styles.section}>
            <SectionHeader title="Wer dazugehört" />
            <ListGroup>
              {members.map((member, index) => (
                <ListRow
                  accessibilityHint="Öffnet Name, Farbe und Geburtstag zum Bearbeiten"
                  accessibilityLabel={`${member.name} bearbeiten`}
                  chevron
                  first={index === 0}
                  key={member.id}
                  leading={<PersonAvatar person={memberToPerson(member)} size={sizes.tile} />}
                  onPress={() => setEditingMember(member)}
                  subtitle={describeMember(member)}
                  title={member.name}
                />
              ))}
              {family?.isOwner ? (
                <ListRow
                  accessibilityHint="Erstellt einen Einladungslink zum Teilen"
                  accessibilityLabel="Person einladen"
                  first={members.length === 0}
                  leading={
                    <IconTile tint={colors.washSage}>
                      {creating ? (
                        <ActivityIndicator color={colors.harborBlue} size="small" />
                      ) : (
                        <UserPlus color={colors.harborBlue} size={20} strokeWidth={2} />
                      )}
                    </IconTile>
                  }
                  onPress={() => void handleInvite()}
                  subtitle="Partner:in, Oma oder wer mithelfen soll"
                  title={creating ? "Einladung wird erstellt …" : "Person einladen"}
                />
              ) : null}
            </ListGroup>
            {inviteError ? <InlineNotice message={inviteError} /> : null}
            {inviteUrl ? (
              <View style={styles.linkPanel}>
                <Text style={styles.linkLabel}>Einladungslink, 14 Tage gültig</Text>
                <Text numberOfLines={1} selectable style={styles.linkText}>{inviteUrl}</Text>
                <View style={styles.linkActions}>
                  <OrdiloButton
                    icon={copied
                      ? <Check color={colors.graphite} size={16} />
                      : <Copy color={colors.graphite} size={16} />}
                    onPress={() => void handleCopy()}
                    title={copied ? "Kopiert" : "Kopieren"}
                    variant="outline"
                  />
                  <OrdiloButton
                    icon={<Share2 color={colors.warmWhite} size={16} />}
                    onPress={() => void shareInvite(inviteUrl)}
                    title="Teilen"
                  />
                </View>
              </View>
            ) : null}
          </View>
        )}

        <View style={styles.section}>
          <SectionHeader title="App" />
          <ListGroup>
            <ListRow
              chevron
              first
              leading={
                <IconTile>
                  <Settings color={colors.mistDark} size={20} strokeWidth={1.9} />
                </IconTile>
              }
              onPress={() => router.push("/einstellungen")}
              subtitle="App-Sperre, Mitteilungen, Rechtliches"
              title="Einstellungen"
            />
            <ListRow
              leading={
                <IconTile>
                  <LogOut color={colors.mistDark} size={20} strokeWidth={1.9} />
                </IconTile>
              }
              onPress={() => setSignOutOpen(true)}
              subtitle={session?.user.email ?? "Unbekannt"}
              title="Abmelden"
            />
          </ListGroup>
        </View>
      </ScrollView>

      <MemberEditSheet
        member={editingMember}
        onClose={() => setEditingMember(null)}
        onSubmit={saveMember}
        visible={Boolean(editingMember)}
      />
      <ConfirmDialog
        cancelLabel="Bleiben"
        confirmLabel="Abmelden"
        message="Deine Dokumente bleiben sicher gespeichert. Zum Weitermachen meldest du dich einfach wieder mit deiner E-Mail an."
        onCancel={() => setSignOutOpen(false)}
        onConfirm={() => {
          setSignOutOpen(false);
          void signOut();
        }}
        title="Abmelden?"
        visible={signOutOpen}
      />
    </Screen>
  );
}

/** "Tochter · 8 Jahre" / "Mutter" / "Geburtstag am 12.03." — the one quiet line. */
export function describeMember(member: Pick<MemberRow, "role" | "birthdate">, now = new Date()): string {
  const parts: string[] = [];
  if (member.role?.trim()) parts.push(member.role.trim());
  if (member.birthdate) {
    const [year, month, day] = member.birthdate.split("-").map(Number);
    if (year && month && day) {
      const birthday = new Date(year, month - 1, day, 12);
      let age = now.getFullYear() - year;
      const hadBirthday =
        now.getMonth() > birthday.getMonth() ||
        (now.getMonth() === birthday.getMonth() && now.getDate() >= birthday.getDate());
      if (!hadBirthday) age -= 1;
      if (age >= 0 && age < 120) {
        parts.push(age === 1 ? "1 Jahr" : `${age} Jahre`);
      }
    }
  }
  return parts.length > 0 ? parts.join(" · ") : "Familienmitglied";
}

function MemberEditSheet({
  member,
  onClose,
  onSubmit,
  visible,
}: {
  member: MemberRow | null;
  onClose: () => void;
  onSubmit: (
    member: MemberRow,
    values: { name: string; avatarColor: string; birthdate: string },
  ) => Promise<{ success: boolean; error?: string }>;
  visible: boolean;
}) {
  const [name, setName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [avatarColor, setAvatarColor] = useState<string>(AVATAR_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [wasVisible, setWasVisible] = useState(false);
  const [discardDraftOpen, setDiscardDraftOpen] = useState(false);

  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible && member) {
      setName(member.name);
      setBirthdate(toGermanDate(member.birthdate));
      setAvatarColor(member.avatar_color ?? AVATAR_COLORS[0]);
      setError(null);
      setSubmitting(false);
      setDiscardDraftOpen(false);
    }
  }

  const submit = useCallback(async () => {
    if (!member) return;
    const iso = fromGermanDate(birthdate);
    if (birthdate.trim() && iso === null) {
      setError("Bitte gib den Geburtstag als Tag.Monat.Jahr ein, zum Beispiel 12.03.2017.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await onSubmit(member, { name, avatarColor, birthdate: iso ?? "" });
    setSubmitting(false);
    if (result.success) onClose();
    else setError(result.error ?? "Speichern hat nicht geklappt.");
  }, [avatarColor, birthdate, member, name, onClose, onSubmit]);

  const requestClose = useCallback(() => {
    if (submitting) return;
    const isDirty =
      name !== (member?.name ?? "") ||
      birthdate !== toGermanDate(member?.birthdate ?? null) ||
      avatarColor !== (member?.avatar_color ?? AVATAR_COLORS[0]);
    if (!isDirty) {
      onClose();
      return;
    }
    setDiscardDraftOpen(true);
  }, [avatarColor, birthdate, member, name, onClose, submitting]);

  return (
    <OrdiloFormSheet
      closeAccessibilityLabel="Bearbeiten schließen"
      dismissDisabled={submitting}
      keyboardAvoiding
      onClose={requestClose}
      subtitle={member?.role?.trim() || "Familienmitglied"}
      title={member?.name || "Person bearbeiten"}
      visible={visible}
    >
      <OrdiloFormBody>
          <OrdiloFormField label="Name">
            <OrdiloFormInput
              accessibilityLabel="Name der Person"
              autoCapitalize="words"
              maxLength={100}
              onChangeText={setName}
              value={name}
            />
          </OrdiloFormField>

          <OrdiloFormField
            helper="Ordilo erinnert dann rechtzeitig und ordnet Unterlagen leichter zu."
            label="Geburtstag (optional)"
          >
            <OrdiloFormInput
              accessibilityLabel="Geburtstag"
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              leading={<Cake color={colors.mistDark} size={18} strokeWidth={1.9} />}
              maxLength={10}
              onChangeText={setBirthdate}
              placeholder="TT.MM.JJJJ"
              value={birthdate}
            />
          </OrdiloFormField>

          <OrdiloFormField label="Farbe">
            <View style={styles.avatarColors}>
              {AVATAR_COLORS.map((color) => {
                const selected = avatarColor === color;
                return (
                  <Pressable
                    accessibilityLabel="Avatarfarbe auswählen"
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={color}
                    onPress={() => setAvatarColor(color)}
                    style={[styles.avatarColor, { backgroundColor: color }, selected && styles.avatarColorSelected]}
                  >
                    {selected ? <Check color={colors.warmWhite} size={18} strokeWidth={2.4} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </OrdiloFormField>
      </OrdiloFormBody>
      <OrdiloFormFooter
        error={error}
        primary={<OrdiloButton
          disabled={submitting}
          icon={submitting ? <ActivityIndicator color={colors.warmWhite} size="small" /> : undefined}
          onPress={() => void submit()}
          size="lg"
          title={submitting ? "Wird gespeichert …" : "Speichern"}
        />}
      />
      <ConfirmDialog
        cancelLabel="Weiter bearbeiten"
        contained
        confirmLabel="Verwerfen"
        message="Deine Eingaben gehen verloren."
        onCancel={() => setDiscardDraftOpen(false)}
        onConfirm={() => {
          setDiscardDraftOpen(false);
          onClose();
        }}
        title="Änderungen verwerfen?"
        visible={discardDraftOpen}
      />
    </OrdiloFormSheet>
  );
}

function toGermanDate(iso: string | null): string {
  if (!iso) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "";
}

/** "12.3.2017" → "2017-03-12"; null when the text is not a real date. */
export function fromGermanDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { gap: spacing.lg, paddingHorizontal: spacing.md },
  section: { gap: spacing.sm },
  linkPanel: {
    backgroundColor: colors.washSageSoft,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  linkLabel: { color: colors.mistDark, ...typography.caption },
  linkText: { color: colors.graphite, ...typography.timestamp },
  linkActions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" },
  avatarColors: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  avatarColor: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: radii.pill,
    borderWidth: 2,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  avatarColorSelected: { borderColor: colors.graphite },
});
