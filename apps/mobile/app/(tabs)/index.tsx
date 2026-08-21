import { useRouter } from "expo-router";
import { Sparkles } from "lucide-react-native";

import { EmptyState, OrdiloButton, Screen, ScreenHeader } from "@/src/components/ui";
import { getGreeting } from "@/src/lib/greeting";

/**
 * Heute — the daily starting point. Content (priorities, open reviews,
 * upcoming tasks) lands with the Home milestone; the shell already
 * carries the greeting and the primary scan entry.
 */
export default function HeuteScreen() {
  const router = useRouter();

  return (
    <Screen>
      <ScreenHeader title={getGreeting(new Date())} subtitle="Dein Überblick für heute" />
      <EmptyState
        icon={Sparkles}
        heading="Noch ist alles ruhig"
        description="Sobald du dein erstes Dokument scannst, zeigt dir Ordilo hier, was heute wichtig ist."
      >
        <OrdiloButton
          title="Dokument scannen"
          size="lg"
          onPress={() => router.push("/scan")}
        />
      </EmptyState>
    </Screen>
  );
}
