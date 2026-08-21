import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing, typography } from "@/src/theme/tokens";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Nicht gefunden" }} />
      <View style={styles.container}>
        <Text style={[typography.display, styles.heading]}>
          Diese Seite gibt es nicht.
        </Text>
        <Link href="/" style={[typography.body, styles.link]}>
          Zur Startseite
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
    padding: spacing.lg,
  },
  heading: {
    color: colors.graphite,
  },
  link: {
    color: colors.harborBlue,
  },
});
