import { useRouter } from "expo-router";
import { ScanLine } from "lucide-react-native";

import { EmptyState, OrdiloButton, Screen } from "@/src/components/ui";

/**
 * Scan modal — opened from the prominent center tab button.
 * The native camera (multi-page capture, import from Photos/Files/Share
 * Sheet) is built in the scan/upload milestone; this modal already
 * establishes the navigation contract every screen links against.
 */
export default function ScanModal() {
  const router = useRouter();

  return (
    <Screen>
      <EmptyState
        icon={ScanLine}
        heading="Gleich kannst du hier scannen"
        description="Die Kamera für deine Briefe und Dokumente bauen wir gerade. Bis dahin geht das Hochladen wie gewohnt in der Web-App."
      >
        <OrdiloButton
          title="Schließen"
          variant="outline"
          size="lg"
          onPress={() => router.back()}
        />
      </EmptyState>
    </Screen>
  );
}
