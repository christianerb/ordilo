import { Tabs } from "expo-router";

import { OrdiloTabBar } from "@/src/components/ordilo-tab-bar";

/**
 * Native tab shell: Heute, Ablage, Plan, Familie — with the Ordilo mark
 * as the central action anchor instead of a plain scan button. The
 * floating dock is custom (OrdiloTabBar); tapping the mark opens the
 * family actions (ask Ordilo, capture a document).
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
        // Never navigated to — the OrdiloTabBar renders the center action.
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
