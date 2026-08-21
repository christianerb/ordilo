import { Users } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { Card, EmptyState, OrdiloButton, Screen, ScreenHeader } from "@/src/components/ui";
import { useSession } from "@/src/lib/session";
import { colors, spacing, typography } from "@/src/theme/tokens";

/**
 * Familie — members, invitations and settings. The full member area
 * arrives with the Familie milestone; the account card and logout are
 * functional from day one so auth can be tested end to end.
 */
export default function FamilieScreen() {
  const { session, signOut } = useSession();

  return (
    <Screen>
      <ScreenHeader title="Familie" subtitle="Mitglieder und Einstellungen" />
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
        description="Mitglieder, Einladungen und Zuständigkeiten folgen als Nächstes."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
