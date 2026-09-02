import { Tabs } from "expo-router";

import { OrdiloTabBar } from "@/src/components/ordilo-tab-bar";

/**
 * Native tab shell. Three destinations — Start, Dokumente, Plan — and two
 * launchers that never navigate: the Ordilo mark in the middle opens the
 * conversation, Scannen on the right opens the camera. Both are one tap,
 * because giving Ordilo something and asking Ordilo something are the two
 * things a family does every day. The family itself lives on every row and
 * behind the faces in the Start header, not in a tab of its own.
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => <OrdiloTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Start" }} />
      <Tabs.Screen name="ablage" options={{ title: "Dokumente" }} />
      <Tabs.Screen
        name="scan-action"
        options={{ title: "Ordilo fragen" }}
        // Never navigated to — the OrdiloTabBar renders the center action.
        listeners={{
          tabPress: (event) => event.preventDefault(),
        }}
      />
      <Tabs.Screen name="plan" options={{ title: "Plan" }} />
      <Tabs.Screen
        name="scannen"
        options={{ title: "Scannen" }}
        // Never navigated to — the OrdiloTabBar opens the scanner.
        listeners={{
          tabPress: (event) => event.preventDefault(),
        }}
      />
    </Tabs>
  );
}
