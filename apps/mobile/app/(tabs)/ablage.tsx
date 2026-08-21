import { useRouter } from "expo-router";
import { BookOpen } from "lucide-react-native";

import { EmptyState, OrdiloButton, Screen, ScreenHeader } from "@/src/components/ui";

/**
 * Ablage — documents, notes and contacts. The searchable library arrives
 * with the Ablage milestone.
 */
export default function AblageScreen() {
  const router = useRouter();

  return (
    <Screen>
      <ScreenHeader title="Ablage" subtitle="Dokumente, Notizen und Kontakte" />
      <EmptyState
        icon={BookOpen}
        heading="Deine Ablage ist noch leer"
        description="Gescannte Dokumente, Notizen und Kontakte findest du hier — alles an einem Ort."
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
