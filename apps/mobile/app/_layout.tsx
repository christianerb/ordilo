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
        <StatusBar style="dark" />
        <RootLayoutNav />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function RootLayoutNav() {
  const { session, isLoading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  // Auth gate: without a session only the (auth) group is reachable;
  // with a session the login screen is left behind automatically.
  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!session && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (session && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [session, isLoading, segments, router]);

  // No protected content flashes while the persisted session loads.
  if (isLoading) {
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
        <Stack.Screen name="scan" options={{ presentation: "modal" }} />
      </Stack>
    </ThemeProvider>
  );
}
