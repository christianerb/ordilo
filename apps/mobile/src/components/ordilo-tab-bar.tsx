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
import { useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { OrdiloMark } from "@/src/components/ordilo-mark";
import { OrdiloSheet, type OrdiloSheetHandle } from "@/src/components/sheet";
import { haptics } from "@/src/lib/haptics";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const tabConfig = {
  index: { icon: House, label: "Start" },
  ablage: { icon: BookOpen, label: "Dokumente" },
  plan: { icon: CalendarDays, label: "Termine" },
  familie: { icon: Users, label: "Familie" },
} as const;

/**
 * A floating, thumb-reachable family dock. Ordilo is the central action
 * anchor, not another destination: tapping the large mark opens the two
 * meaningful family actions, asking Ordilo or capturing a document.
 */
export function OrdiloTabBar({
  navigation,
  state,
}: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const actionsSheetRef = useRef<OrdiloSheetHandle>(null);

  return (
    <>
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <View style={styles.dockBar}>
          <View accessible={false} pointerEvents="none" style={styles.waveSurface}>
            <View style={styles.centerGlow} />
            <Svg
              height="100%"
              preserveAspectRatio="none"
              viewBox="0 0 360 100"
              width="100%"
            >
              <Path
                d="M42 14 H119 C143 14 145 51 180 56 C215 51 217 14 241 14 H318 C336 14 344 25 344 42 V69 C344 87 334 96 316 96 H44 C26 96 16 87 16 69 V42 C16 25 24 14 42 14 Z"
                fill="rgba(253,252,250,0.96)"
                stroke="rgba(255,255,255,0.98)"
                strokeWidth={2}
              />
            </Svg>
          </View>
          {state.routes.map((route, index) => {
            if (route.name === "scan-action") {
              return (
                <View key={route.key} style={styles.ordiloSlot}>
                  <Pressable
                    accessibilityHint="Öffnet Ordilo-Aktionen"
                    accessibilityLabel="Ordilo"
                    accessibilityRole="button"
                    hitSlop={6}
                    onPress={() => {
                      haptics.tap();
                      actionsSheetRef.current?.present();
                    }}
                    style={({ pressed }) => [
                      styles.ordiloButton,
                      pressed && styles.ordiloButtonPressed,
                    ]}
                  >
                    <OrdiloMark size={54} />
                  </Pressable>
                  <Text style={styles.ordiloLabel}>Frage Ordilo</Text>
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
                  color={focused ? colors.harborBlueDarker : "rgba(48,84,96,0.58)"}
                  size={24}
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

      <OrdiloSheet accessibilityLabel="Ordilo-Aktionen" ref={actionsSheetRef}>
        <View style={styles.actionSheetHeading}>
          <OrdiloMark size={38} />
          <View style={styles.actionSheetCopy}>
            <Text style={styles.actionSheetTitle}>Was darf ich für euch tun?</Text>
            <Text style={styles.actionSheetText}>Ordilo hilft beim Finden und Festhalten.</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            actionsSheetRef.current?.dismiss();
            router.push("/suche");
          }}
          style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
        >
          <View style={styles.actionIcon}>
            <Sparkles color={colors.harborBlue} size={20} />
          </View>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>Frage Ordilo</Text>
            <Text style={styles.actionText}>Antworten aus euren Dokumenten finden.</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            actionsSheetRef.current?.dismiss();
            router.push("/scan");
          }}
          style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
        >
          <View style={[styles.actionIcon, styles.scanActionIcon]}>
            <ScanLine color={colors.harborBlue} size={20} />
          </View>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>Dokument scannen</Text>
            <Text style={styles.actionText}>Brief abfotografieren und ablegen.</Text>
          </View>
        </Pressable>
      </OrdiloSheet>
    </>
  );
}

const styles = StyleSheet.create({
  dock: {
    backgroundColor: "transparent",
    paddingHorizontal: spacing.md,
    paddingTop: 2,
  },
  dockBar: {
    alignItems: "center",
    backgroundColor: "transparent",
    elevation: 8,
    flexDirection: "row",
    height: 100,
    justifyContent: "space-around",
    shadowColor: colors.harborBlueDarker,
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 14,
  },
  tab: {
    alignItems: "center",
    flex: 1,
    gap: 6,
    height: 100,
    justifyContent: "center",
    paddingTop: 22,
    position: "relative",
  },
  ordiloSlot: {
    alignItems: "center",
    flex: 1.15,
    height: 100,
    justifyContent: "flex-start",
  },
  ordiloButton: {
    alignItems: "center",
    backgroundColor: colors.washSage,
    borderColor: "rgba(255,255,255,0.98)",
    borderRadius: radii.pill,
    borderWidth: 5,
    elevation: 8,
    height: 72,
    justifyContent: "center",
    shadowColor: colors.harborBlueDarker,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    width: 72,
  },
  ordiloButtonPressed: {
    backgroundColor: colors.sand,
    transform: [{ scale: 0.96 }],
  },
  ordiloLabel: {
    color: colors.harborBlueDarker,
    marginTop: 1,
    textAlign: "center",
    ...typography.label,
  },
  tabLabel: {
    color: colors.mistDark,
    textAlign: "center",
    ...typography.label,
  },
  tabLabelActive: {
    color: colors.harborBlueDarker,
    fontFamily: typography.display.fontFamily,
  },
  waveSurface: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  centerGlow: {
    alignSelf: "center",
    backgroundColor: "rgba(221,235,229,0.68)",
    borderRadius: radii.pill,
    height: 78,
    position: "absolute",
    top: 0,
    width: 136,
  },
  actionSheetHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  actionSheetCopy: { flex: 1, gap: 2 },
  actionSheetTitle: { color: colors.graphite, ...typography.display },
  actionSheetText: { color: colors.mistDark, ...typography.timestamp },
  actionRow: {
    alignItems: "center",
    borderTopColor: colors.mistLight,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 72,
    paddingVertical: spacing.sm,
  },
  actionIcon: {
    alignItems: "center",
    backgroundColor: colors.washSageSoft,
    borderRadius: radii.sm,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  scanActionIcon: { backgroundColor: colors.washBlue },
  actionCopy: { flex: 1, gap: 2 },
  actionTitle: { color: colors.graphite, ...typography.title },
  actionText: { color: colors.mistDark, ...typography.timestamp },
  pressed: { opacity: 0.82 },
});
