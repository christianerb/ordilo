import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  useFonts,
} from "@expo-google-fonts/figtree";
import {
  DefaultTheme,
  Stack,
  ThemeProvider,
  useRouter,
  useSegments,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessionProvider, useSession } from "@/src/lib/session";
import { FamilyProvider, useFamily } from "@/src/lib/family-context";
import { isOnboardingComplete, needsWelcomeIntro } from "@/src/lib/family";
import { colors } from "@/src/theme/tokens";

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

// Prevent the splash screen from auto-hiding before fonts are ready.
void SplashScreen.preventAutoHideAsync();

/**
 * React Navigation theme built from the Ordilo tokens. The app is
 * light-only: DESIGN.md defines no dark palette, and userInterfaceStyle
 * in app.json is pinned to light accordingly.
 */
const ordiloTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.harborBlue,
    background: colors.warmWhite,
    card: colors.warmWhite,
    text: colors.graphite,
    border: colors.mistLight,
    notification: colors.warmApricot,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <FamilyProvider>
          <StatusBar style="dark" />
          <RootLayoutNav />
        </FamilyProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function RootLayoutNav() {
  const { session, isLoading: sessionLoading } = useSession();
  const { family, isLoading: familyLoading } = useFamily();
  const segments = useSegments();
  const router = useRouter();

  // App gate — mirrors the web middleware (src/lib/supabase/middleware.ts):
  // no session → login; no family or unfinished owner setup → onboarding;
  // invited member with a pending intro → willkommen; else the tabs.
  useEffect(() => {
    if (sessionLoading) return;
    if (session && familyLoading) return;

    const first = segments[0];
    const inAuthGroup = first === "(auth)";
    const onOnboarding = first === "onboarding";
    const onWelcome = first === "willkommen";
    // Invite links run their own flow and must never be bounced by the
    // gate — including while signed out (the invite screen handles login).
    const onInvite = first === "invite";

    if (!session) {
      if (!inAuthGroup && !onInvite) {
        router.replace("/(auth)/login");
      }
      return;
    }

    if (inAuthGroup) {
      // Logged in on the login screen — route by family state.
      if (!family || !isOnboardingComplete(family)) {
        router.replace("/onboarding");
      } else if (needsWelcomeIntro(family)) {
        router.replace("/willkommen");
      } else {
        router.replace("/(tabs)");
      }
      return;
    }

    if (onInvite) return;

    if (!family || !isOnboardingComplete(family)) {
      if (!onOnboarding) router.replace("/onboarding");
      return;
    }
    if (needsWelcomeIntro(family)) {
      if (!onWelcome) router.replace("/willkommen");
      return;
    }
    if (onOnboarding || onWelcome) {
      router.replace("/(tabs)");
    }
  }, [session, sessionLoading, family, familyLoading, segments, router]);

  // No protected content flashes while session or family state loads.
  if (sessionLoading || (session && familyLoading)) {
    return null;
  }

  return (
    <ThemeProvider value={ordiloTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.warmWhite },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="willkommen" />
        <Stack.Screen name="scan" options={{ presentation: "modal" }} />
      </Stack>
    </ThemeProvider>
  );
}
