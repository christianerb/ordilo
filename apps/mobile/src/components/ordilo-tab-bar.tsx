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
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
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
  const [actionsOpen, setActionsOpen] = useState(false);

  return (
    <>
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <View style={styles.dockBar}>
          <View accessible={false} pointerEvents="none" style={styles.glassHighlights}>
            <View style={styles.sageGlow} />
            <View style={styles.whiteSheen} />
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
                      setActionsOpen(true);
                    }}
                    style={({ pressed }) => [
                      styles.ordiloButton,
                      pressed && styles.ordiloButtonPressed,
                    ]}
                  >
                    <OrdiloMark size={54} />
                  </Pressable>
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
                style={[styles.tab, focused && styles.tabActive]}
              >
                <Icon
                  color={focused ? colors.harborBlueDarker : "rgba(48,84,96,0.58)"}
                  size={21}
                  strokeWidth={focused ? 2.4 : 1.9}
                />
                {focused ? <View style={styles.activeDot} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setActionsOpen(false)}
        presentationStyle="overFullScreen"
        transparent
        visible={actionsOpen}
      >
        <Pressable onPress={() => setActionsOpen(false)} style={styles.overlay}>
          <Pressable
            accessibilityViewIsModal
            onPress={(event) => event.stopPropagation()}
            style={styles.actionSheet}
          >
            <View style={styles.sheetHandle} />
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
                setActionsOpen(false);
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
                setActionsOpen(false);
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
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  dock: {
    backgroundColor: "transparent",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  dockBar: {
    alignItems: "center",
    backgroundColor: "rgba(221,235,229,0.92)",
    borderColor: "rgba(255,255,255,0.96)",
    borderRadius: radii.pill,
    borderWidth: 1,
    elevation: 8,
    flexDirection: "row",
    height: 64,
    justifyContent: "space-around",
    paddingHorizontal: spacing.xs,
    shadowColor: colors.harborBlueDarker,
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  tab: {
    alignItems: "center",
    flex: 1,
    height: 48,
    justifyContent: "center",
    marginVertical: spacing.sm,
    position: "relative",
  },
  tabActive: {
    backgroundColor: "rgba(253,252,250,0.72)",
    borderRadius: radii.pill,
  },
  ordiloSlot: {
    alignItems: "center",
    flex: 1.15,
    height: 64,
    justifyContent: "center",
  },
  ordiloButton: {
    alignItems: "center",
    backgroundColor: "rgba(253,252,250,0.96)",
    borderColor: "rgba(255,255,255,0.98)",
    borderRadius: radii.pill,
    borderWidth: 5,
    elevation: 8,
    height: 72,
    justifyContent: "center",
    marginTop: -24,
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
  activeDot: {
    backgroundColor: colors.warmApricot,
    borderRadius: radii.pill,
    bottom: 3,
    height: 4,
    position: "absolute",
    width: 4,
  },
  glassHighlights: {
    borderRadius: radii.pill,
    bottom: 0,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0,
  },
  sageGlow: {
    backgroundColor: "rgba(48,84,96,0.09)",
    borderRadius: radii.pill,
    height: 72,
    left: -18,
    position: "absolute",
    top: -35,
    width: 150,
  },
  whiteSheen: {
    backgroundColor: "rgba(255,255,255,0.78)",
    borderRadius: radii.pill,
    height: 2,
    left: 28,
    position: "absolute",
    right: 28,
    top: 5,
  },
  overlay: {
    backgroundColor: "rgba(38, 36, 33, 0.28)",
    flex: 1,
    justifyContent: "flex-end",
  },
  actionSheet: {
    backgroundColor: colors.warmWhite,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  sheetHandle: {
    alignSelf: "center",
    backgroundColor: colors.mistLight,
    borderRadius: radii.pill,
    height: 4,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
    width: 40,
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
