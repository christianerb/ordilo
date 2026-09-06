import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Share, ScrollView, Text, View } from "react-native";
import { Copy, Mail, Share2 } from "lucide-react-native";
import { Card, InlineNotice, OrdiloButton, Screen, ScreenHeader, DetailTopBar } from "@/src/components/ui";
import { apiJson } from "@/src/lib/api";
import { useFamily } from "@/src/lib/family-context";
import { success } from "@/src/lib/feedback";
import { colors, spacing, typography } from "@/src/theme/tokens";

export default function PosteingangScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    if (!family) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiJson<{ address: string | null }>(`/api/family/inbound-address?family_id=${family.id}`);
      setAddress(result.address);
    } catch {
      setError("Die Adresse konnte nicht geladen werden. Bitte versuch es nochmal.");
    } finally { setLoading(false); }
  }, [family]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return (
    <Screen>
      <DetailTopBar onBack={() => router.back()} /><ScreenHeader title="Post für Ordilo" />
      <ScrollView contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xl }}>
        <Text style={typography.body}>Briefe auf Papier, PDFs und E-Mails landen alle in eurer Ablage. Ordilo bereitet das Wichtige vor. Ihr prüft es kurz.</Text>
        <Card style={{ gap: spacing.md }}>
          <Mail color={colors.harborBlue} size={28} />
          <Text style={typography.title}>Eure Familienadresse</Text>
          <Text style={typography.body}>Leite eine E-Mail mit PDF oder Fotos an diese Adresse weiter. Auch Termine und Aufgaben aus einer E-Mail ohne Anhang kann Ordilo vorschlagen.</Text>
          {loading ? <Text style={typography.body}>Adresse wird geladen …</Text> : error ? (
            <InlineNotice message={error} actionLabel="Erneut versuchen" onAction={() => void load()} />
          ) : address ? <>
            <Text selectable style={[typography.body, { color: colors.harborBlue }]}>{address}</Text>
            <OrdiloButton title={copied ? "Adresse kopiert" : "Adresse kopieren"} icon={<Copy color={colors.warmWhite} size={18} />} onPress={() => {
              void Clipboard.setStringAsync(address).then((ok) => { if (ok) { setCopied(true); void success(); } }).catch(() => setError("Kopieren hat nicht geklappt. Du kannst die Adresse gedrückt halten."));
            }} />
            <OrdiloButton title="Adresse teilen" variant="outline" icon={<Share2 color={colors.harborBlue} size={18} />} onPress={() => {
              void Share.share({ message: `Unsere Adresse für Dokumente in Ordilo: ${address}` }).catch(() => setError("Teilen hat nicht geklappt. Du kannst die Adresse kopieren."));
            }} />
            <Text style={typography.timestamp}>Wer diese Adresse kennt, kann euch Post schicken. Teile sie nur mit Menschen, denen ihr vertraut.</Text>
          </> : <Text style={typography.body}>Der E-Mail-Eingang ist noch nicht eingerichtet. Du kannst Dokumente schon scannen oder über „Teilen“ an Ordilo geben.</Text>}
        </Card>
        <View style={{ gap: spacing.sm }}>
          <Text style={typography.title}>Direkt aus einer anderen App</Text>
          <Text style={typography.body}>Öffne ein PDF oder Foto, tippe auf „Teilen“ und wähle Ordilo. Falls Ordilo fehlt, schau unter „Mehr“ nach. Auf dem iPhone wird die Datei zuerst sicher gespeichert. Öffne danach Ordilo, um sie einzuordnen.</Text>
          <Text style={typography.timestamp}>Ordilo behält den Import auf diesem Gerät, wenn die Verbindung abbricht. In der Dokumentaufnahme kannst du ihn fortsetzen.</Text>
        </View>
        <OrdiloButton title="Dokument aufnehmen" onPress={() => router.push("/scan")} size="lg" />
      </ScrollView>
    </Screen>
  );
}
