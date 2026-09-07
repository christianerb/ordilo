import { useRouter } from "expo-router";
import { Camera } from "lucide-react-native";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FirstValueExample } from "@/src/components/first-value-example";
import { DetailTopBar, OrdiloButton, Screen } from "@/src/components/ui";
import { colors, spacing, typography } from "@/src/theme/tokens";

/** Reuses the signed-out and onboarding demo from the settings shortcut. */
export default function ExampleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const startScan = () => router.replace({ pathname: "/scan", params: { auto: "1" } });

  return (
    <Screen>
      <DetailTopBar title="Ordilo ausprobieren" onBack={() => router.replace("/(tabs)")} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text accessibilityRole="header" style={styles.heading}>Ein Brief weniger im Kopf.</Text>
        <Text style={styles.body}>Schau am Beispiel, wie Ordilo hilft. Danach kannst du deinen eigenen Brief scannen.</Text>
        <FirstValueExample onContinue={startScan} />
        <OrdiloButton
          title="Eigenen Brief scannen"
          icon={<Camera color={colors.warmWhite} size={18} />}
          size="lg"
          onPress={startScan}
        />
        <OrdiloButton title="Zur App" variant="ghost" size="lg" onPress={() => router.replace("/(tabs)")} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  heading: { ...typography.display, color: colors.graphite },
  body: { ...typography.body, color: colors.graphite },
});
