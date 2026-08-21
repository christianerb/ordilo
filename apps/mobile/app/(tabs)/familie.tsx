import * as Clipboard from "expo-clipboard";
import { Check, Copy, UserPlus, Users } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";

import { Card, EmptyState, OrdiloButton, Screen, ScreenHeader } from "@/src/components/ui";
import { getApiUrl } from "@/src/lib/api";
import { useFamily } from "@/src/lib/family-context";
import { createFamilyInvite } from "@/src/lib/invites";
import { useSession } from "@/src/lib/session";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

/**
 * Familie — members, invitations and settings.
 *
 * Invite creation mirrors the web's InviteAction exactly: one tap creates
 * the link and opens the system share sheet; the link panel stays visible
 * afterwards so a cancelled share can still be copied. Only the family
 * owner can create invites — enforced by RLS, like the web.
 *
 * Links point at the web app (EXPO_PUBLIC_API_URL) so recipients can open
 * them on any device; on a phone with the app installed the invite screen
 * takes over. Full member management follows in the Familie milestone.
 */
export default function FamilieScreen() {
  const { session, signOut } = useSession();
  const { family } = useFamily();
  const [creating, setCreating] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleInvite = useCallback(async () => {
    if (creating || !family) return;
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

    // Straight from "create" to the system share sheet — same as the web
    // on mobile. Cancelling keeps the link panel below visible.
    try {
      await Share.share({
        title: "Ordilo — Familieneinladung",
        message: `Komm in unseren Ordilo-Familienordner:\n${url}`,
      });
    } catch {
      // Share sheet dismissed — nothing to do.
    }
  }, [creating, family]);

  const handleCopy = useCallback(async () => {
    if (!inviteUrl) return;
    const ok = await Clipboard.setStringAsync(inviteUrl);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [inviteUrl]);

  return (
    <Screen>
      <ScreenHeader title="Familie" subtitle="Mitglieder und Einstellungen" />

      {family ? (
        <Card style={styles.inviteCard}>
          <View style={styles.inviteHeader}>
            <View style={styles.inviteHeaderText}>
              <Text style={[typography.display, styles.inviteTitle]}>
                Familie einladen
              </Text>
              <Text style={[typography.timestamp, styles.inviteDescription]}>
                Teile den Link — er ist 14 Tage gültig und kann von mehreren
                Personen genutzt werden.
              </Text>
            </View>
            {!inviteUrl && (
              <OrdiloButton
                disabled={creating}
                icon={<UserPlus color={colors.warmWhite} size={16} />}
                onPress={() => void handleInvite()}
                title={creating ? "Wird erstellt …" : "Einladen"}
              />
            )}
          </View>

          {inviteUrl ? (
            <View style={styles.linkPanel}>
              <View style={styles.linkRow}>
                <Text
                  numberOfLines={1}
                  selectable
                  style={[typography.label, styles.linkText]}
                >
                  {inviteUrl}
                </Text>
                <OrdiloButton
                  icon={
                    copied ? (
                      <Check color={colors.graphite} size={16} />
                    ) : (
                      <Copy color={colors.graphite} size={16} />
                    )
                  }
                  onPress={() => void handleCopy()}
                  title={copied ? "Kopiert" : "Kopieren"}
                  variant="outline"
                />
              </View>
              <OrdiloButton
                icon={<UserPlus color={colors.harborBlue} size={16} />}
                onPress={() => {
                  void Share.share({
                    title: "Ordilo — Familieneinladung",
                    message: `Komm in unseren Ordilo-Familienordner:\n${inviteUrl}`,
                  }).catch(() => {});
                }}
                title="Erneut teilen"
                variant="ghost"
              />
            </View>
          ) : null}

          {inviteError ? (
            <Text accessibilityRole="alert" style={styles.inviteError}>
              {inviteError}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Card style={styles.accountCard}>
        <View style={styles.accountText}>
          <Text style={[typography.label, styles.accountLabel]}>
            Angemeldet als
          </Text>
          <Text style={[typography.title, styles.accountEmail]}>
            {session?.user.email ?? "Unbekannt"}
          </Text>
        </View>
        <OrdiloButton
          title="Abmelden"
          variant="outline"
          onPress={() => void signOut()}
        />
      </Card>
      <EmptyState
        icon={Users}
        heading="Hier entsteht deine Familie"
        description="Mitglieder und Zuständigkeiten folgen als Nächstes."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  inviteCard: { gap: spacing.sm },
  inviteHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  inviteHeaderText: { flex: 1, gap: spacing.xs },
  inviteTitle: { color: colors.graphite },
  inviteDescription: { color: colors.mistDark },
  linkPanel: {
    borderTopColor: colors.mistLight,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  linkRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  linkText: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.graphite,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inviteError: {
    color: colors.destructive,
    fontFamily: typography.timestamp.fontFamily,
    fontSize: typography.timestamp.fontSize,
    fontWeight: "500",
  },
  accountCard: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  accountText: {
    flexShrink: 1,
    gap: spacing.xs,
  },
  accountLabel: {
    color: colors.mistDark,
  },
  accountEmail: {
    color: colors.graphite,
  },
});
