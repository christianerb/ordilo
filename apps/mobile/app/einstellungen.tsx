import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  FileText,
  LogOut,
  Mail,
  Scale,
  ScanFace,
  Trash2,
} from "lucide-react-native";
import { useCallback, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { FadeInView, PressableScale } from "@/src/components/motion";
import { OrdiloButton, Screen, ScreenHeader } from "@/src/components/ui";
import { deleteFamilyAccount } from "@/src/lib/account";
import { getApiUrl } from "@/src/lib/api";
import { useAppLock } from "@/src/lib/app-lock";
import { useFamily } from "@/src/lib/family-context";
import { haptics } from "@/src/lib/haptics";
import {
  clearStoredPushToken,
  enablePushNotifications,
  getPushPermission,
  type PushPermissionState,
} from "@/src/lib/notifications";
import { useSession } from "@/src/lib/session";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

/**
 * App-Einstellungen (Agent D scope): Sicherheit (biometrische Sperre,
 * App-Wechsler-Schutz), Mitteilungen, Rechtliches, Konto und die DSGVO-
 * Löschung von Familie & Konto. Familien-Fachsettings (Name, Inbound-
 * Adresse, Kalenderfeed) bleiben bei Agent C unter Familie/Einstellungen.
 */
export default function EinstellungenScreen() {
  const router = useRouter();
  const { session, signOut } = useSession();
  const { family } = useFamily();
  const {
    settings,
    biometry,
    hydrated,
    setAppLockEnabled,
    setPrivacyShieldEnabled,
  } = useAppLock();

  const [pushState, setPushState] = useState<PushPermissionState | null>(null);

  // Re-read on focus: the user may have just come back from the iOS
  // system settings, where they changed the permission behind our back.
  useFocusEffect(
    useCallback(() => {
      void getPushPermission().then(setPushState);
    }, []),
  );

  async function handlePushToggle(enable: boolean) {
    if (enable) {
      const result = await enablePushNotifications();
      setPushState(result.state);
      if (result.state === "granted") {
        haptics.success();
      } else if (result.state === "blocked") {
        haptics.warning();
        Alert.alert(
          "Mitteilungen sind blockiert",
          "iOS hat die Mitteilungen für Ordilo ausgeschaltet. Du kannst sie in den iPhone-Einstellungen wieder erlauben.",
          [
            { text: "Abbrechen", style: "cancel" },
            {
              text: "Einstellungen öffnen",
              onPress: () => void Linking.openSettings(),
            },
          ],
        );
      }
      return;
    }
    // iOS permissions can only be revoked in the system settings.
    Alert.alert(
      "Mitteilungen ausschalten",
      "Das geht in den iPhone-Einstellungen unter „Mitteilungen“ → „Ordilo“.",
      [
        { text: "Später", style: "cancel" },
        {
          text: "Einstellungen öffnen",
          onPress: () => void Linking.openSettings(),
        },
      ],
    );
    // The switch snaps back on focus via the fresh permission read.
  }

  async function openLegal(path: "/datenschutz" | "/impressum") {
    try {
      await WebBrowser.openBrowserAsync(`${getApiUrl()}${path}`);
    } catch {
      haptics.warning();
    }
  }

  function handleSignOut() {
    Alert.alert("Abmelden?", "Du kannst dich jederzeit wieder anmelden.", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Abmelden",
        style: "destructive",
        onPress: () => {
          // The push token belongs to this account — do not leave it
          // behind for the next login on this device.
          void clearStoredPushToken();
          void signOut();
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScreenHeader
        subtitle="Schutz und Konto auf diesem Gerät"
        title="Einstellungen"
        trailing={(
        <PressableScale
          accessibilityLabel="Zurück"
          contentStyle={styles.backButton}
          onPress={() => router.back()}
        >
          <ChevronLeft color={colors.graphite} size={22} strokeWidth={2} />
        </PressableScale>
        )}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <FadeInView index={0}>
          <SettingsSection title="Sicherheit">
            <SettingsToggleRow
              description={
                biometry.available
                  ? `Ordilo öffnet sich erst nach dem Entsperren mit ${biometry.label}.`
                  : "Auf diesem Gerät ist keine Biometrie eingerichtet."
              }
              disabled={!hydrated || !biometry.available}
              icon={<ScanFace color={colors.harborBlue} size={20} strokeWidth={1.75} />}
              onToggle={(value) => void setAppLockEnabled(value)}
              title="App-Sperre"
              value={settings.appLockEnabled}
            />
            <SettingsDivider />
            <SettingsToggleRow
              description="Im App-Wechsler zeigt Ordilo nur das Logo statt eurer Inhalte."
              disabled={!hydrated}
              icon={<EyeOff color={colors.harborBlue} size={20} strokeWidth={1.75} />}
              onToggle={(value) => void setPrivacyShieldEnabled(value)}
              title="Inhalte verbergen"
              value={settings.privacyShieldEnabled}
            />
          </SettingsSection>
        </FadeInView>

        <FadeInView index={1}>
          <SettingsSection title="Mitteilungen">
            <SettingsToggleRow
              description={
                pushState === "granted"
                  ? "Ordilo darf dich benachrichtigen."
                  : pushState === "blocked"
                    ? "In den iPhone-Einstellungen blockiert."
                    : "Zum Beispiel wenn jemand aus deiner Familie etwas teilt."
              }
              disabled={pushState === null}
              icon={<Bell color={colors.harborBlue} size={20} strokeWidth={1.75} />}
              onToggle={(value) => void handlePushToggle(value)}
              title="Mitteilungen"
              value={pushState === "granted"}
            />
          </SettingsSection>
        </FadeInView>

        <FadeInView index={2}>
          <SettingsSection title="Rechtliches">
            <SettingsLinkRow
              icon={<FileText color={colors.harborBlue} size={20} strokeWidth={1.75} />}
              onPress={() => void openLegal("/datenschutz")}
              title="Datenschutzerklärung"
            />
            <SettingsDivider />
            <SettingsLinkRow
              icon={<Scale color={colors.harborBlue} size={20} strokeWidth={1.75} />}
              onPress={() => void openLegal("/impressum")}
              title="Impressum"
            />
          </SettingsSection>
        </FadeInView>

        <FadeInView index={3}>
          <SettingsSection title="Konto">
            <View style={styles.accountRow}>
              <View style={styles.rowIcon}>
                <Mail color={colors.harborBlue} size={20} strokeWidth={1.75} />
              </View>
              <View style={styles.rowText}>
                <Text style={[typography.title, styles.rowTitle]}>
                  Angemeldet
                </Text>
                <Text style={[typography.timestamp, styles.rowDescription]}>
                  {session?.user.email ?? "…"}
                </Text>
              </View>
            </View>
            <SettingsDivider />
            <SettingsLinkRow
              icon={<LogOut color={colors.mistDark} size={20} strokeWidth={1.75} />}
              onPress={handleSignOut}
              title="Abmelden"
            />
          </SettingsSection>
        </FadeInView>

        {family ? (
          <FadeInView index={4}>
            <DeleteZone
              familyName={family.name}
              isOwner={family.isOwner}
              onDeleted={() => void signOut()}
            />
          </FadeInView>
        ) : null}

        <Text style={[typography.label, styles.versionNote]}>
          Ordilo — die wichtigen Dinge deiner Familie. An einem Ort.
        </Text>
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Danger zone
// ---------------------------------------------------------------------------

/**
 * DSGVO-Löschung. Owners löschen die ganze Familie inklusive aller Daten;
 * eingeladene Mitglieder löschen nur ihr Konto und ihren Zugang (die
 * Route DELETE /api/me entscheidet das serverseitig anhand der Rolle).
 * Wie im Web: exakte Eingabe des Familiennamens als Bestätigung.
 */
function DeleteZone({
  familyName,
  isOwner,
  onDeleted,
}: {
  familyName: string;
  isOwner: boolean;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete =
    confirmName.trim() === familyName && familyName !== "" && !isDeleting;

  async function handleDelete() {
    if (!canDelete) return;
    setError(null);
    setIsDeleting(true);
    try {
      await deleteFamilyAccount(confirmName.trim());
      // The push token belonged to the deleted account — drop it before
      // the local session disappears.
      void clearStoredPushToken();
      haptics.success();
      Alert.alert(
        isOwner ? "Familie gelöscht" : "Konto gelöscht",
        "Alle Daten wurden entfernt. Pass gut auf dich auf.",
        [{ text: "OK", onPress: onDeleted }],
      );
    } catch (deleteError) {
      haptics.error();
      setIsDeleting(false);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Das hat nicht geklappt. Bitte versuch's nochmal.",
      );
    }
  }

  return (
    <View style={styles.dangerCard}>
      <View style={styles.dangerHeader}>
        <Trash2 color={colors.destructive} size={20} strokeWidth={1.75} />
        <Text style={[typography.title, styles.dangerTitle]}>
          {isOwner ? "Familie und Konto löschen" : "Konto löschen"}
        </Text>
      </View>
      <Text style={[typography.timestamp, styles.dangerText]}>
        {isOwner
          ? "Dabei werden alle Dokumente, Aufgaben, Familienmitglieder und dein Konto endgültig gelöscht. Das kann nicht rückgängig gemacht werden."
          : "Dein Konto und dein Zugang werden endgültig gelöscht. Die Dokumente der Familie bleiben bei den anderen."}
      </Text>

      {confirming ? (
        <View style={styles.dangerForm}>
          <Text style={[typography.label, styles.dangerLabel]}>
            Gib zur Bestätigung „{familyName}“ ein
          </Text>
          <TextInput
            accessibilityLabel="Familienname zur Bestätigung"
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={(value) => {
              setConfirmName(value);
              if (error) setError(null);
            }}
            placeholder={familyName}
            placeholderTextColor={colors.mist}
            style={styles.dangerInput}
            value={confirmName}
          />
          {error ? (
            <Text accessibilityRole="alert" style={styles.dangerError}>
              {error}
            </Text>
          ) : null}
          <View style={styles.dangerActions}>
            {isDeleting ? (
              <ActivityIndicator color={colors.destructive} />
            ) : (
              <OrdiloButton
                disabled={!canDelete}
                onPress={() => void handleDelete()}
                title="Endgültig löschen"
                variant="destructive"
              />
            )}
            <OrdiloButton
              onPress={() => {
                setConfirming(false);
                setConfirmName("");
                setError(null);
              }}
              title="Abbrechen"
              variant="ghost"
            />
          </View>
        </View>
      ) : (
        <OrdiloButton
          onPress={() => {
            haptics.warning();
            setConfirming(true);
          }}
          title={isOwner ? "Familie löschen …" : "Konto löschen …"}
          variant="outline"
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Rows and sections
// ---------------------------------------------------------------------------

function SettingsSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={[typography.label, styles.sectionTitle]}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function SettingsDivider() {
  return <View style={styles.divider} />;
}

function SettingsToggleRow({
  description,
  disabled = false,
  icon,
  onToggle,
  title,
  value,
}: {
  description: string;
  disabled?: boolean;
  icon: ReactNode;
  onToggle: (value: boolean) => void;
  title: string;
  value: boolean;
}) {
  return (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={[typography.title, styles.rowTitle]}>{title}</Text>
        <Text style={[typography.timestamp, styles.rowDescription]}>
          {description}
        </Text>
      </View>
      <Switch
        accessibilityLabel={title}
        disabled={disabled}
        ios_backgroundColor={colors.mistLight}
        onValueChange={(next) => {
          haptics.selection();
          onToggle(next);
        }}
        thumbColor={colors.warmWhite}
        trackColor={{ false: colors.mistLight, true: colors.harborBlue }}
        value={value}
      />
    </View>
  );
}

function SettingsLinkRow({
  icon,
  onPress,
  title,
}: {
  icon: ReactNode;
  onPress: () => void;
  title: string;
}) {
  return (
    <PressableScale
      accessibilityLabel={title}
      contentStyle={styles.row}
      onPress={onPress}
    >
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={[typography.title, styles.rowTitle]}>{title}</Text>
      </View>
      <ChevronRight color={colors.mist} size={18} strokeWidth={2} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  scrollContent: {
    gap: spacing.lg,
    paddingBottom: spacing["2xl"],
    paddingTop: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.mistDark,
    paddingHorizontal: spacing.xs,
  },
  sectionCard: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    padding: 12,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowIcon: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.base,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: colors.graphite,
  },
  rowDescription: {
    color: colors.mistDark,
  },
  divider: {
    backgroundColor: colors.mistLight,
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
  accountRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    padding: 12,
  },
  dangerCard: {
    backgroundColor: colors.destructiveBackground,
    borderColor: colors.destructive,
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  dangerHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  dangerTitle: {
    color: colors.destructive,
  },
  dangerText: {
    color: colors.graphite,
    lineHeight: 20,
  },
  dangerForm: {
    gap: spacing.sm,
  },
  dangerLabel: {
    color: colors.graphite,
  },
  dangerInput: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.base,
    borderWidth: 1,
    color: colors.graphite,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    height: 44,
    paddingHorizontal: 12,
  },
  dangerError: {
    color: colors.destructive,
    fontFamily: typography.timestamp.fontFamily,
    fontSize: typography.timestamp.fontSize,
  },
  dangerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "flex-end",
    minHeight: 36,
  },
  versionNote: {
    color: colors.mist,
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
