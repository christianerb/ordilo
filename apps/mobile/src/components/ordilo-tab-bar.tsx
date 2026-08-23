import { useRouter } from "expo-router";
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";
import {
  BookOpen,
  CalendarDays,
  House,
  ScanLine,
  Sparkles,
  Users,
} from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OrdiloMark } from "@/src/components/ordilo-mark";
import { haptics } from "@/src/lib/haptics";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const tabConfig = {
  index: { icon: House, label: "Heute" },
  ablage: { icon: BookOpen, label: "Ablage" },
  plan: { icon: CalendarDays, label: "Plan" },
  familie: { icon: Users, label: "Familie" },
} as const;

/**
 * Ordilo's persistent mobile dock mirrors the desktop/mobile composer:
 * asking Ordilo is a first-class path from every family moment, while the
 * five bottom destinations remain familiar, thumb-reachable navigation.
 */
export function OrdiloTabBar({
  navigation,
  state,
}: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <Pressable
        accessibilityHint="Öffnet den Ordilo-Chat"
        accessibilityLabel="Frage Ordilo"
        accessibilityRole="button"
        onPress={() => {
          haptics.tap();
          router.push("/suche");
        }}
        style={({ pressed }) => [styles.askBar, pressed && styles.pressed]}
      >
        <View accessible={false} style={styles.mark}>
          <OrdiloMark size={27} />
        </View>
        <Text numberOfLines={1} style={styles.askLabel}>
          Frage Ordilo …
        </Text>
        <Sparkles color={colors.harborBlue} size={19} strokeWidth={1.9} />
      </Pressable>

      <View style={styles.tabRow}>
        {state.routes.map((route, index) => {
          if (route.name === "scan-action") {
            return (
              <View key={route.key} style={styles.scanSlot}>
                <Pressable
                  accessibilityHint="Öffnet den Dokument-Scanner"
                  accessibilityLabel="Dokument scannen"
                  accessibilityRole="button"
                  onPress={() => {
                    haptics.tap();
                    router.push("/scan");
                  }}
                  style={({ pressed }) => [
                    styles.scanButton,
                    pressed && styles.scanButtonPressed,
                  ]}
                >
                  <ScanLine color={colors.warmWhite} size={24} strokeWidth={2.2} />
                </Pressable>
                <Text style={styles.scanLabel}>Scannen</Text>
              </View>
            );
          }

          const config = tabConfig[route.name as keyof typeof tabConfig];
          if (!config) return null;
          const focused = state.index === index;
          const Icon = config.icon;
          return (
            <Pressable
              accessibilityLabel={config.label}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              key={route.key}
              onPress={() => {
                const event = navigation.emit({
                  canPreventDefault: true,
                  target: route.key,
                  type: "tabPress",
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
              onLongPress={() =>
                navigation.emit({ target: route.key, type: "tabLongPress" })
              }
              style={styles.tab}
            >
              <Icon
                color={focused ? colors.warmApricot : "rgba(255,255,255,0.55)"}
                size={20}
                strokeWidth={focused ? 2.4 : 1.9}
              />
              <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
                {config.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    backgroundColor: colors.harborBlueDarker,
    borderTopColor: "rgba(255,255,255,0.12)",
    borderTopWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  askBar: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    height: 48,
    paddingHorizontal: spacing.sm,
  },
  mark: {
    alignItems: "center",
    backgroundColor: colors.washSageSoft,
    borderRadius: radii.pill,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  askLabel: {
    color: colors.mistDark,
    flex: 1,
    ...typography.body,
  },
  tabRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
  },
  tab: {
    alignItems: "center",
    flex: 1,
    gap: 2,
    justifyContent: "center",
    minHeight: 52,
  },
  tabLabel: {
    color: "rgba(255,255,255,0.55)",
    ...typography.label,
  },
  tabLabelActive: {
    color: colors.warmApricot,
  },
  scanSlot: {
    alignItems: "center",
    flex: 1,
    minHeight: 58,
  },
  scanButton: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 52,
    justifyContent: "center",
    marginTop: -14,
    width: 52,
  },
  scanButtonPressed: {
    backgroundColor: colors.harborBlueDark,
  },
  scanLabel: {
    color: "rgba(255,255,255,0.72)",
    marginTop: 1,
    ...typography.label,
  },
  pressed: { opacity: 0.82 },
});
