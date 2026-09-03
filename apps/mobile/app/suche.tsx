import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import {
  ChevronDown,
  ChevronRight,
  History,
  MessageCircle,
  Plus,
  Trash2,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ActionCardView,
  AnswerCardView,
  ChatComposer,
  ChatThinkingState,
  FeedbackRow,
  MessageBubble,
  SourcesSection,
} from "@/src/components/chat";
import { ConfirmDialog } from "@/src/components/confirm-dialog";
import { OrdiloChatHero } from "@/src/components/ordilo-chat-hero";
import { OrdiloMark } from "@/src/components/ordilo-mark";
import {
  OrdiloSheet,
  OrdiloSheetHeader,
  type OrdiloSheetHandle,
} from "@/src/components/sheet";
import {
  IconButton,
  IconTile,
  ListGroup,
  ListRow,
  OrdiloButton,
  Screen,
  SectionHeader,
} from "@/src/components/ui";
import {
  applyChatEvent,
  buildChatHistory,
  buildMarkTaskDoneUndo,
  CHAT_ERROR_MESSAGE,
  CHAT_RATE_LIMIT_MESSAGE,
  confirmChatAction,
  getActionContent,
  sendChatFeedback,
  streamChat,
  type ChatAction,
  type ChatFeedbackReason,
  type ChatMessage,
} from "@/src/lib/chat";
import {
  buildSuggestedPrompts,
  deleteConversation,
  formatConversationWhen,
  getConversationTitle,
  listConversations,
  loadConversationMessages,
  type ConversationSummary,
} from "@/src/lib/conversations";
import { useFamily } from "@/src/lib/family-context";
import { tap } from "@/src/lib/feedback";
import { getSupabase } from "@/src/lib/supabase";
import { fetchFamilyMembers, type FamilyMemberOption } from "@/src/lib/tasks";
import {
  removeVoiceRecording,
  transcribeVoiceRecording,
  VoiceInputError,
} from "@/src/lib/voice";
import { contentEntering } from "@/src/theme/motion";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const CHAT_ANSWER_ENTERING = contentEntering();

/**
 * „Ordilo fragen" — the chat with Ordilo. Streams the answer token by
 * token, shows searched sources and proposed actions with explicit
 * confirmation, and mirrors the German copy of the web (suche page).
 * Conversation history lives on the server once a conversation_id
 * arrives; opening a past conversation is a later step.
 */

/** streamChat throws plain Errors carrying an HTTP status field. */
function httpStatusOf(error: unknown): number {
  if (typeof error !== "object" || error === null) return 0;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : 0;
}

const MAX_VOICE_RECORDING_MILLIS = 2 * 60 * 1_000;
const VOICE_AUTO_STOP_MILLIS = MAX_VOICE_RECORDING_MILLIS - 1_000;

type VoiceStatus = "idle" | "starting" | "recording" | "transcribing";

export default function SucheScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { family } = useFamily();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState(() => (typeof q === "string" ? q : ""));
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [members, setMembers] = useState<FamilyMemberOption[]>([]);
  const [recentDocumentTitle, setRecentDocumentTitle] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<ConversationSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const historySheetRef = useRef<OrdiloSheetHandle>(null);
  const pendingHistoryRef = useRef<ConversationSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [composerHeight, setComposerHeight] = useState(0);

  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const counter = useRef(0);
  const lastQuestion = useRef<string | null>(null);
  const voiceIntent = useRef(false);
  const voiceStatusRef = useRef<VoiceStatus>("idle");
  const transcriptionAbortController = useRef<AbortController | null>(null);
  const autoStoppingVoice = useRef(false);
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder);

  useEffect(() => {
    voiceStatusRef.current = voiceStatus;
  }, [voiceStatus]);

  // Who the family is and what arrived last make the first suggestions
  // real; past conversations make coming back possible.
  const refreshConversations = useCallback(async () => {
    if (!family) return;
    try {
      setConversations(await listConversations(family.id));
    } catch {
      // The list is a convenience; a failed read leaves the empty state calm.
    }
  }, [family]);

  useEffect(() => {
    if (!family) return;
    let cancelled = false;
    void fetchFamilyMembers(family.id)
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .catch(() => undefined);
    void (async () => {
      try {
        const { data } = await getSupabase()
          .from("documents")
          .select("title")
          .eq("family_id", family.id)
          .eq("status", "confirmed")
          .not("title", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled && data && typeof data.title === "string") {
          setRecentDocumentTitle(data.title);
        }
      } catch {
        // The suggestion falls back to a general question.
      }
    })();
    void Promise.resolve().then(() => refreshConversations());
    return () => {
      cancelled = true;
    };
  }, [family, refreshConversations]);

  const suggestions = useMemo(
    () => buildSuggestedPrompts({ members, recentDocumentTitle }),
    [members, recentDocumentTitle],
  );
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === conversationId) ?? null,
    [conversations, conversationId],
  );

  const openConversation = useCallback(async (conversation: ConversationSummary) => {
    if (busy) return;
    setHistoryLoading(conversation.id);
    try {
      const restored = await loadConversationMessages(conversation.id);
      setMessages(restored);
      setConversationId(conversation.id);
      setInput("");
      lastQuestion.current = null;
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setHistoryLoading(null);
    }
  }, [busy]);

  const chooseHistory = useCallback((conversation: ConversationSummary) => {
    pendingHistoryRef.current = conversation;
    historySheetRef.current?.dismiss();
  }, []);

  const finishHistoryChoice = useCallback(() => {
    const conversation = pendingHistoryRef.current;
    pendingHistoryRef.current = null;
    if (conversation) void openConversation(conversation);
  }, [openConversation]);

  const removeConversation = useCallback(async () => {
    if (!deleteCandidate) return;
    setDeleting(true);
    try {
      await deleteConversation(deleteCandidate.id);
      setConversations((current) =>
        current.filter((conversation) => conversation.id !== deleteCandidate.id),
      );
      if (conversationId === deleteCandidate.id) {
        setMessages([]);
        setConversationId(null);
      }
      setDeleteCandidate(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setDeleting(false);
    }
  }, [conversationId, deleteCandidate]);

  const nextId = useCallback((prefix: string) => {
    counter.current += 1;
    return `${prefix}-${counter.current}`;
  }, []);

  const updateMessage = useCallback(
    (id: string, updater: (message: ChatMessage) => ChatMessage) => {
      setMessages((current) =>
        current.map((message) => (message.id === id ? updater(message) : message)),
      );
    },
    [],
  );

  const updateAction = useCallback(
    (messageId: string, actionId: string, updater: (action: ChatAction) => ChatAction) => {
      updateMessage(messageId, (message) => ({
        ...message,
        actions: message.actions.map((action) =>
          action.id === actionId ? updater(action) : action,
        ),
      }));
    },
    [updateMessage],
  );

  const createAssistantMessage = useCallback((): ChatMessage => {
    return {
      id: nextId("assistant"),
      createdAt: new Date().toISOString(),
      dbId: null,
      role: "assistant",
      text: "",
      card: null,
      sources: [],
      actions: [],
      toolCalls: [],
      status: "streaming",
      feedback: null,
    };
  }, [nextId]);

  /** Streams one answer into the given assistant bubble. Owns busy state. */
  const runStream = useCallback(
    async (
      question: string,
      assistantMessage: ChatMessage,
      history: { role: "user" | "assistant"; content: string }[],
    ) => {
      if (!family) return;
      lastQuestion.current = question;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setBusy(true);

      try {
        await streamChat(
          {
            familyId: family.id,
            message: question,
            conversationId,
            history,
          },
          (event) => {
            if (event.type === "conversation") {
              setConversationId(event.conversationId);
              return;
            }
            updateMessage(assistantMessage.id, (message) =>
              applyChatEvent(message, event),
            );
            if (event.type === "done") {
              void Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
              void refreshConversations();
            }
          },
        );
        // The stream may end without a terminal event (dropped connection).
        updateMessage(assistantMessage.id, (message) => {
          if (message.status !== "streaming") return message;
          return message.text.trim()
            ? { ...message, status: "done" }
            : { ...message, text: CHAT_ERROR_MESSAGE, status: "error" };
        });
      } catch (error) {
        const status = httpStatusOf(error);
        updateMessage(assistantMessage.id, (message) => ({
          ...message,
          text: status === 429 ? CHAT_RATE_LIMIT_MESSAGE : CHAT_ERROR_MESSAGE,
          status: status === 429 ? "rate_limited" : "error",
        }));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setBusy(false);
      }
    },
    [conversationId, family, refreshConversations, updateMessage],
  );

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || busy || !family) return;

      const userMessage: ChatMessage = {
        id: nextId("user"),
        createdAt: new Date().toISOString(),
        dbId: null,
        role: "user",
        text: trimmed,
        card: null,
        sources: [],
        actions: [],
        toolCalls: [],
        status: "done",
        feedback: null,
      };
      const assistantMessage = createAssistantMessage();

      const history = buildChatHistory(messages);
      setMessages((current) => [...current, userMessage, assistantMessage]);
      setInput("");
      await runStream(trimmed, assistantMessage, history);
    },
    [busy, createAssistantMessage, family, messages, nextId, runStream],
  );

  /**
   * „Nochmal fragen": replaces only the failed assistant bubble. The
   * original user bubble stays — the retry must not duplicate the turn
   * in the UI or send the same question twice in the history.
   */
  const retry = useCallback(
    (failedMessageId: string) => {
      if (busy || !family) return;
      const index = messages.findIndex((message) => message.id === failedMessageId);
      if (index < 0) return;
      const userMessage = [...messages.slice(0, index)]
        .reverse()
        .find((message) => message.role === "user");
      if (!userMessage) return;

      const history = buildChatHistory(
        messages.filter(
          (message) =>
            message.id !== failedMessageId && message.id !== userMessage.id,
        ),
      );
      const assistantMessage = createAssistantMessage();
      setMessages((current) => [
        ...current.filter((message) => message.id !== failedMessageId),
        assistantMessage,
      ]);
      void runStream(userMessage.text, assistantMessage, history);
    },
    [busy, createAssistantMessage, family, messages, runStream],
  );

  const confirmAction = useCallback(
    async (messageId: string, action: ChatAction) => {
      if (!family) return;
      updateAction(messageId, action.id, (current) => ({
        ...current,
        state: "confirming",
        error: undefined,
        errorOperation: undefined,
      }));
      try {
        const response = await confirmChatAction(family.id, action);
        if (!response.success) {
          throw new Error(response.error ?? "Aktion fehlgeschlagen");
        }
        const undo = buildMarkTaskDoneUndo(action, response.result);
        updateAction(messageId, action.id, (current) => ({
          ...current,
          state: "confirmed",
          undo,
        }));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        updateAction(messageId, action.id, (current) => ({
          ...current,
          state: "error",
          error: "Das hat nicht geklappt. Bitte versuch es nochmal.",
          errorOperation: "confirm",
        }));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [family, updateAction],
  );

  const undoAction = useCallback(
    async (messageId: string, action: ChatAction) => {
      if (!family || !action.undo) return;
      updateAction(messageId, action.id, (current) => ({
        ...current,
        state: "undoing",
        error: undefined,
        errorOperation: undefined,
      }));
      try {
        const response = await confirmChatAction(family.id, {
          id: action.undo.id,
          toolName: action.undo.toolName,
          args: action.undo.args,
        });
        if (!response.success) {
          throw new Error(response.error ?? "Undo fehlgeschlagen");
        }
        updateAction(messageId, action.id, (current) => ({
          ...current,
          state: "undone",
        }));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        updateAction(messageId, action.id, (current) => ({
          ...current,
          state: "error",
          error: "Rückgängig machen hat nicht geklappt.",
          errorOperation: "undo",
        }));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [family, updateAction],
  );

  const sendFeedback = useCallback(
    async (
      message: ChatMessage,
      feedback: "positive" | "negative",
      reasons: ChatFeedbackReason[],
      comment: string,
    ) => {
      if (!family || !message.dbId) return;
      // sendChatFeedback throws a German ApiError on failure.
      await sendChatFeedback({
        messageId: message.dbId,
        feedback,
        reasons: feedback === "negative" ? reasons : undefined,
        comment: feedback === "negative" && comment.trim() ? comment.trim() : undefined,
      });
      updateMessage(message.id, (current) => ({
        ...current,
        feedback,
      }));
    },
    [family, updateMessage],
  );

  const startNewChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setInput("");
    lastQuestion.current = null;
    inputRef.current?.focus();
  }, []);

  const adjustAction = useCallback(
    (action: ChatAction) => {
      const content = getActionContent(action);
      setInput(`Vorschlag von Ordilo: ${content.title} — bitte ändere: `);
      inputRef.current?.focus();
    },
    [],
  );

  const openDocument = useCallback(
    (documentId: string) => {
      router.push(`/document/${documentId}`);
    },
    [router],
  );

  const openContact = useCallback(
    (contactId: string) => {
      router.push(`/contacts/${contactId}`);
    },
    [router],
  );

  const resetVoiceUi = useCallback(() => {
    voiceStatusRef.current = "idle";
    setVoiceStatus("idle");
    autoStoppingVoice.current = false;
  }, []);

  const discardVoiceRecording = useCallback(
    async (options: { feedback?: boolean; resetUi?: boolean } = {}) => {
      const { feedback = true, resetUi = true } = options;
      voiceIntent.current = false;
      transcriptionAbortController.current?.abort();
      transcriptionAbortController.current = null;
      try {
        await recorder.stop();
      } catch {
        // The recorder may not have started or iOS may have stopped it already.
      } finally {
        removeVoiceRecording(recorder.uri);
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
        if (resetUi) resetVoiceUi();
        if (feedback) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          void AccessibilityInfo.announceForAccessibility("Aufnahme verworfen.");
        }
      }
    },
    [recorder, resetVoiceUi],
  );

  const finishVoice = useCallback(
    async (reachedDurationLimit = false) => {
      if (voiceStatusRef.current === "starting") {
        await discardVoiceRecording({ feedback: false });
        return;
      }
      if (voiceStatusRef.current !== "recording") return;
      voiceIntent.current = false;
      voiceStatusRef.current = "transcribing";
      setVoiceStatus("transcribing");
      if (reachedDurationLimit) {
        setVoiceError("Die Aufnahme ist nach zwei Minuten beendet worden.");
      }
      let uri: string | null = null;
      try {
        const finalDurationMillis = Math.round(recorder.currentTime * 1_000);
        await recorder.stop();
        uri = recorder.uri;
        if (!uri || !family) {
          throw new VoiceInputError("Keine Aufnahme vorhanden.");
        }
        if (finalDurationMillis < 500) {
          throw new VoiceInputError(
            "Die Aufnahme war zu kurz. Halte das Mikrofon etwas länger.",
          );
        }

        void AccessibilityInfo.announceForAccessibility(
          "Aufnahme beendet. Sprache wird in Text umgewandelt.",
        );
        const controller = new AbortController();
        transcriptionAbortController.current = controller;
        const transcript = await transcribeVoiceRecording({
          familyId: family.id,
          signal: controller.signal,
          uri,
        });
        if (transcript) {
          setInput((current) => (current ? `${current} ${transcript}` : transcript));
          inputRef.current?.focus();
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          void AccessibilityInfo.announceForAccessibility(
            "Text eingefügt. Du kannst ihn jetzt prüfen und senden.",
          );
        } else {
          setVoiceError("Ich konnte nichts hören. Bitte versuch es nochmal.");
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setVoiceError(
          error instanceof VoiceInputError
            ? error.message
            : "Die Spracheingabe hat nicht geklappt.",
        );
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        void AccessibilityInfo.announceForAccessibility(
          "Die Spracheingabe hat nicht geklappt.",
        );
      } finally {
        transcriptionAbortController.current = null;
        removeVoiceRecording(uri ?? recorder.uri);
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
        resetVoiceUi();
      }
    },
    [
      family,
      recorder,
      discardVoiceRecording,
      resetVoiceUi,
    ],
  );

  const startVoice = useCallback(async () => {
    if (busy || voiceStatusRef.current !== "idle") return;
    setVoiceError(null);
    voiceIntent.current = true;
    voiceStatusRef.current = "starting";
    setVoiceStatus("starting");
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!voiceIntent.current) return;
    if (!permission.granted) {
      setVoiceError("Bitte erlaube Ordilo den Zugriff auf dein Mikrofon.");
      resetVoiceUi();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      void AccessibilityInfo.announceForAccessibility(
        "Kein Zugriff auf das Mikrofon.",
      );
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (!voiceIntent.current) return;
      await recorder.prepareToRecordAsync();
      if (!voiceIntent.current) return;
      recorder.record();
      // Press-out can arrive before React commits the state update. Keep the
      // imperative guard in sync with the native recorder immediately.
      voiceStatusRef.current = "recording";
      setVoiceStatus("recording");
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      void AccessibilityInfo.announceForAccessibility("Aufnahme läuft.");
    } catch {
      await discardVoiceRecording({ feedback: false });
      setVoiceError("Die Aufnahme konnte nicht gestartet werden.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [busy, discardVoiceRecording, recorder, resetVoiceUi]);

  useEffect(() => {
    if (
      voiceStatus === "recording" &&
      recorderState.durationMillis >= VOICE_AUTO_STOP_MILLIS &&
      !autoStoppingVoice.current
    ) {
      autoStoppingVoice.current = true;
      const timeout = setTimeout(() => {
        void finishVoice(true);
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [finishVoice, recorderState.durationMillis, voiceStatus]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" && voiceStatusRef.current !== "idle") {
        void discardVoiceRecording();
      }
    });
    return () => {
      subscription.remove();
      if (voiceStatusRef.current !== "idle") {
        void discardVoiceRecording({ feedback: false, resetUi: false });
      }
    };
  }, [discardVoiceRecording]);

  return (
    // suche is a native modal, so the root BottomSheetModalProvider's
    // portal renders underneath it. The history sheet needs a host of
    // its own inside the modal to appear on top.
    <GestureHandlerRootView style={styles.flex}>
      <BottomSheetModalProvider>
        <Screen style={styles.screen}>
          <View style={styles.topbar}>
            <Pressable
              accessibilityLabel="Schließen"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => router.back()}
              style={styles.back}
            >
              <ChevronDown color={colors.graphite} size={24} />
            </Pressable>
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={styles.topAvatar}
            >
              <OrdiloMark size={32} />
            </View>
            <View style={styles.topCopy}>
              <Text numberOfLines={1} style={styles.topTitle}>
                {activeConversation ? getConversationTitle(activeConversation) : "Ordilo fragen"}
              </Text>
              {activeConversation ? (
                <Text numberOfLines={1} style={styles.topSubtitle}>
                  {formatConversationWhen(activeConversation.updatedAt)}
                </Text>
              ) : null}
            </View>
            {conversations.length > 0 ? (
              <IconButton
                accessibilityHint="Zeigt frühere Gespräche"
                accessibilityLabel="Verlauf"
                icon={History}
                onPress={() => historySheetRef.current?.present()}
                tone="plain"
              />
            ) : null}
            <IconButton
              accessibilityHint="Beginnt ein neues Gespräch"
              accessibilityLabel="Neues Gespräch"
              disabled={busy || messages.length === 0}
              icon={Plus}
              onPress={startNewChat}
              tone="quiet"
            />
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.flex}
          >
            <ScrollView
              contentContainerStyle={[
                styles.content,
                { paddingBottom: composerHeight + spacing.md },
              ]}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              // Auto-scroll is for conversations: the empty welcome state
              // starts at the top so the hero and heading stay fully visible
              // on short screens instead of being scrolled past.
              onContentSizeChange={() => {
                if (messages.length > 0) {
                  scrollRef.current?.scrollToEnd({ animated: true });
                }
              }}
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
            >
              {messages.length === 0 ? (
                <View style={styles.empty}>
                  <OrdiloChatHero />
                  <View style={styles.welcomeCopy}>
                    <Text style={styles.emptyHeading}>Was möchtest du wissen?</Text>
                    <Text style={styles.emptyText}>
                      Ordilo kennt eure Dokumente, Termine und Aufgaben und
                      antwortet mit Quelle.
                    </Text>
                  </View>
                  <View style={styles.suggestions}>
                    {suggestions.map((prompt) => (
                      <Pressable
                        accessibilityHint="Stellt diese Frage an Ordilo"
                        accessibilityLabel={prompt}
                        accessibilityRole="button"
                        disabled={busy}
                        key={prompt}
                        onPress={() => {
                          tap();
                          void send(prompt);
                        }}
                        style={({ pressed }) => [
                          styles.suggestion,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.suggestionText}>{prompt}</Text>
                        <ChevronRight color={colors.mist} size={18} strokeWidth={2} />
                      </Pressable>
                    ))}
                  </View>
                  {conversations.length > 0 ? (
                    <View style={styles.recentBlock}>
                      <SectionHeader
                        action={
                          conversations.length > 3
                            ? {
                                label: "Alle",
                                onPress: () => historySheetRef.current?.present(),
                                accessibilityLabel: "Alle Gespräche anzeigen",
                              }
                            : undefined
                        }
                        title="Zuletzt gefragt"
                      />
                      <ListGroup>
                        {conversations.slice(0, 3).map((conversation, index) => (
                          <ListRow
                            accessibilityHint="Öffnet das frühere Gespräch"
                            chevron
                            first={index === 0}
                            key={conversation.id}
                            leading={
                              <IconTile tint={colors.washSageSoft}>
                                {historyLoading === conversation.id ? (
                                  <ActivityIndicator color={colors.harborBlue} size="small" />
                                ) : (
                                  <MessageCircle color={colors.harborBlue} size={19} strokeWidth={1.9} />
                                )}
                              </IconTile>
                            }
                            onPress={() => void openConversation(conversation)}
                            subtitle={formatConversationWhen(conversation.updatedAt)}
                            title={getConversationTitle(conversation)}
                          />
                        ))}
                      </ListGroup>
                    </View>
                  ) : null}
                </View>
              ) : (
                <>
                  <View style={styles.dayDivider}>
                    <Text style={styles.dayDividerText}>
                      {activeConversation
                        ? formatConversationWhen(activeConversation.createdAt)
                        : "Heute"}
                    </Text>
                  </View>
                  {messages.map((message) =>
                    message.role === "user" ? (
                      <MessageBubble key={message.id} message={message} />
                    ) : (
                      <View key={message.id} style={styles.assistantBlock}>
                        {message.status === "streaming" &&
                        !message.text &&
                        message.actions.length === 0 ? (
                          <ChatThinkingState toolCalls={message.toolCalls} />
                        ) : (
                          <Animated.View entering={CHAT_ANSWER_ENTERING}>
                            <MessageBubble message={message}>
                              {message.card && message.status === "done" ? (
                                <AnswerCardView
                                  card={message.card}
                                  onOpenContact={openContact}
                                  onOpenDocument={openDocument}
                                />
                              ) : null}
                              {message.sources.length > 0 &&
                              message.status === "done" ? (
                                <SourcesSection
                                  onOpenDocument={openDocument}
                                  sources={message.sources}
                                />
                              ) : null}
                              {message.actions.map((action) => (
                                <ActionCardView
                                  action={action}
                                  key={action.id}
                                  onAdjust={() => adjustAction(action)}
                                  onConfirm={() =>
                                    void confirmAction(message.id, action)
                                  }
                                  onDismiss={() =>
                                    updateAction(
                                      message.id,
                                      action.id,
                                      (current) => ({
                                        ...current,
                                        state: "dismissed",
                                      }),
                                    )
                                  }
                                  onUndo={() => void undoAction(message.id, action)}
                                />
                              ))}
                              {message.status === "done" && message.dbId ? (
                                <FeedbackRow
                                  message={message}
                                  onSend={(feedback, reasons, comment) =>
                                    sendFeedback(
                                      message,
                                      feedback,
                                      reasons,
                                      comment,
                                    )
                                  }
                                />
                              ) : null}
                              {message.status === "error" ? (
                                <OrdiloButton
                                  onPress={() => retry(message.id)}
                                  title="Nochmal fragen"
                                  variant="outline"
                                />
                              ) : null}
                            </MessageBubble>
                          </Animated.View>
                        )}
                      </View>
                    ),
                  )}
                </>
              )}
            </ScrollView>

            <View
              onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}
              style={[
                styles.composerSafeArea,
                { paddingBottom: Math.max(insets.bottom, spacing.sm) },
              ]}
            >
              {voiceError ? (
                <Text accessibilityRole="alert" style={styles.voiceError}>
                  {voiceError}
                </Text>
              ) : null}
              <ChatComposer
                busy={busy}
                inputRef={inputRef}
                onChange={setInput}
                onSend={() => void send(input)}
                onVoiceStart={() => void startVoice()}
                onVoiceCancel={() => void discardVoiceRecording()}
                onVoiceFinish={() => void finishVoice()}
                value={input}
                voiceDurationMillis={recorderState.durationMillis}
                voiceLevel={Math.max(0, Math.min(1, ((recorderState.metering ?? -60) + 60) / 60))}
                voiceStatus={voiceStatus}
              />
            </View>
          </KeyboardAvoidingView>

          <OrdiloSheet
            accessibilityLabel="Frühere Gespräche"
            contentContainerStyle={styles.historySheet}
            detached
            onDismiss={finishHistoryChoice}
            ref={historySheetRef}
          >
            <OrdiloSheetHeader
              subtitle="Ordilo merkt sich, worüber ihr gesprochen habt."
              title="Frühere Gespräche"
            />
            <ListGroup style={styles.historyList}>
              {conversations.map((conversation, index) => (
                <ListRow
                  accessibilityHint="Öffnet das Gespräch"
                  first={index === 0}
                  key={conversation.id}
                  leading={
                    <IconTile tint={colors.washSageSoft}>
                      <MessageCircle color={colors.harborBlue} size={19} strokeWidth={1.9} />
                    </IconTile>
                  }
                  onPress={() => chooseHistory(conversation)}
                  subtitle={formatConversationWhen(conversation.updatedAt)}
                  title={getConversationTitle(conversation)}
                  trailing={
                    <Pressable
                      accessibilityLabel={`${getConversationTitle(conversation)} löschen`}
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => {
                        historySheetRef.current?.dismiss();
                        setDeleteCandidate(conversation);
                      }}
                      style={styles.historyDelete}
                    >
                      <Trash2 color={colors.mistDark} size={18} strokeWidth={1.9} />
                    </Pressable>
                  }
                />
              ))}
            </ListGroup>
          </OrdiloSheet>

          <ConfirmDialog
            confirmLabel="Löschen"
            loading={deleting}
            loadingLabel="Wird gelöscht …"
            message="Das Gespräch wird für die ganze Familie gelöscht. Eure Dokumente bleiben unberührt."
            onCancel={() => setDeleteCandidate(null)}
            onConfirm={() => void removeConversation()}
            title="Gespräch löschen?"
            visible={deleteCandidate !== null}
          />
        </Screen>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  topbar: {
    alignItems: "center",
    borderBottomColor: colors.mistLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 64,
    paddingBottom: spacing.xs,
    paddingHorizontal: 0,
  },
  back: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  topCopy: { flex: 1, gap: 1, minWidth: 0 },
  topTitle: { color: colors.graphite, ...typography.display },
  topSubtitle: { color: colors.mistDark, ...typography.label },
  topAvatar: {
    alignItems: "center",
    backgroundColor: colors.washSageSoft,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  content: {
    flexGrow: 1,
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: 0,
  },
  assistantBlock: { gap: spacing.xs },
  dayDivider: {
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  dayDividerText: {
    backgroundColor: colors.sand,
    borderRadius: radii.pill,
    color: colors.mistDark,
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    ...typography.label,
  },
  empty: {
    alignItems: "center",
    flexGrow: 1,
    paddingBottom: spacing.lg,
  },
  welcomeCopy: {
    alignItems: "center",
    gap: spacing.sm,
    marginTop: -spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  emptyHeading: {
    ...typography.display,
    color: colors.harborBlueDarker,
    fontSize: 20,
    lineHeight: 26,
    textAlign: "center",
  },
  emptyText: {
    color: colors.mistDark,
    maxWidth: 310,
    textAlign: "center",
    ...typography.timestamp,
  },
  suggestions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
    width: "100%",
  },
  suggestion: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  suggestionText: { color: colors.graphite, flex: 1, ...typography.body },
  recentBlock: {
    gap: spacing.sm,
    marginTop: spacing.xl,
    width: "100%",
  },
  historySheet: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  historyList: { backgroundColor: colors.warmWhite },
  historyDelete: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  composerSafeArea: {
    backgroundColor: colors.warmWhite,
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  voiceError: { color: colors.destructive, ...typography.label },
  pressed: { opacity: 0.76 },
});
