import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  FileText,
  Mic,
  RotateCcw,
  Send,
  Square,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { OrdiloMark } from "./ordilo-mark";
import { OrdiloButton } from "./ui";
import { ContactActionGrid, openContactHref } from "./contacts";
import {
  CHAT_FEEDBACK_REASONS,
  formatChatMessageTime,
  getActionContent,
  getSuggestedContactAction,
  getToolStepLabel,
  type AnswerCard,
  type ChatAction,
  type ChatFeedbackReason,
  type ChatMessage,
  type ChatSource,
  type ToolCallProgress,
} from "@/src/lib/chat";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

/**
 * Chat UI for „Ordilo fragen". Presentational components — the screen
 * (app/suche.tsx) owns state, streaming and networking. All copy is
 * German and mirrors the web (src/app/(app)/suche).
 */

/** One live status line while Ordilo works (ported from the web). */
export function ChatStatusLine({
  toolCalls,
  hasText,
}: {
  toolCalls: ToolCallProgress[];
  hasText: boolean;
}) {
  const active = [...toolCalls].reverse().find((call) => call.state === "start");
  const latest = active ?? toolCalls[toolCalls.length - 1];

  let label = "Ordilo denkt nach …";
  if (hasText) label = "Schreibt die Antwort …";
  else if (active) label = `${getToolStepLabel(active.toolName)} …`;
  else if (latest?.state === "error") label = "Da ist was schiefgegangen.";

  return (
    <View
      accessibilityLiveRegion="polite"
      style={styles.statusLine}
    >
      <ActivityIndicator color={colors.harborBlue} size="small" />
      <Text style={styles.statusText}>{label}</Text>
    </View>
  );
}

/** User bubble (right, harbor blue) and assistant bubble (left). */
export function MessageBubble({
  message,
  children,
}: {
  message: ChatMessage;
  children?: React.ReactNode;
}) {
  const isUser = message.role === "user";
  const messageTime = useMemo(
    () => formatChatMessageTime(message.createdAt),
    [message.createdAt],
  );

  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      {!isUser ? (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={styles.bubbleAvatar}
        >
          <OrdiloMark size={30} />
        </View>
      ) : null}
      <View
        accessibilityLiveRegion={
          !isUser && message.status === "streaming" ? "polite" : "none"
        }
        style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}
      >
        {message.text ? (
          <Text selectable style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
            {message.text}
            {message.status === "streaming" && !isUser ? " ▍" : ""}
          </Text>
        ) : null}
        {message.text ? (
          <Text style={[styles.bubbleTime, isUser && styles.bubbleTimeUser]}>
            {messageTime}
          </Text>
        ) : null}
        {children}
      </View>
    </View>
  );
}

/** „Passende Dokumente" — top sources (score ≥ 0.5, max 4), rest toggled. */
export function SourcesSection({
  sources,
  onOpenDocument,
}: {
  sources: ChatSource[];
  onOpenDocument: (documentId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (sources.length === 0) return null;

  const top = sources.filter((source) => source.score >= 0.5).slice(0, 4);
  const rest = sources.filter((source) => !top.includes(source));
  const visible = expanded ? [...top, ...rest] : top;

  return (
    <View style={styles.sources}>
      <Text style={styles.sourcesHeading}>
        {sources.length === 1
          ? "Passendes Dokument"
          : `Passende Dokumente (${sources.length})`}
      </Text>
      {visible.map((source, index) => (
        <Pressable
          accessibilityHint="Öffnet das Dokument"
          accessibilityLabel={source.title || "Dokument"}
          accessibilityRole="button"
          key={`${source.document_id}-${index}`}
          onPress={() => onOpenDocument(source.document_id)}
          style={({ pressed }) => [styles.sourceCard, pressed && styles.pressed]}
        >
          <FileText color={colors.harborBlue} size={18} strokeWidth={1.8} />
          <View style={styles.sourceCopy}>
            <Text numberOfLines={1} style={styles.sourceTitle}>
              {source.title || "Dokument"}
            </Text>
            <Text numberOfLines={2} style={styles.sourceExcerpt}>
              {source.excerpt}
            </Text>
          </View>
          <ChevronRight color={colors.mistDark} size={16} />
        </Pressable>
      ))}
      {rest.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((current) => !current)}
          style={({ pressed }) => [styles.sourcesToggle, pressed && styles.pressed]}
        >
          {expanded ? (
            <ChevronUp color={colors.harborBlue} size={16} />
          ) : (
            <ChevronDown color={colors.harborBlue} size={16} />
          )}
          <Text style={styles.sourcesToggleText}>
            {expanded
              ? "Weniger anzeigen"
              : `${rest.length} weitere mögliche Dokumente anzeigen`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const ANSWER_CARD_LINK_LABELS: Record<string, string> = {
  termin: "Zum Termin",
  aufgabe: "Zur Aufgabe",
  kontakt: "Kontakt öffnen",
};

/** Structured answer card (termin/aufgabe/dokument/zugangsdaten/kontakt). */
export function AnswerCardView({
  card,
  onOpenDocument,
  onOpenContact,
}: {
  card: AnswerCard;
  onOpenDocument: (documentId: string) => void;
  onOpenContact: (contactId: string) => void;
}) {
  const contact = card.contact;
  const suggested = getSuggestedContactAction(contact);
  return (
    <View style={styles.answerCard}>
      <Text style={styles.answerTitle}>{card.title}</Text>
      {card.subtitle ? (
        <Text style={styles.answerSubtitle}>{card.subtitle}</Text>
      ) : null}
      {card.fields.map((field, index) => (
        <View key={`${field.label}-${index}`} style={styles.answerField}>
          <Text style={styles.answerFieldLabel}>{field.label}</Text>
          <Text style={styles.answerFieldValue}>{field.value}</Text>
        </View>
      ))}
      {card.type === "kontakt" && contact ? (
        suggested ? (
          // The server suggested one action with a verified message draft —
          // keep it, otherwise the draft would be lost in an empty composer.
          <OrdiloButton
            onPress={() => void openContactHref(suggested.href)}
            title={suggested.label}
          />
        ) : (
          <ContactActionGrid
            compact
            contact={{
              id: contact.id,
              family_id: "",
              source_document_id: null,
              name: card.title,
              organization: null,
              role: null,
              phone: contact.phone,
              email: contact.email,
              status: "confirmed",
              created_at: "",
              updated_at: "",
            }}
          />
        )
      ) : null}
      {card.type === "kontakt" && contact ? (
        <Pressable
          accessibilityLabel="Kontakt öffnen"
          accessibilityRole="button"
          onPress={() => onOpenContact(contact.id)}
          style={({ pressed }) => [styles.cardLink, pressed && styles.pressed]}
        >
          <Text style={styles.cardLinkText}>Kontakt öffnen</Text>
          <ChevronRight color={colors.harborBlue} size={16} />
        </Pressable>
      ) : card.actionDocumentId ? (
        <Pressable
          accessibilityLabel={
            ANSWER_CARD_LINK_LABELS[card.type] ?? "Zum Dokument"
          }
          accessibilityRole="button"
          onPress={() => onOpenDocument(card.actionDocumentId!)}
          style={({ pressed }) => [styles.cardLink, pressed && styles.pressed]}
        >
          <Text style={styles.cardLinkText}>
            {ANSWER_CARD_LINK_LABELS[card.type] ?? "Zum Dokument"}
          </Text>
          <ChevronRight color={colors.harborBlue} size={16} />
        </Pressable>
      ) : null}
      {card.hasSecret ? (
        <Text style={styles.secretHint}>
          Die Zugangsdaten findest du im Dokument.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Proposed write with explicit confirmation. „Übernehmen" is the only
 * path that writes; „Ändern" hands the proposal back to the composer;
 * the X discards. Undo (where supported) re-opens a finished task.
 */
export function ActionCardView({
  action,
  onConfirm,
  onDismiss,
  onAdjust,
  onUndo,
}: {
  action: ChatAction;
  onConfirm: () => void;
  onDismiss: () => void;
  onAdjust: () => void;
  onUndo: () => void;
}) {
  const content = getActionContent(action);
  const working = action.state === "confirming" || action.state === "undoing";
  const resolved =
    action.state === "confirmed" || action.state === "undone";

  if (action.state === "dismissed") {
    return (
      <View style={[styles.actionCard, styles.actionCardMuted]}>
        <Text style={styles.actionEyebrow}>Nicht übernommen</Text>
        <Text style={styles.actionTitle}>{content.title}</Text>
      </View>
    );
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.actionCard,
        resolved && styles.actionCardResolved,
        action.state === "error" && styles.actionCardError,
      ]}
    >
      <View style={styles.actionHeader}>
        <View style={styles.actionIcon}>
          {resolved ? (
            <Check color={colors.harborBlue} size={18} strokeWidth={2} />
          ) : (
            <FileText color={colors.harborBlue} size={18} strokeWidth={1.8} />
          )}
        </View>
        <View style={styles.actionHeaderCopy}>
          <Text style={styles.actionEyebrow}>
            {action.state === "confirmed"
              ? "Übernommen"
              : action.state === "undone"
                ? "Rückgängig gemacht"
                : action.state === "error"
                  ? "Hat nicht geklappt"
                  : content.eyebrow}
          </Text>
          <Text style={styles.actionTitle}>{content.title}</Text>
        </View>
        {action.state === "ready" ? (
          <Pressable
            accessibilityLabel="Nicht übernehmen"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onDismiss}
            style={styles.actionDismiss}
          >
            <X color={colors.mistDark} size={18} />
          </Pressable>
        ) : null}
      </View>

      {content.details.map((detail, index) => (
        <View key={`${detail.label}-${index}`} style={styles.answerField}>
          <Text style={styles.answerFieldLabel}>{detail.label}</Text>
          <Text style={styles.answerFieldValue}>{detail.value}</Text>
        </View>
      ))}

      {action.state === "ready" ? (
        <>
          <Text style={styles.actionHint}>
            Ich speichere das erst, wenn du es übernimmst.
          </Text>
          <View style={styles.actionButtons}>
            <OrdiloButton onPress={onConfirm} title="Übernehmen" />
            <OrdiloButton onPress={onAdjust} title="Ändern" variant="ghost" />
          </View>
        </>
      ) : null}

      {working ? (
        <View style={styles.actionWorking}>
          <ActivityIndicator color={colors.harborBlue} size="small" />
          <Text style={styles.actionWorkingText}>
            {action.state === "confirming"
              ? "Wird übernommen …"
              : "Wird rückgängig gemacht …"}
          </Text>
        </View>
      ) : null}

      {action.state === "error" ? (
        <>
          <Text accessibilityRole="alert" style={styles.actionError}>
            {action.error ?? "Das hat nicht geklappt. Bitte versuch es nochmal."}
          </Text>
          <OrdiloButton
            onPress={action.errorOperation === "undo" ? onUndo : onConfirm}
            title="Erneut versuchen"
            variant="outline"
          />
        </>
      ) : null}

      {action.state === "confirmed" && action.undo ? (
        <Pressable
          accessibilityLabel="Rückgängig machen"
          accessibilityRole="button"
          onPress={onUndo}
          style={({ pressed }) => [styles.undoButton, pressed && styles.pressed]}
        >
          <RotateCcw color={colors.harborBlue} size={16} />
          <Text style={styles.undoText}>Rückgängig</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Thumbs up/down + reason panel; only offered for persisted messages. */
export function FeedbackRow({
  message,
  onSend,
}: {
  message: ChatMessage;
  onSend: (
    feedback: "positive" | "negative",
    reasons: ChatFeedbackReason[],
    comment: string,
  ) => Promise<void>;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [reasons, setReasons] = useState<ChatFeedbackReason[]>([]);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [thanks, setThanks] = useState(false);

  if (!message.dbId) return null;

  if (message.feedback || thanks) {
    return (
      <Text style={styles.feedbackThanks}>
        Danke, gespeichert.
      </Text>
    );
  }

  const send = async (feedback: "positive" | "negative") => {
    setSending(true);
    try {
      await onSend(feedback, reasons, comment);
      setThanks(true);
      setPanelOpen(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSending(false);
    }
  };

  const toggleReason = (reason: ChatFeedbackReason) => {
    void Haptics.selectionAsync();
    setReasons((current) =>
      current.includes(reason)
        ? current.filter((item) => item !== reason)
        : [...current, reason].slice(0, 3),
    );
  };

  return (
    <View style={styles.feedback}>
      <View style={styles.feedbackRow}>
        <Pressable
          accessibilityLabel="Antwort war hilfreich"
          accessibilityRole="button"
          hitSlop={6}
          onPress={() => void send("positive")}
          style={styles.feedbackButton}
        >
          <ThumbsUp color={colors.mistDark} size={17} strokeWidth={1.8} />
        </Pressable>
        <Pressable
          accessibilityLabel="Antwort war nicht hilfreich"
          accessibilityRole="button"
          hitSlop={6}
          onPress={() => setPanelOpen((current) => !current)}
          style={styles.feedbackButton}
        >
          <ThumbsDown
            color={panelOpen ? colors.harborBlue : colors.mistDark}
            size={17}
            strokeWidth={1.8}
          />
        </Pressable>
        <CopyAnswerButton text={message.text} />
      </View>

      {panelOpen ? (
        <View style={styles.feedbackPanel}>
          <Text style={styles.feedbackPanelTitle}>Was war nicht gut?</Text>
          <View style={styles.feedbackChips}>
            {CHAT_FEEDBACK_REASONS.map((reason) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: reasons.includes(reason.value) }}
                key={reason.value}
                onPress={() => toggleReason(reason.value)}
                style={[
                  styles.feedbackChip,
                  reasons.includes(reason.value) && styles.feedbackChipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.feedbackChipText,
                    reasons.includes(reason.value) &&
                      styles.feedbackChipTextSelected,
                  ]}
                >
                  {reason.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            accessibilityLabel="Kommentar zum Feedback"
            multiline
            onChangeText={setComment}
            placeholder="Was hätte Ordilo besser machen können? (optional)"
            placeholderTextColor={colors.mistDark}
            style={styles.feedbackComment}
            value={comment}
          />
          <OrdiloButton
            disabled={sending}
            onPress={() => void send("negative")}
            title={sending ? "Wird gesendet …" : "Senden"}
          />
        </View>
      ) : null}
    </View>
  );
}

function CopyAnswerButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      accessibilityLabel="Antwort kopieren"
      accessibilityRole="button"
      hitSlop={6}
      onPress={async () => {
        const success = await Clipboard.setStringAsync(text);
        if (!success) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 1_500);
      }}
      style={styles.feedbackButton}
    >
      {copied ? (
        <Check color={colors.harborBlue} size={17} />
      ) : (
        <Copy color={colors.mistDark} size={17} strokeWidth={1.8} />
      )}
    </Pressable>
  );
}

const VOICE_WAVE_SAMPLES = 11;

function VoiceWaveBar({
  sample,
}: {
  sample: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: Math.max(0.16, sample.get()) }],
  }));
  return <Animated.View style={[styles.voiceBar, style]} />;
}

/**
 * A short rolling audio history, rather than five copies of the current
 * meter. Reanimated keeps each bar's settling motion off the JS thread.
 */
function VoiceWaveform({ level }: { level: number }) {
  const reduceMotion = useReducedMotion();
  const samples = [
    useSharedValue(0.16),
    useSharedValue(0.16),
    useSharedValue(0.16),
    useSharedValue(0.16),
    useSharedValue(0.16),
    useSharedValue(0.16),
    useSharedValue(0.16),
    useSharedValue(0.16),
    useSharedValue(0.16),
    useSharedValue(0.16),
    useSharedValue(0.16),
  ];
  const samplesRef = useRef(samples);

  useEffect(() => {
    const next = Math.max(0.16, Math.min(1, level));
    const values = samplesRef.current.map((sample) => sample.get());
    const duration = reduceMotion ? 0 : 120;
    samplesRef.current.forEach((sample, index) => {
      sample.set(
        withTiming(
          index === VOICE_WAVE_SAMPLES - 1 ? next : values[index + 1]!,
          { duration, reduceMotion: ReduceMotion.System },
        ),
      );
    });
  }, [level, reduceMotion]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.voiceWave}
    >
      {samples.map((sample, index) => (
        <VoiceWaveBar key={index} sample={sample} />
      ))}
    </View>
  );
}

function VoiceRecordingPanel({
  durationMillis,
  level,
  onCancel,
  onFinish,
}: {
  durationMillis: number;
  level: number;
  onCancel: () => void;
  onFinish: () => void;
}) {
  return (
    <View
      accessibilityLabel={`Aufnahme läuft, ${formatVoiceDuration(durationMillis)}`}
      accessibilityLiveRegion="polite"
      style={styles.voicePanel}
    >
      <View style={styles.voicePanelHeader}>
        <View style={styles.voicePanelStatus}>
          <View accessibilityElementsHidden style={styles.voiceRecordingDot} />
          <Text style={styles.voicePanelTitle}>Aufnahme läuft</Text>
        </View>
        <Text style={styles.voiceDuration}>
          {formatVoiceDuration(durationMillis)}
        </Text>
      </View>
      <VoiceWaveform level={level} />
      <Text style={styles.voiceInstruction}>Tippe auf Fertig, wenn du fertig bist.</Text>
      <View style={styles.voicePanelActions}>
        <Pressable
          accessibilityLabel="Aufnahme verwerfen"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onCancel}
          style={({ pressed }) => [
            styles.voicePanelSecondaryAction,
            pressed && styles.pressed,
          ]}
        >
          <X color={colors.mistDark} size={18} strokeWidth={2} />
          <Text style={styles.voicePanelSecondaryText}>Verwerfen</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Aufnahme beenden"
          accessibilityRole="button"
          onPress={onFinish}
          style={({ pressed }) => [
            styles.voicePanelPrimaryAction,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.voicePanelPrimaryText}>Fertig</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Bottom composer with a dedicated, stable recording context above it. */
export function ChatComposer({
  busy,
  inputRef,
  onChange,
  onSend,
  onVoiceStart,
  onVoiceCancel,
  onVoiceFinish,
  value,
  voiceDurationMillis = 0,
  voiceLevel = 0,
  voiceStatus = "idle",
}: {
  busy: boolean;
  inputRef: React.RefObject<TextInput | null>;
  onChange: (value: string) => void;
  onSend: () => void;
  onVoiceStart?: () => void;
  onVoiceCancel?: () => void;
  onVoiceFinish?: () => void;
  value: string;
  voiceDurationMillis?: number;
  voiceLevel?: number;
  voiceStatus?: "idle" | "starting" | "recording" | "transcribing";
}) {
  const canSend = value.trim().length > 0 && !busy;
  const recording = voiceStatus === "recording";
  const voiceWorking = voiceStatus === "starting" || voiceStatus === "transcribing";
  const voiceEnabled = !busy && !voiceWorking;
  return (
    <View style={styles.composerStack}>
      {recording ? (
        <VoiceRecordingPanel
          durationMillis={voiceDurationMillis}
          level={voiceLevel}
          onCancel={() => onVoiceCancel?.()}
          onFinish={() => onVoiceFinish?.()}
        />
      ) : null}
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Frage an Ordilo"
          accessibilityState={{ disabled: recording || voiceWorking }}
          autoCapitalize="sentences"
          editable={!recording && !voiceWorking}
          multiline
          onChangeText={onChange}
          onSubmitEditing={canSend ? onSend : undefined}
          placeholder="Frage Ordilo …"
          placeholderTextColor={colors.mistDark}
          ref={inputRef}
          returnKeyType="send"
          style={styles.composerInput}
          value={value}
        />
        <View style={styles.composerActions}>
          <Pressable
            accessibilityHint={
              recording
                ? "Beendet die Aufnahme"
                : "Tippe, um eine Sprachfrage aufzunehmen"
            }
            accessibilityLabel={
              voiceStatus === "transcribing"
                ? "Sprache wird in Text umgewandelt"
                : recording
                  ? "Aufnahme beenden"
                  : "Sprachfrage aufnehmen"
            }
            accessibilityRole="button"
            accessibilityState={{ disabled: !voiceEnabled }}
            disabled={!voiceEnabled}
            hitSlop={4}
            onPress={recording ? onVoiceFinish : onVoiceStart}
            style={({ pressed }) => [
              styles.voiceButton,
              recording && styles.voiceButtonRecording,
              pressed && styles.pressed,
              !voiceEnabled && styles.composerSendDisabled,
            ]}
          >
            {voiceWorking ? (
              <ActivityIndicator color={colors.warmWhite} size="small" />
            ) : recording ? (
              <Square color={colors.warmWhite} fill={colors.warmWhite} size={15} />
            ) : (
              <Mic color={colors.warmWhite} size={19} strokeWidth={2.2} />
            )}
          </Pressable>
          {canSend ? (
            <Pressable
              accessibilityLabel="Frage senden"
              accessibilityRole="button"
              disabled={recording}
              onPress={onSend}
              style={({ pressed }) => [
                styles.composerSend,
                recording && styles.composerSendDisabled,
                pressed && styles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.warmWhite} size="small" />
              ) : (
                <Send color={colors.warmWhite} size={18} strokeWidth={2} />
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function formatVoiceDuration(durationMillis: number): string {
  const seconds = Math.max(0, Math.floor(durationMillis / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  statusLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 28,
    paddingHorizontal: spacing.xs,
  },
  statusText: { color: colors.mistDark, ...typography.timestamp },
  bubbleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubbleAvatar: {
    alignItems: "center",
    backgroundColor: colors.washSageSoft,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: "center",
    marginTop: 2,
    width: 40,
  },
  bubble: {
    borderRadius: radii.sm,
    gap: spacing.sm,
    maxWidth: "82%",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  bubbleUser: {
    backgroundColor: colors.harborBlue,
    borderBottomRightRadius: 4,
  },
  bubbleAi: {
    backgroundColor: colors.warmWhite,
    borderBottomLeftRadius: 4,
    borderColor: colors.mistLight,
    borderWidth: 1,
    shadowColor: colors.graphite,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  bubbleText: { color: colors.graphite, ...typography.body },
  bubbleTextUser: { color: colors.warmWhite },
  bubbleTime: {
    alignSelf: "flex-start",
    color: colors.mistDark,
    ...typography.label,
  },
  bubbleTimeUser: {
    alignSelf: "flex-end",
    color: colors.warmWhite,
  },
  sources: { gap: spacing.xs, marginTop: spacing.xs },
  sourcesHeading: { color: colors.mistDark, ...typography.label },
  sourceCard: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sourceCopy: { flex: 1, gap: 1, minWidth: 0 },
  sourceTitle: { color: colors.graphite, ...typography.label },
  sourceExcerpt: { color: colors.mistDark, ...typography.label },
  sourcesToggle: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 44,
  },
  sourcesToggleText: { color: colors.harborBlue, ...typography.label },
  answerCard: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.xs,
    padding: 12,
  },
  answerTitle: { color: colors.graphite, ...typography.title },
  answerSubtitle: { color: colors.mistDark, ...typography.timestamp },
  answerField: {
    borderTopColor: colors.mistLight,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  answerFieldLabel: { color: colors.mistDark, minWidth: 92, ...typography.label },
  answerFieldValue: { color: colors.graphite, flex: 1, ...typography.timestamp },
  cardLink: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 44,
  },
  cardLinkText: { color: colors.harborBlue, ...typography.title },
  secretHint: { color: colors.mistDark, ...typography.label },
  actionCard: {
    backgroundColor: colors.sandWarm,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.xs,
    padding: 12,
  },
  actionCardMuted: { opacity: 0.7 },
  actionCardResolved: { backgroundColor: colors.sand, borderColor: "rgba(48, 84, 96, 0.3)" },
  actionCardError: { borderColor: colors.destructive },
  actionHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  actionIcon: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderRadius: radii.sm,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  actionHeaderCopy: { flex: 1, gap: 1, minWidth: 0 },
  actionEyebrow: { color: colors.mistDark, ...typography.label },
  actionTitle: { color: colors.graphite, ...typography.title },
  actionDismiss: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  actionHint: { color: colors.mistDark, ...typography.label },
  actionButtons: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  actionWorking: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  actionWorkingText: { color: colors.mistDark, ...typography.timestamp },
  actionError: { color: colors.destructive, ...typography.timestamp },
  undoButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 44,
  },
  undoText: { color: colors.harborBlue, ...typography.label },
  feedback: { gap: spacing.xs, marginTop: spacing.xs },
  feedbackRow: { flexDirection: "row", gap: spacing.xs },
  feedbackButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  feedbackThanks: { color: colors.mistDark, ...typography.label },
  feedbackPanel: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: spacing.sm,
    padding: 12,
  },
  feedbackPanelTitle: { color: colors.graphite, ...typography.title },
  feedbackChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  feedbackChip: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.pill,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  feedbackChipSelected: {
    backgroundColor: colors.harborBlue,
    borderColor: colors.harborBlue,
  },
  feedbackChipText: { color: colors.mistDark, ...typography.label },
  feedbackChipTextSelected: { color: colors.warmWhite },
  feedbackComment: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.base,
    borderWidth: 1,
    color: colors.graphite,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingTop: spacing.sm,
    textAlignVertical: "top",
    ...typography.body,
  },
  composerStack: { gap: spacing.xs },
  composer: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    elevation: 2,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xs,
    shadowColor: colors.graphite,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  composerInput: {
    color: colors.graphite,
    flex: 1,
    maxHeight: 96,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    textAlignVertical: "center",
    ...typography.body,
  },
  composerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
  },
  composerSend: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  composerSendDisabled: { opacity: 0.4 },
  voiceButton: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  voiceButtonRecording: {
    backgroundColor: colors.warmApricot,
  },
  voicePanel: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  voicePanelHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  voicePanelStatus: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  voiceRecordingDot: {
    backgroundColor: colors.warmApricot,
    borderRadius: radii.pill,
    height: 8,
    width: 8,
  },
  voicePanelTitle: { color: colors.graphite, ...typography.title },
  voiceDuration: { color: colors.mistDark, ...typography.timestamp },
  voiceInstruction: {
    color: colors.mistDark,
    textAlign: "center",
    ...typography.label,
  },
  voicePanelActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "flex-end",
  },
  voicePanelSecondaryAction: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  voicePanelSecondaryText: { color: colors.mistDark, ...typography.label },
  voicePanelPrimaryAction: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderRadius: radii.sm,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  voicePanelPrimaryText: { color: colors.warmWhite, ...typography.label },
  voiceWave: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    height: 32,
    justifyContent: "center",
  },
  voiceBar: {
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    height: 24,
    width: 3,
  },
  pressed: { opacity: 0.76 },
});
