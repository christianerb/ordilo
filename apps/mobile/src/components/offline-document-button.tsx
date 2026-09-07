import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Download } from "lucide-react-native";
import { OrdiloButton } from "./ui";
import { saveOfflineDocument, type OfflineSnapshot } from "@/src/lib/offline-documents";
import { colors, spacing, typography } from "@/src/theme/tokens";

export function OfflineDocumentButton({ userId, familyId, snapshot, getDownloadUrl }: {
  userId: string;
  familyId: string;
  snapshot: OfflineSnapshot;
  getDownloadUrl: () => Promise<string>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await saveOfflineDocument(userId, familyId, snapshot, getDownloadUrl);
      setSaved(true);
    } catch (error) {
      Alert.alert("Noch nicht offline gespeichert", error instanceof Error ? error.message : "Bitte versuch es nochmal, sobald du Internet hast.");
    } finally { setBusy(false); }
  };
  return <View style={{ gap: spacing.sm }}>
    <OrdiloButton title={busy ? "Wird sicher gespeichert …" : saved ? "Offline-Kopie aktualisieren" : "Auf diesem Gerät speichern"} disabled={busy} variant="outline" icon={<Download color={colors.harborBlue} size={18} />} onPress={() => void save()} />
    <Text style={[typography.caption, { color: colors.mistDark }]}>Die verschlüsselte Kopie bleibt auch ohne Internet lesbar. Sie aktualisiert sich nicht automatisch und wird beim Abmelden gelöscht.</Text>
    <OrdiloButton title="Meine Offline-Kopien" variant="ghost" onPress={() => router.push("/offline")} />
  </View>;
}
