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
import { CloudOff } from "lucide-react-native";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { OrdiloButton, Screen } from "@/src/components/ui";
import { SessionProvider, useSession } from "@/src/lib/session";
import { FamilyProvider, useFamily } from "@/src/lib/family-context";
import { isOnboardingComplete, needsWelcomeIntro } from "@/src/lib/family";
import { colors, spacing, typography } from "@/src/theme/tokens";

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
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SessionProvider>
          <FamilyProvider>
            <StatusBar style="dark" />
            <RootLayoutNav />
          </FamilyProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  const { session, isLoading: sessionLoading, signOut } = useSession();
  const {
    family,
    isLoading: familyLoading,
    error: familyError,
    refresh: refreshFamily,
  } = useFamily();
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

    // A failed family lookup must never read as "no family" — the web
    // middleware fails safe the same way (a transient error would
    // otherwise bounce an onboarded user back into onboarding). Keep
    // the current route; the error surface below offers a retry.
    if (familyError) return;

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
  }, [
    session,
    sessionLoading,
    family,
    familyLoading,
    familyError,
    segments,
    router,
  ]);

  // No protected content flashes while session or family state loads.
  if (sessionLoading || (session && familyLoading)) {
    return null;
  }

  // Family lookup failed: surface the error with a retry instead of
  // routing anywhere. Invite links keep their own flow (they re-resolve
  // everything they need themselves).
  if (session && familyError && segments[0] !== "invite") {
    return (
      <ThemeProvider value={ordiloTheme}>
        <Screen style={gateStyles.errorScreen}>
          <View style={gateStyles.errorIconCircle}>
            <CloudOff color={colors.harborBlue} size={28} strokeWidth={1.75} />
          </View>
          <Text style={gateStyles.errorTitle}>
            Deine Familie konnte nicht geladen werden
          </Text>
          <Text style={[typography.body, gateStyles.errorText]}>
            {familyError}
          </Text>
          <OrdiloButton
            onPress={() => void refreshFamily()}
            size="lg"
            title="Erneut versuchen"
          />
          <OrdiloButton
            onPress={() => void signOut()}
            size="lg"
            title="Abmelden"
            variant="ghost"
          />
        </Screen>
      </ThemeProvider>
    );
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
        <Stack.Screen name="document/[id]" />
        <Stack.Screen name="sammlungen/index" />
        <Stack.Screen name="sammlungen/[id]" />
      </Stack>
    </ThemeProvider>
  );
}

const gateStyles = StyleSheet.create({
  errorScreen: {
    alignItems: "center",
    gap: spacing.md,
    justifyContent: "center",
  },
  errorIconCircle: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: 32,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  errorTitle: {
    color: colors.graphite,
    fontFamily: typography.display.fontFamily,
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  errorText: {
    color: colors.mistDark,
    lineHeight: 24,
    maxWidth: 300,
    textAlign: "center",
  },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
});
