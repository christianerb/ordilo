import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import {
  Cake,
  Camera,
  Check,
  ChevronRight,
  Copy,
  FolderOpen,
  ImagePlus,
  LogOut,
  Mail,
  Plus,
  Settings,
  Share2,
  Users,
  X,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

import { FamilyAccessPanel } from "@/src/components/family-access-panel";
import { ConfirmDialog } from "@/src/components/confirm-dialog";
import { PersonAvatar } from "@/src/components/person";
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
  SectionHeader,
} from "@/src/components/ui";
import { useFamily } from "@/src/lib/family-context";
import { buildInviteUrl, createFamilyInvite } from "@/src/lib/invites";
import { listMembers, updateMember, type MemberRow } from "@/src/lib/onboarding-actions";
import { AVATAR_COLORS } from "@/src/lib/onboarding";
import {
  fetchMemberPhotoUrls,
  removeMemberPhoto,
  uploadMemberPhoto,
} from "@/src/lib/member-photos";
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
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useSession();
  const { family } = useFamily();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [inviteConfirmOpen, setInviteConfirmOpen] = useState(false);
  const [accessRevision, setAccessRevision] = useState(0);
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
    if (refresh) { setRefreshing(true); setAccessRevision((value) => value + 1); }
    else if (!silent) setLoading(true);
    setMemberError(null);
    const [result, urls] = await Promise.all([
      listMembers(family.id),
      fetchMemberPhotoUrls(family.id),
    ]);
    if (sequence !== loadSeqRef.current) return;
    setPhotoUrls(urls);
    if (result.success) {
      setMembers(result.data);
      if (edit) {
        const requestedMember = result.data.find(
          (candidate) => candidate.id === edit,
        );
        if (requestedMember) setEditingMember(requestedMember);
        router.setParams({ edit: "" });
      }
    } else setMemberError(result.error);
    setLoading(false);
    setRefreshing(false);
  }, [edit, family, router]);

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

  const handleInvite = useCallback(async (label?: string) => {
    if (creating || !family?.isOwner) return;
    setCreating(true);
    setInviteError(null);

    const result = await createFamilyInvite(family.id, label);
    setCreating(false);

    if (!result.success) {
      setInviteError(result.error);
      return;
    }

    const url = buildInviteUrl(result.token);
    setInviteUrl(url);
    setAccessRevision((value) => value + 1);
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

  const handlePhotoChange = useCallback((memberId: string, url: string | null) => {
    setPhotoUrls((current) => {
      if (url) return { ...current, [memberId]: url };
      if (!(memberId in current)) return current;
      const next = { ...current };
      delete next[memberId];
      return next;
    });
  }, []);

  return (
    <Screen style={styles.screen}>
      <DetailTopBar
        onBack={() => router.back()}
        title="Start"
        trailing={
          <Pressable
            accessibilityLabel="Einstellungen öffnen"
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => router.push("/einstellungen")}
            style={({ pressed }) => [
              styles.topAction,
              pressed && styles.pressed,
            ]}
          >
            <Settings color={colors.harborBlue} size={22} strokeWidth={1.8} />
          </Pressable>
        }
      />
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
        <View style={styles.hero}>
          <Text style={styles.title}>Eure Familie</Text>
          <Text style={styles.subtitle}>
            Alles Wichtige. Für jeden von euch.
          </Text>
        </View>

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
          <View style={styles.peopleList}>
            <View style={styles.peopleRows}>
              {members.map((member, index) => (
                <FamilyMemberRow
                  key={member.id}
                  member={member}
                  onPress={() => router.push(`/familie/${member.id}`)}
                  photoUrl={photoUrls[member.id] ?? null}
                  showDivider={index > 0}
                />
              ))}
            </View>
            {family?.isOwner ? (
              <Pressable
                accessibilityHint="Erstellt einen Einladungslink zum Teilen"
                accessibilityLabel="Person einladen"
                accessibilityRole="button"
                disabled={creating}
                onPress={() => setInviteConfirmOpen(true)}
                style={({ pressed }) => [
                  styles.addPerson,
                  pressed && styles.pressed,
                ]}
              >
                {creating ? (
                  <ActivityIndicator color={colors.harborBlue} size="small" />
                ) : (
                  <Plus color={colors.harborBlue} size={20} strokeWidth={1.8} />
                )}
                <Text style={styles.addPersonText}>
                  {creating ? "Einladung wird erstellt …" : "Person einladen"}
                </Text>
              </Pressable>
            ) : null}
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
          <SectionHeader title="Für euch gemeinsam" />
          <View style={styles.sharedList}>
            <SharedFamilyRow
              icon={<FolderOpen color={colors.harborBlue} size={24} strokeWidth={1.7} />}
              onPress={() => router.push("/(tabs)/ablage")}
              title="Familienunterlagen"
            />
          </View>
        </View>

        {family ? <FamilyAccessPanel
          key={family.id}
          familyId={family.id}
          isOwner={family.isOwner}
          revision={accessRevision}
          onRevoked={() => { setInviteUrl(null); setCopied(false); }}
          onReshare={(invite) => void handleInvite(invite.label ?? undefined)}
          reshareDisabled={creating}
        /> : null}

        <View style={styles.section}>
          <SectionHeader title="Mehr" />
          <ListGroup>
            <ListRow first chevron title="Post für Ordilo" subtitle="E-Mail-Adresse und Teilen aus anderen Apps" leading={<IconTile><Mail color={colors.harborBlue} size={20} /></IconTile>} onPress={() => router.push("/posteingang")} />
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

      <ConfirmDialog
        visible={inviteConfirmOpen}
        title="Alle Familienunterlagen teilen?"
        message="Wer den Link erhält und sich anmeldet, kann alle Dokumente, Aufgaben und Termine sehen, bearbeiten und löschen. Der Link ist 14 Tage gültig und kann mehrfach genutzt werden. Unter „Wer Zugriff hat“ kannst du den Zugriff später beenden."
        confirmLabel="Link erstellen"
        onCancel={() => setInviteConfirmOpen(false)}
        onConfirm={() => { setInviteConfirmOpen(false); void handleInvite(); }}
      />
      <MemberEditSheet
        member={editingMember}
        onClose={() => setEditingMember(null)}
        onPhotoChange={handlePhotoChange}
        onSubmit={saveMember}
        photoUrl={editingMember ? photoUrls[editingMember.id] ?? null : null}
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

function FamilyMemberRow({
  member,
  onPress,
  photoUrl,
  showDivider,
}: {
  member: MemberRow;
  onPress: () => void;
  photoUrl: string | null;
  showDivider: boolean;
}) {
  return (
    <Pressable
      accessibilityHint="Öffnet alles, was zu dieser Person gehört"
      accessibilityLabel={member.name}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.memberRow,
        showDivider && styles.rowDivider,
        pressed && styles.memberRowPressed,
      ]}
    >
      <PersonAvatar person={{ ...memberToPerson(member), photoUrl }} size={58} />
      <View style={styles.memberCopy}>
        <Text numberOfLines={1} style={styles.memberName}>
          {member.name}
        </Text>
        <Text numberOfLines={1} style={styles.memberMeta}>
          {describeMember(member)}
        </Text>
      </View>
      <ChevronRight color={colors.mistDark} size={20} strokeWidth={1.8} />
    </Pressable>
  );
}

function SharedFamilyRow({
  icon,
  onPress,
  showDivider = false,
  title,
}: {
  icon: ReactNode;
  onPress: () => void;
  showDivider?: boolean;
  title: string;
}) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.sharedRow,
        showDivider && styles.rowDivider,
        pressed && styles.memberRowPressed,
      ]}
    >
      <View style={styles.sharedIcon}>{icon}</View>
      <Text style={styles.sharedTitle}>{title}</Text>
      <ChevronRight color={colors.mistDark} size={20} strokeWidth={1.8} />
    </Pressable>
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
  onPhotoChange,
  onSubmit,
  photoUrl,
  visible,
}: {
  member: MemberRow | null;
  onClose: () => void;
  onPhotoChange: (memberId: string, url: string | null) => void;
  onSubmit: (
    member: MemberRow,
    values: { name: string; avatarColor: string; birthdate: string },
  ) => Promise<{ success: boolean; error?: string }>;
  photoUrl: string | null;
  visible: boolean;
}) {
  const [name, setName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [avatarColor, setAvatarColor] = useState<string>(AVATAR_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [wasVisible, setWasVisible] = useState(false);
  const [discardDraftOpen, setDiscardDraftOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible && member) {
      setName(member.name);
      setBirthdate(toGermanDate(member.birthdate));
      setAvatarColor(member.avatar_color ?? AVATAR_COLORS[0]);
      setError(null);
      setSubmitting(false);
      setDiscardDraftOpen(false);
      setPhotoError(null);
    }
  }

  const pickPhoto = useCallback(async (camera: boolean) => {
    if (!member) return;
    setPhotoError(null);
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError(
        camera
          ? "Bitte erlaube den Kamerazugriff, um ein Foto aufzunehmen."
          : "Bitte erlaube den Fotozugriff, um ein Foto auszuwählen.",
      );
      return;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          mediaTypes: ["images"],
          quality: 0.9,
        })
      : await ImagePicker.launchImageLibraryAsync({
          allowsEditing: true,
          aspect: [1, 1],
          mediaTypes: ["images"],
          quality: 0.9,
        });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.uri) return;

    setPhotoBusy(true);
    try {
      const resized = await manipulateAsync(
        asset.uri,
        [{ resize: { width: 512 } }],
        { compress: 0.85, format: SaveFormat.JPEG },
      );
      const url = await uploadMemberPhoto(member.id, {
        uri: resized.uri,
        name: `foto-${Date.now()}.jpg`,
      });
      onPhotoChange(member.id, url);
    } catch {
      setPhotoError("Foto konnte nicht hochgeladen werden. Bitte erneut versuchen.");
    } finally {
      setPhotoBusy(false);
    }
  }, [member, onPhotoChange]);

  const removePhoto = useCallback(async () => {
    if (!member) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      await removeMemberPhoto(member.id);
      onPhotoChange(member.id, null);
    } catch {
      setPhotoError("Foto konnte nicht entfernt werden. Bitte erneut versuchen.");
    } finally {
      setPhotoBusy(false);
    }
  }, [member, onPhotoChange]);

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
          <View style={styles.photoSection}>
            <View style={styles.photoAvatarWrap}>
              <PersonAvatar
                person={{ color: avatarColor, name, photoUrl }}
                size={88}
              />
              <View style={styles.photoBadge}>
                <Camera color={colors.harborBlue} size={15} strokeWidth={2} />
              </View>
              {photoBusy ? (
                <View style={styles.photoOverlay}>
                  <ActivityIndicator color={colors.warmWhite} size="small" />
                </View>
              ) : null}
            </View>
            <View style={styles.photoActions}>
              <OrdiloButton
                disabled={photoBusy}
                icon={<Camera color={colors.graphite} size={17} />}
                onPress={() => void pickPhoto(true)}
                title="Kamera"
                variant="outline"
              />
              <OrdiloButton
                disabled={photoBusy}
                icon={<ImagePlus color={colors.graphite} size={17} />}
                onPress={() => void pickPhoto(false)}
                title="Fotos"
                variant="outline"
              />
            </View>
            {photoUrl ? (
              <Pressable
                accessibilityLabel="Foto entfernen"
                accessibilityRole="button"
                disabled={photoBusy}
                hitSlop={8}
                onPress={() => void removePhoto()}
                style={({ pressed }) => [
                  styles.photoRemove,
                  pressed && styles.pressed,
                ]}
              >
                <X color={colors.destructive} size={14} />
                <Text style={styles.photoRemoveText}>Foto entfernen</Text>
              </Pressable>
            ) : null}
            {photoError ? (
              <Text accessibilityRole="alert" style={styles.inlineError}>
                {photoError}
              </Text>
            ) : null}
          </View>

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
  topAction: {
    alignItems: "center",
    height: sizes.touch,
    justifyContent: "center",
    marginLeft: "auto",
    width: sizes.touch,
  },
  pressed: { opacity: 0.72 },
  hero: { gap: 2, paddingHorizontal: spacing.xs },
  title: {
    color: colors.graphite,
    ...typography.largeTitle,
    fontSize: 32,
    lineHeight: 38,
  },
  subtitle: { color: colors.mistDark, ...typography.timestamp },
  peopleList: { gap: spacing.xs },
  peopleRows: {
    borderBottomColor: colors.mistLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    minHeight: 82,
    paddingHorizontal: spacing.xs,
    paddingVertical: 10,
  },
  memberRowPressed: { backgroundColor: colors.washSageSoft },
  rowDivider: {
    borderTopColor: colors.mistLight,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  memberCopy: { flex: 1, gap: 2, minWidth: 0 },
  memberName: { color: colors.graphite, ...typography.display },
  memberMeta: { color: colors.mistDark, ...typography.timestamp },
  addPerson: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: sizes.touch,
    paddingHorizontal: spacing.xs,
  },
  addPersonText: { color: colors.graphite, ...typography.timestamp },
  sharedList: {
    borderBottomColor: colors.mistLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.mistLight,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sharedRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  sharedIcon: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderRadius: radii.sm,
    height: 44,
    justifyContent: "center",
    width: 52,
  },
  sharedTitle: { color: colors.graphite, flex: 1, ...typography.title },
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
  photoSection: { alignItems: "center", gap: spacing.sm, paddingBottom: spacing.xs },
  photoAvatarWrap: { position: "relative" },
  photoBadge: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.pill,
    borderWidth: 1,
    bottom: -2,
    height: 28,
    justifyContent: "center",
    position: "absolute",
    right: -2,
    width: 28,
  },
  photoOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(35,35,35,0.45)",
    borderRadius: 44,
    height: 88,
    justifyContent: "center",
    position: "absolute",
    width: 88,
  },
  photoActions: { flexDirection: "row", gap: spacing.sm },
  photoRemove: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    minHeight: sizes.touch,
  },
  photoRemoveText: { color: colors.destructive, ...typography.caption },
  inlineError: {
    backgroundColor: colors.destructiveBackground,
    borderRadius: radii.sm,
    color: colors.destructive,
    padding: spacing.sm,
    ...typography.timestamp,
  },
});
