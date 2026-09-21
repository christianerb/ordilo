import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Copy, MailOpen } from "lucide-react-native";
import {
  Card,
  DetailTopBar,
  EmptyState,
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
} from "@/src/lib/inbox";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

/**
 * The one pill the inbox knows. Quiet states (in der Ablage, abgelegt) get
 * no badge — a row that needs nothing carries nothing. Only a mail with
 * unanswered questions earns a marker.
 */
function InboxAttentionPill() {
  return (
    <View style={styles.pill}>
      <Text maxFontSizeMultiplier={1.3} style={[typography.label, styles.pillText]}>
        {INBOX_STATUS_LABELS.new_suggestions}
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
                  onPress={email.documentId ? () => openDocument(email.documentId!) : undefined}
                  subtitle={
                    // Time first: the row clamps the subtitle to one line,
                    // so a long sender address must truncate, never the time.
                    [formatInboxReceivedAt(email.receivedAt), email.fromAddress]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                  title={email.subject || "Ohne Betreff"}
                  titleLines={2}
                  trailing={email.status === "new_suggestions" ? <InboxAttentionPill /> : undefined}
                />
              ))}
            </ListGroup>
          ) : (
            <EmptyState
              icon={MailOpen}
              heading="Noch keine Post angekommen"
              description="Leite eine E-Mail mit PDF oder Fotos an eure Familienadresse weiter. Sobald Ordilo etwas darin findet, erscheint es hier."
            />
          )}
        </View>

        <Card style={{ gap: spacing.sm }}>
          <Text style={typography.title}>Eure Familienadresse</Text>
          {loading ? <Text style={typography.body}>Adresse wird geladen …</Text> : error ? (
            <InlineNotice message={error} actionLabel="Erneut versuchen" onAction={() => void load()} />
          ) : address ? <>
            <Text selectable style={[typography.body, { color: colors.harborBlue }]}>{address}</Text>
            <OrdiloButton title={copied ? "Adresse kopiert" : "Adresse kopieren"} icon={<Copy color={colors.warmWhite} size={18} />} onPress={() => {
              void Clipboard.setStringAsync(address).then((ok) => { if (ok) { setCopied(true); void success(); } }).catch(() => setError("Kopieren hat nicht geklappt. Du kannst die Adresse gedrückt halten."));
            }} />
            <Text style={typography.timestamp}>Wer diese Adresse kennt, kann euch Post schicken. Teile sie nur mit Menschen, denen ihr vertraut.</Text>
          </> : <Text style={typography.body}>Der E-Mail-Eingang ist noch nicht eingerichtet. Du kannst Dokumente schon scannen oder über „Teilen“ an Ordilo geben.</Text>}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: colors.blueSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  pillText: {
    color: colors.harborBlue,
  },
});
