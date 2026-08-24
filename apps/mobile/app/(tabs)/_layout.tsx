import { Tabs } from "expo-router";

import { OrdiloTabBar } from "@/src/components/ordilo-tab-bar";

/**
 * Native tab shell: Heute, Ablage, Plan, Familie — plus the scan action
 * as the prominent center button. Scanning is Ordilo's core mobile loop,
 * so it is reachable from everywhere with one tap and opens the system
 * document scanner (VisionKit on iOS, ML Kit on Android).
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => <OrdiloTabBar {...props} />}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Heute",
        }}
      />
      <Tabs.Screen
        name="ablage"
        options={{
          title: "Ablage",
        }}
      />
      <Tabs.Screen
        name="scan-action"
        options={{
          title: "Scannen",
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
        }}
      />
      <Tabs.Screen
        name="familie"
        options={{
          title: "Familie",
        }}
      />
    </Tabs>
  );
}
