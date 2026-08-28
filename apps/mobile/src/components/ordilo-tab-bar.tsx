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

import { CreateChoiceSheet } from "@/src/components/create-choice-sheet";
import { OrdiloMark } from "@/src/components/ordilo-mark";
import type { OrdiloSheetHandle } from "@/src/components/sheet";
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
  const pendingActionRef = useRef<"/scan" | "/suche" | null>(null);

  function chooseAction(route: "/scan" | "/suche") {
    pendingActionRef.current = route;
    actionsSheetRef.current?.dismiss();
  }

  function finishActionChoice() {
    const route = pendingActionRef.current;
    pendingActionRef.current = null;
    if (route) router.push(route);
  }

  return (
    <>
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <View style={styles.dockBar}>
          <View accessible={false} pointerEvents="none" style={styles.waveSurface}>
            <Svg
              height="100%"
              preserveAspectRatio="none"
              viewBox="0 0 360 100"
              width="100%"
            >
              <Path
                d="M42 24 H119 C143 24 145 0 180 0 C215 0 217 24 241 24 H318 C336 24 344 34 344 52 V70 C344 88 334 96 316 96 H44 C26 96 16 88 16 70 V52 C16 34 24 24 42 24 Z"
                fill="rgba(253,252,250,0.98)"
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
                  size={25}
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

      <CreateChoiceSheet
        accessibilityLabel="Ordilo-Aktionen"
        items={[
          {
            accessibilityLabel: "Ordilo fragen",
            description: "Antworten aus euren Dokumenten finden",
            icon: Sparkles,
            label: "Frage Ordilo",
            onPress: () => chooseAction("/suche"),
          },
          {
            accessibilityLabel: "Dokument scannen",
            description: "Brief abfotografieren und ablegen",
            icon: ScanLine,
            label: "Dokument scannen",
            onPress: () => chooseAction("/scan"),
            tint: "blue",
          },
        ]}
        onDismiss={finishActionChoice}
        ref={actionsSheetRef}
        subtitle="Ordilo hilft beim Finden und Festhalten."
        title="Was darf ich für euch tun?"
      />
    </>
  );
}

const styles = StyleSheet.create({
  dock: {
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingTop: 2,
  },
  dockBar: {
    alignItems: "center",
    backgroundColor: "transparent",
    elevation: 10,
    flexDirection: "row",
    height: 100,
    justifyContent: "space-around",
    shadowColor: colors.harborBlueDarker,
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
  },
  tab: {
    alignItems: "center",
    flex: 1,
    gap: 5,
    height: 76,
    justifyContent: "center",
    marginTop: spacing.lg,
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
    borderWidth: 4,
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
    ...typography.label,
    fontSize: 13,
    lineHeight: 16,
    textAlign: "center",
  },
  tabLabel: {
    color: colors.mistDark,
    ...typography.label,
    fontSize: 13,
    lineHeight: 16,
    textAlign: "center",
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
});
