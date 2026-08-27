import { Tabs, useRouter } from "expo-router";
import {
  BookOpen,
  CalendarDays,
  House,
  ScanLine,
  Users,
} from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { SpringPressable } from "@/src/components/ui";
import { colors, fonts } from "@/src/theme/tokens";

/**
 * Native tab shell: Heute, Ablage, Plan, Familie — plus the scan action
 * as the prominent center button. Scanning is Ordilo's core mobile loop,
 * so it is reachable from everywhere with one tap and opens the system
 * document scanner (VisionKit on iOS, ML Kit on Android).
 */
export default function TabLayout() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.warmApricot,
        tabBarInactiveTintColor: "rgba(255,255,255,0.55)",
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Heute",
          tabBarIcon: ({ color, focused, size }) => (
            <House color={color} size={size} strokeWidth={focused ? 2.4 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="ablage"
        options={{
          title: "Ablage",
          tabBarIcon: ({ color, focused, size }) => (
            <BookOpen color={color} size={size} strokeWidth={focused ? 2.4 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan-action"
        options={{
          title: "Scannen",
          tabBarLabel: () => null,
          tabBarButton: () => (
            <View style={styles.scanButtonOuter}>
              <SpringPressable
                accessibilityLabel="Dokument scannen"
                onPress={() => {
                  router.push("/scan");
                }}
                style={styles.scanButton}
              >
                <ScanLine color={colors.warmWhite} size={24} strokeWidth={2.2} />
              </SpringPressable>
            </View>
          ),
        }}
        // Never navigated to — the button above opens the scan modal.
        listeners={{
          tabPress: (event) => event.preventDefault(),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: "Plan",
          tabBarIcon: ({ color, focused, size }) => (
            <CalendarDays color={color} size={size} strokeWidth={focused ? 2.4 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="familie"
        options={{
          title: "Familie",
          tabBarIcon: ({ color, focused, size }) => (
            <Users color={color} size={size} strokeWidth={focused ? 2.4 : 2} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.harborBlueDarker,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  tabBarLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
  },
  scanButtonOuter: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  scanButton: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 28,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    marginTop: -18,
    width: 56,
  },
});
