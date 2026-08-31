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
import { useRef, useState } from "react";
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

/** Scroll clearance for the absolute dock plus one calm spacing step. */
export const MOBILE_DOCK_CONTENT_INSET = 136;

/**
 * The dock wave, rebuilt for the actual bar width so its corner radii
 * stay perfectly round on every phone. The hand-tuned 360pt original
 * stretched non-uniformly to fill the bar and turned the corners
 * elliptical on narrower or wider screens — only the straight spans
 * between the notch and the corners are allowed to grow.
 */
function buildDockWavePath(width: number) {
  const left = 8;
  const right = width - 8;
  const cx = width / 2;
  return [
    `M ${left + 35} 28`,
    `H ${cx - 72}`,
    `C ${cx - 43} 28 ${cx - 41} 0 ${cx} 0`,
    `C ${cx + 41} 0 ${cx + 43} 28 ${cx + 72} 28`,
    `H ${right - 35}`,
    `C ${right - 16} 28 ${right} 44 ${right} 63`,
    `C ${right} 82 ${right - 16} 98 ${right - 35} 98`,
    `H ${left + 35}`,
    `C ${left + 16} 98 ${left} 82 ${left} 63`,
    `C ${left} 44 ${left + 16} 28 ${left + 35} 28`,
    "Z",
  ].join(" ");
}

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
  const [dockWidth, setDockWidth] = useState(0);

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
      <View
        pointerEvents="box-none"
        style={[
          styles.dock,
          {
            paddingBottom: Math.max(
              insets.bottom - spacing.lg,
              spacing.sm,
            ),
          },
        ]}
      >
        <View
          onLayout={(event) => setDockWidth(event.nativeEvent.layout.width)}
          style={styles.dockBar}
        >
          {dockWidth > 0 ? (
            <View accessible={false} pointerEvents="none" style={styles.waveSurface}>
              <Svg
                height={100}
                viewBox={`0 0 ${dockWidth} 100`}
                width={dockWidth}
              >
                <Path
                  d={buildDockWavePath(dockWidth)}
                  fill="rgba(253,252,250,0.98)"
                  stroke="rgba(255,255,255,0.98)"
                  strokeWidth={2}
                />
              </Svg>
            </View>
          ) : null}
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
                style={[
                  styles.tab,
                  route.name === "index" && styles.startTab,
                  route.name === "familie" && styles.familyTab,
                ]}
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
    bottom: 0,
    left: 0,
    paddingHorizontal: 0,
    paddingTop: 2,
    position: "absolute",
    right: 0,
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
    height: 70,
    justifyContent: "center",
    marginTop: 28,
    position: "relative",
  },
  startTab: {
    left: spacing.xs,
  },
  familyTab: {
    right: spacing.sm,
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
