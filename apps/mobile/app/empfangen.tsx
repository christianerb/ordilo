import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { discardIncomingShares, readShareInbox } from "@/src/lib/share-inbox";
import { Alert, Text, View } from "react-native";
import { InlineNotice, OrdiloButton, Screen, ScreenHeader } from "@/src/components/ui";
import { OrdiloCharacter } from "@/src/components/ordilo-character";
import { useFamily } from "@/src/lib/family-context";
import { stageSharedDocuments } from "@/src/lib/shared-intake";
import { spacing, typography } from "@/src/theme/tokens";

export default function EmpfangenScreen() {
  const { family } = useFamily();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const receive = useCallback(async () => {
    if (!family || busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const deliveries = await readShareInbox();
      for (const delivery of deliveries) {
        await stageSharedDocuments(delivery.payloads, family.id);
        delivery.acknowledge();
      }
      router.replace({ pathname: "/scan", params: { resume: "1" } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Der Import konnte nicht gespeichert werden. Bitte versuch es nochmal.");
    } finally { busy.current = false; }
  }, [family, router]);
  useEffect(() => { void Promise.resolve().then(receive); }, [receive]);
  const discard = useCallback(() => Alert.alert(
    "Offenen Eingang verwerfen?", "Noch nicht übernommene Dateien werden aus diesem Eingang entfernt. Bereits übernommene Dokumente und die Originale in anderen Apps bleiben erhalten.",
    [{ text: "Behalten", style: "cancel" }, { text: "Verwerfen", style: "destructive", onPress: () => {
      try { discardIncomingShares(); router.replace("/scan"); }
      catch { setError("Der Eingang konnte nicht entfernt werden. Bitte versuch es nochmal."); }
    } }],
  ), [router]);
  // One state at a time: while the import runs the screen only reassures, and
  // the failure case leads with a single retry instead of three equal options.
  return <Screen>
    <ScreenHeader title={error ? "Das hat nicht geklappt" : "Deine Post ist da"} />
    <View style={{ gap: spacing.lg, alignItems: "center" }}>
      <OrdiloCharacter size={96} animated={!error} />
      {error ? <>
        <InlineNotice message={error} />
        <View style={{ alignSelf: "stretch", gap: spacing.sm }}>
          <OrdiloButton title="Erneut versuchen" onPress={() => void receive()} />
          <OrdiloButton title="Zur Dokumentaufnahme" variant="outline" onPress={() => { router.replace("/scan"); }} />
        </View>
        <Text style={[typography.timestamp, { textAlign: "center" }]}>Bereits übernommene Dateien liegen sicher in deiner Dokumentaufnahme.</Text>
        <OrdiloButton title="Offenen Eingang verwerfen" variant="ghost" onPress={discard} />
      </> : <Text style={typography.body}>{`Ordilo bereitet den Import für ${family?.name ?? "eure Familie"} vor.`}</Text>}
    </View>
  </Screen>;
}
