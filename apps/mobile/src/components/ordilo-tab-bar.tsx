import { useRouter } from "expo-router";
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";
import {
  BookOpen,
  CalendarDays,
  House,
  ScanLine,
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
      <View style={styles.dockRow}>
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
            <OrdiloMark size={25} />
          </View>
          <Text numberOfLines={1} style={styles.askLabel}>
            Frage Ordilo
          </Text>
        </Pressable>

        {state.routes.map((route, index) => {
          if (route.name === "scan-action") {
            return (
              <Pressable
                accessibilityHint="Öffnet den Dokument-Scanner"
                accessibilityLabel="Dokument scannen"
                accessibilityRole="button"
                hitSlop={4}
                key={route.key}
                onPress={() => {
                  haptics.tap();
                  router.push("/scan");
                }}
                style={({ pressed }) => [
                  styles.scanButton,
                  pressed && styles.scanButtonPressed,
                ]}
              >
                <ScanLine color={colors.warmWhite} size={22} strokeWidth={2.2} />
              </Pressable>
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
              hitSlop={4}
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
                size={21}
                strokeWidth={focused ? 2.4 : 1.9}
              />
              {focused ? <View style={styles.activeDot} /> : null}
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
    paddingTop: 6,
  },
  dockRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    minHeight: 52,
  },
  askBar: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderRadius: radii.pill,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    height: 44,
    minWidth: 88,
    paddingHorizontal: 6,
  },
  mark: {
    alignItems: "center",
    backgroundColor: colors.washSageSoft,
    borderRadius: radii.pill,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  askLabel: {
    color: colors.mistDark,
    flex: 1,
    ...typography.label,
  },
  tab: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    position: "relative",
    width: 36,
  },
  scanButton: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  scanButtonPressed: {
    backgroundColor: colors.harborBlueDark,
  },
  activeDot: {
    backgroundColor: colors.warmApricot,
    borderRadius: radii.pill,
    bottom: 3,
    height: 4,
    position: "absolute",
    width: 4,
  },
  pressed: { opacity: 0.82 },
});
