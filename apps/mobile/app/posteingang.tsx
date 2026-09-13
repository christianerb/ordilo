import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Share, ScrollView, StyleSheet, Text, View } from "react-native";
import { Copy, Mail, MailOpen, Share2 } from "lucide-react-native";
import {
  Card,
  DetailTopBar,
  EmptyState,
  IconTile,
  InlineNotice,
  ListGroup,
  ListRow,
  ListSkeleton,
  OrdiloButton,
  Screen,
  ScreenHeader,
  SectionHeader,
} from "@/src/components/ui";
import { apiJson } from "@/src/lib/api";
import { useFamily } from "@/src/lib/family-context";
import { success } from "@/src/lib/feedback";
import {
  formatInboxReceivedAt,
  INBOX_STATUS_LABELS,
  loadInboxEmails,
  type InboxEmail,
  type InboxEmailStatus,
} from "@/src/lib/inbox";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

/** The small status pill on an inbox row — Harbor Blue only when something needs an answer. */
function InboxStatusPill({ status }: { status: InboxEmailStatus }) {
  const attention = status === "new_suggestions";
  return (
    <View style={[styles.pill, attention ? styles.pillAttention : styles.pillQuiet]}>
      <Text
        maxFontSizeMultiplier={1.3}
        style={[typography.label, attention ? styles.pillTextAttention : styles.pillTextQuiet]}
      >
        {INBOX_STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

export default function PosteingangScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emails, setEmails] = useState<InboxEmail[] | null>(null);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [inboxError, setInboxError] = useState<string | null>(null);

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

  const loadInbox = useCallback(async () => {
    if (!family) return;
    setInboxLoading(true);
    setInboxError(null);
    try {
      setEmails(await loadInboxEmails(family.id));
    } catch {
      setInboxError("Die eingegangene Post konnte nicht geladen werden. Bitte versuch es nochmal.");
    } finally { setInboxLoading(false); }
  }, [family]);

  useFocusEffect(useCallback(() => { void load(); void loadInbox(); }, [load, loadInbox]));

  const openDocument = useCallback((documentId: string) => {
    router.push({ pathname: "/document/[id]", params: { id: documentId } });
  }, [router]);

  return (
    <Screen>
      <DetailTopBar onBack={() => router.back()} /><ScreenHeader title="Post für Ordilo" />
      <ScrollView contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xl }}>
        <Text style={typography.body}>Briefe auf Papier, PDFs und E-Mails landen alle in eurer Ablage. Ordilo bereitet das Wichtige vor. Ihr prüft es kurz.</Text>

        <View style={{ gap: spacing.sm }}>
          <SectionHeader
            count={emails && emails.length > 0 ? emails.length : undefined}
            title="Eingegangene Post"
          />
          {inboxLoading ? (
            <ListSkeleton rows={2} />
          ) : inboxError ? (
            <InlineNotice message={inboxError} actionLabel="Erneut versuchen" onAction={() => void loadInbox()} />
          ) : emails && emails.length > 0 ? (
            <ListGroup>
              {emails.map((email, index) => (
                <ListRow
                  key={email.id}
                  accessibilityHint={email.documentId ? "Öffnet das Dokument aus dieser E-Mail." : undefined}
                  chevron={Boolean(email.documentId)}
                  first={index === 0}
                  leading={
                    <IconTile>
                      <Mail color={colors.mistDark} size={20} strokeWidth={1.9} />
                    </IconTile>
                  }
                  meta={
                    <Text style={styles.rowMeta}>{formatInboxReceivedAt(email.receivedAt)}</Text>
                  }
                  onPress={email.documentId ? () => openDocument(email.documentId!) : undefined}
                  subtitle={email.fromAddress || undefined}
                  title={email.subject || "Ohne Betreff"}
                  titleLines={2}
                  trailing={<InboxStatusPill status={email.status} />}
                />
              ))}
            </ListGroup>
          ) : (
            <EmptyState
              icon={MailOpen}
              heading="Noch keine Post angekommen"
              description="Leite eine E-Mail mit PDF oder Fotos an eure Familienadresse weiter. Sobald Ordilo etwas darin findet, erscheint es hier."
            >
              <OrdiloButton title="Dokument aufnehmen" size="lg" onPress={() => router.push("/scan")} />
            </EmptyState>
          )}
        </View>

        <Card style={{ gap: spacing.sm }}>
          <View style={styles.addressHeader}>
            <IconTile>
              <Mail color={colors.harborBlue} size={20} strokeWidth={1.9} />
            </IconTile>
            <Text style={typography.title}>Eure Familienadresse</Text>
          </View>
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
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addressHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  rowMeta: {
    color: colors.mistDark,
    ...typography.timestamp,
  },
  pill: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  pillAttention: {
    backgroundColor: colors.blueSoft,
  },
  pillQuiet: {
    backgroundColor: colors.sandLight,
  },
  pillTextAttention: {
    color: colors.harborBlue,
  },
  pillTextQuiet: {
    color: colors.mistDark,
  },
});
