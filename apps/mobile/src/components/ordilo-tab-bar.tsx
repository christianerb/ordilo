import { useRouter } from "expo-router";
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";
import {
  CalendarDays,
  FolderOpen,
  House,
  ScanLine,
} from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { OrdiloMark } from "@/src/components/ordilo-mark";
import { haptics } from "@/src/lib/haptics";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const tabConfig = {
  index: { icon: House, label: "Start" },
  ablage: { icon: FolderOpen, label: "Dokumente" },
  plan: { icon: CalendarDays, label: "Plan" },
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
 * A floating, thumb-reachable family dock. Three places to be — Start,
 * Dokumente, Plan — and two things to do: the Ordilo mark in the middle
 * opens the conversation, Scannen on the right opens the intake sheet
 * (scan, photos, files). Both are one tap; neither is a destination, so
 * neither ever reads as selected.
 */
export function OrdiloTabBar({
  navigation,
  state,
}: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [dockWidth, setDockWidth] = useState(0);

  return (
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
                  accessibilityHint="Öffnet das Gespräch mit Ordilo"
                  accessibilityLabel="Ordilo fragen"
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={() => {
                    haptics.tap();
                    router.push("/suche");
                  }}
                  style={({ pressed }) => [
                    styles.ordiloButton,
                    pressed && styles.ordiloButtonPressed,
                  ]}
                >
                  <OrdiloMark size={54} />
                </Pressable>
                <Text style={styles.ordiloLabel}>Ordilo fragen</Text>
              </View>
            );
          }

          if (route.name === "scannen") {
            return (
              <Pressable
                accessibilityHint="Öffnet Scannen, Fotos und Dateien"
                accessibilityLabel="Dokument hinzufügen"
                accessibilityRole="button"
                hitSlop={4}
                key={route.key}
                onPress={() => {
                  haptics.tap();
                  // The chooser, not the camera: a photo or a PDF must not
                  // have to pass through the scanner first.
                  router.push("/scan");
                }}
                style={[styles.tab, styles.scanTab]}
              >
                <View style={styles.scanIcon}>
                  <ScanLine color={colors.warmWhite} size={18} strokeWidth={2.3} />
                </View>
                <Text style={styles.tabLabel}>Scannen</Text>
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
                  haptics.selection();
                  navigation.navigate(route.name);
                }
              }}
              onLongPress={() =>
                navigation.emit({ target: route.key, type: "tabLongPress" })
              }
              style={[
                styles.tab,
                route.name === "index" && styles.startTab,
              ]}
            >
              <View style={styles.tabIcon}>
                <Icon
                  color={focused ? colors.harborBlueDarker : "rgba(48,84,96,0.58)"}
                  size={25}
                  strokeWidth={focused ? 2.4 : 1.9}
                />
              </View>
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
    gap: 4,
    height: 70,
    justifyContent: "center",
    marginTop: 28,
    position: "relative",
  },
  tabIcon: {
    alignItems: "center",
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  scanIcon: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  startTab: {
    left: spacing.xs,
  },
  scanTab: {
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
