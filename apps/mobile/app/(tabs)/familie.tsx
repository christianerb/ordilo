import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "expo-router";
import {
  Check,
  Copy,
  Heart,
  Plus,
  UserPlus,
  Users,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { OrdiloFormSheet } from "@/src/components/sheet";
import { Card, EmptyState, ListSkeleton, OrdiloButton, Screen, ScreenHeader } from "@/src/components/ui";
import { getApiUrl } from "@/src/lib/api";
import { useFamily } from "@/src/lib/family-context";
import { createFamilyInvite } from "@/src/lib/invites";
import { listMembers, updateMember, type MemberRow } from "@/src/lib/onboarding-actions";
import { AVATAR_COLORS } from "@/src/lib/onboarding";
import { useSession } from "@/src/lib/session";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const memberWashes = [
  "#E8D2AC",
  "#DDEBE5",
  "#F0D7D3",
  "#DDE6EA",
  "#E6D9EB",
  "#F4E5C9",
] as const;

export default function FamilieScreen() {
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
    try {
      await Share.share({
        title: "Ordilo — Familieneinladung",
        message: `Komm in unseren Ordilo-Familienordner:\n${url}`,
      });
    } catch {
      // Dismissing the native share sheet keeps the invite ready to copy.
    }
  }, [creating, family]);

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
    values: { name: string; avatarColor: string },
  ) => {
    if (!family) return { success: false, error: "Deine Familie konnte nicht geladen werden." };
    const result = await updateMember(family.id, member.id, {
      name: values.name,
      avatar_color: values.avatarColor,
      birthdate: member.birthdate ?? "",
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

  const memberSummary = members.length === 0
    ? "Noch keine Personen"
    : members.length === 1
      ? "1 wichtiger Mensch"
      : `Deine ${members.length} Lieblingsmenschen`;

  return (
    <Screen style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
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
          action={family?.isOwner ? {
            accessibilityLabel: "Person einladen",
            icon: UserPlus,
            onPress: () => void handleInvite(),
          } : undefined}
          subtitle="Mitglieder und Einladungen"
          title="Familie"
        />

        <View style={styles.summary}>
          <View style={styles.summaryIcon}>
            <Users color={colors.harborBlue} size={24} strokeWidth={1.7} />
          </View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryTitle}>{memberSummary}</Text>
            <Text style={styles.summaryText}>
              {members.length === 0
                ? "Füge die erste Person für eure Dokumente hinzu."
                : "Schön, dass ihr zusammen seid."}
            </Text>
          </View>
          <Heart color={colors.warmApricot} size={23} strokeWidth={1.7} />
        </View>

        {loading ? (
          <ListSkeleton rows={4} />
        ) : memberError ? (
          <EmptyState
            description={memberError}
            heading="Familie nicht erreichbar"
            icon={Users}
          >
            <OrdiloButton onPress={() => void loadMembers()} title="Erneut versuchen" />
          </EmptyState>
        ) : members.length > 0 ? (
          <View style={styles.memberGrid}>
            {members.map((member, index) => (
              <MemberCard
                key={member.id}
                member={member}
                onPress={() => setEditingMember(member)}
                wash={memberWashes[index % memberWashes.length]}
              />
            ))}
          </View>
        ) : null}

        {family?.isOwner ? (
          <View style={styles.inviteArea}>
            <Pressable
              accessibilityLabel="Person zur Familie einladen"
              accessibilityRole="button"
              disabled={creating}
              onPress={() => void handleInvite()}
              style={({ pressed }) => [
                styles.addMember,
                pressed && styles.pressed,
                creating && styles.disabled,
              ]}
            >
              <View style={styles.addIcon}>
                {creating ? (
                  <ActivityIndicator color={colors.harborBlue} size="small" />
                ) : (
                  <Plus color={colors.harborBlue} size={20} strokeWidth={2.2} />
                )}
              </View>
              <View style={styles.addCopy}>
                <Text style={styles.addTitle}>
                  {creating ? "Einladung wird erstellt …" : "Person einladen"}
                </Text>
                <Text style={styles.addText}>Familienmitglied, Kind oder andere Person</Text>
              </View>
            </Pressable>

            {inviteUrl ? (
              <Card style={styles.linkPanel}>
                <Text numberOfLines={1} selectable style={styles.linkText}>{inviteUrl}</Text>
                <OrdiloButton
                  icon={copied ? <Check color={colors.graphite} size={16} /> : <Copy color={colors.graphite} size={16} />}
                  onPress={() => void handleCopy()}
                  title={copied ? "Kopiert" : "Kopieren"}
                  variant="outline"
                />
                <OrdiloButton
                  icon={<UserPlus color={colors.harborBlue} size={16} />}
                  onPress={() => {
                    void Share.share({
                      title: "Ordilo — Familieneinladung",
                      message: `Komm in unseren Ordilo-Familienordner:\n${inviteUrl}`,
                    }).catch(() => {});
                  }}
                  title="Teilen"
                  variant="ghost"
                />
              </Card>
            ) : null}

            {inviteError ? <Text accessibilityRole="alert" style={styles.inviteError}>{inviteError}</Text> : null}
          </View>
        ) : null}

        <Card style={styles.accountCard}>
          <View style={styles.accountCopy}>
            <Text style={styles.accountLabel}>Angemeldet als</Text>
            <Text numberOfLines={1} style={styles.accountEmail}>{session?.user.email ?? "Unbekannt"}</Text>
          </View>
          <OrdiloButton onPress={() => void signOut()} title="Abmelden" variant="outline" />
        </Card>
      </ScrollView>
      <MemberEditSheet
        member={editingMember}
        onClose={() => setEditingMember(null)}
        onSubmit={saveMember}
        visible={Boolean(editingMember)}
      />
    </Screen>
  );
}

function MemberCard({
  member,
  onPress,
  wash,
}: {
  member: MemberRow;
  onPress: () => void;
  wash: string;
}) {
  const initial = member.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <Pressable
      accessibilityLabel={`${member.name} bearbeiten`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.memberCard,
        { backgroundColor: wash },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.memberTop}>
        <View style={[styles.memberAvatar, { backgroundColor: member.avatar_color ?? colors.harborBlue }]}>
          <Text style={styles.memberInitial}>{initial}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={styles.memberName}>{member.name}</Text>
      <Text numberOfLines={1} style={styles.memberRole}>{member.role || "Familienmitglied"}</Text>
    </Pressable>
  );
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
    values: { name: string; avatarColor: string },
  ) => Promise<{ success: boolean; error?: string }>;
  visible: boolean;
}) {
  const [name, setName] = useState("");
  const [avatarColor, setAvatarColor] = useState<string>(AVATAR_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [wasVisible, setWasVisible] = useState(false);

  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible && member) {
      setName(member.name);
      setAvatarColor(member.avatar_color ?? AVATAR_COLORS[0]);
      setError(null);
      setSubmitting(false);
    }
  }

  const submit = useCallback(async () => {
    if (!member) return;
    setSubmitting(true);
    setError(null);
    const result = await onSubmit(member, { name, avatarColor });
    setSubmitting(false);
    if (result.success) onClose();
    else setError(result.error ?? "Speichern hat nicht geklappt.");
  }, [avatarColor, member, name, onClose, onSubmit]);

  const requestClose = useCallback(() => {
    if (submitting) return;
    const isDirty =
      name !== (member?.name ?? "") ||
      avatarColor !== (member?.avatar_color ?? AVATAR_COLORS[0]);
    if (!isDirty) {
      onClose();
      return;
    }
    Alert.alert(
      "Änderungen verwerfen?",
      "Deine Eingaben gehen verloren.",
      [
        { style: "cancel", text: "Weiter bearbeiten" },
        { onPress: onClose, style: "destructive", text: "Verwerfen" },
      ],
    );
  }, [avatarColor, member, name, onClose, submitting]);

  return (
    <OrdiloFormSheet
      closeAccessibilityLabel="Bearbeiten schließen"
      onClose={requestClose}
      style={styles.memberSheet}
      title="Person bearbeiten"
      visible={visible}
    >
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.sheetLabel}>Name</Text>
            <TextInput
              accessibilityLabel="Name der Person"
              autoCapitalize="words"
              maxLength={100}
              onChangeText={setName}
              style={styles.sheetInput}
              value={name}
            />

            <Text style={styles.sheetLabel}>Rolle</Text>
            <Text style={styles.memberRoleRead}>
              {member?.role || "Familienmitglied"}
            </Text>

            <Text style={styles.sheetLabel}>Farbe</Text>
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

            {error ? <Text accessibilityRole="alert" style={styles.sheetError}>{error}</Text> : null}
            <View style={styles.sheetSubmit}>
              <OrdiloButton
                disabled={submitting}
                icon={submitting ? <ActivityIndicator color={colors.warmWhite} size="small" /> : undefined}
                onPress={() => void submit()}
                size="lg"
                title={submitting ? "Wird gespeichert …" : "Speichern"}
              />
            </View>
      </ScrollView>
    </OrdiloFormSheet>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { gap: spacing.md, paddingBottom: spacing["2xl"], paddingHorizontal: spacing.md },
  summary: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 92,
    padding: spacing.md,
  },
  summaryIcon: { alignItems: "center", backgroundColor: "#DDEBE5", borderRadius: radii.pill, height: 52, justifyContent: "center", width: 52 },
  summaryCopy: { flex: 1, gap: 2 },
  summaryTitle: { color: colors.graphite, ...typography.title },
  summaryText: { color: colors.mistDark, ...typography.timestamp },
  memberGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  memberCard: {
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    minHeight: 138,
    padding: spacing.md,
    width: "48.7%",
  },
  memberTop: { alignItems: "flex-start", flex: 1 },
  memberAvatar: { alignItems: "center", borderRadius: radii.pill, height: 40, justifyContent: "center", width: 40 },
  memberInitial: { color: colors.warmWhite, ...typography.title },
  memberName: { color: colors.graphite, ...typography.title },
  memberRole: { color: colors.mistDark, marginTop: 2, ...typography.label },
  inviteArea: { gap: spacing.sm },
  addMember: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: "#9DCBC0",
    borderRadius: radii.sm,
    borderStyle: "dashed",
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 72,
    paddingHorizontal: spacing.md,
  },
  addIcon: { alignItems: "center", backgroundColor: "#DDEBE5", borderRadius: radii.pill, height: 40, justifyContent: "center", width: 40 },
  addCopy: { flex: 1, gap: 2 },
  addTitle: { color: colors.graphite, ...typography.title },
  addText: { color: colors.mistDark, ...typography.label },
  linkPanel: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  linkText: { color: colors.mistDark, flex: 1, minWidth: 160, ...typography.label },
  inviteError: { color: colors.destructive, ...typography.timestamp },
  accountCard: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  accountCopy: { flex: 1, gap: 2, minWidth: 0 },
  accountLabel: { color: colors.mistDark, ...typography.label },
  accountEmail: { color: colors.graphite, ...typography.timestamp },
  memberSheet: {
    maxHeight: "82%",
  },
  sheetLabel: {
    color: colors.mistDark,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    ...typography.label,
  },
  sheetInput: {
    borderColor: colors.mistLight,
    borderRadius: radii.base,
    borderWidth: 1,
    color: colors.graphite,
    height: 44,
    paddingHorizontal: spacing.sm,
    ...typography.body,
  },
  memberRoleRead: {
    backgroundColor: colors.sandLight,
    borderRadius: radii.base,
    color: colors.mistDark,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    ...typography.timestamp,
  },
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
  sheetError: { color: colors.destructive, marginTop: spacing.md, ...typography.timestamp },
  sheetSubmit: { marginTop: spacing.lg },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.56 },
});
