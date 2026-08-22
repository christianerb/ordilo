import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowLeft, MessageCircleQuestion, Plus } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  ActionCardView,
  AnswerCardView,
  ChatComposer,
  ChatStatusLine,
  FeedbackRow,
  MessageBubble,
  SourcesSection,
} from "@/src/components/chat";
import { OrdiloButton, Screen } from "@/src/components/ui";
import {
  applyChatEvent,
  buildChatHistory,
  buildMarkTaskDoneUndo,
  CHAT_ERROR_MESSAGE,
  CHAT_EXAMPLE_PROMPTS,
  CHAT_RATE_LIMIT_MESSAGE,
  confirmChatAction,
  getActionContent,
  sendChatFeedback,
  streamChat,
  type ChatAction,
  type ChatFeedbackReason,
  type ChatMessage,
} from "@/src/lib/chat";
import { useFamily } from "@/src/lib/family-context";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

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

export default function SucheScreen() {
  const router = useRouter();
  const { family } = useFamily();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const counter = useRef(0);
  const lastQuestion = useRef<string | null>(null);

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

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || busy || !family) return;

      lastQuestion.current = trimmed;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const userMessage: ChatMessage = {
        id: nextId("user"),
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
      const assistantMessage: ChatMessage = {
        id: nextId("assistant"),
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

      const history = buildChatHistory(messages);
      setMessages((current) => [...current, userMessage, assistantMessage]);
      setInput("");
      setBusy(true);

      try {
        await streamChat(
          {
            familyId: family.id,
            message: trimmed,
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
    [busy, conversationId, family, messages, nextId, updateMessage],
  );

  const retry = useCallback(
    (failedMessageId: string) => {
      const question = lastQuestion.current;
      if (!question) return;
      setMessages((current) =>
        current.filter((message) => message.id !== failedMessageId),
      );
      void send(question);
    },
    [send],
  );

  const confirmAction = useCallback(
    async (messageId: string, action: ChatAction) => {
      if (!family) return;
      updateAction(messageId, action.id, (current) => ({
        ...current,
        state: "confirming",
        error: undefined,
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

  return (
    <Screen style={styles.screen}>
      <View style={styles.topbar}>
        <Pressable
          accessibilityLabel="Zurück"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.back}
        >
          <ArrowLeft color={colors.graphite} size={22} />
        </Pressable>
        <Text style={styles.topTitle}>Ordilo fragen</Text>
        <Pressable
          accessibilityHint="Verwirft den aktuellen Verlauf"
          accessibilityLabel="Neuer Chat"
          accessibilityRole="button"
          disabled={busy || messages.length === 0}
          hitSlop={8}
          onPress={startNewChat}
          style={({ pressed }) => [
            styles.newChat,
            (busy || messages.length === 0) && styles.newChatDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Plus color={colors.harborBlue} size={20} strokeWidth={2} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <MessageCircleQuestion
                  color={colors.mist}
                  size={36}
                  strokeWidth={1.5}
                />
              </View>
              <Text style={styles.emptyHeading}>Wie kann ich dir helfen?</Text>
              <Text style={styles.emptyText}>
                Frag mich zu deinen Dokumenten, Terminen oder Aufgaben. Ich
                kenne alles, was du gescannt hast.
              </Text>
              <View style={styles.examples}>
                {CHAT_EXAMPLE_PROMPTS.map((prompt) => (
                  <Pressable
                    accessibilityHint="Stellt diese Frage an Ordilo"
                    accessibilityLabel={prompt}
                    accessibilityRole="button"
                    disabled={busy}
                    key={prompt}
                    onPress={() => void send(prompt)}
                    style={({ pressed }) => [
                      styles.exampleChip,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.exampleChipText}>{prompt}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            messages.map((message) =>
              message.role === "user" ? (
                <MessageBubble key={message.id} message={message} />
              ) : (
                <View key={message.id} style={styles.assistantBlock}>
                  {message.status === "streaming" ? (
                    <ChatStatusLine
                      hasText={message.text.length > 0}
                      toolCalls={message.toolCalls}
                    />
                  ) : null}
                  <MessageBubble message={message}>
                    {message.card && message.status === "done" ? (
                      <AnswerCardView
                        card={message.card}
                        onOpenContact={openContact}
                        onOpenDocument={openDocument}
                      />
                    ) : null}
                    {message.sources.length > 0 && message.status === "done" ? (
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
                        onConfirm={() => void confirmAction(message.id, action)}
                        onDismiss={() =>
                          updateAction(message.id, action.id, (current) => ({
                            ...current,
                            state: "dismissed",
                          }))
                        }
                        onUndo={() => void undoAction(message.id, action)}
                      />
                    ))}
                    {message.status === "done" && message.dbId ? (
                      <FeedbackRow
                        message={message}
                        onSend={(feedback, reasons, comment) =>
                          sendFeedback(message, feedback, reasons, comment)
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
                </View>
              ),
            )
          )}
        </ScrollView>

        <ChatComposer
          busy={busy}
          inputRef={inputRef}
          onChange={setInput}
          onSend={() => void send(input)}
          value={input}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  topbar: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  back: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  topTitle: { color: colors.graphite, flex: 1, ...typography.display },
  newChat: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  newChatDisabled: { opacity: 0.4 },
  content: {
    flexGrow: 1,
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  assistantBlock: { gap: spacing.xs },
  empty: {
    alignItems: "center",
    flexGrow: 1,
    gap: spacing.md,
    justifyContent: "center",
    padding: spacing.lg,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: colors.sandLight,
    borderRadius: radii.pill,
    height: 80,
    justifyContent: "center",
    width: 80,
  },
  emptyHeading: { color: colors.graphite, textAlign: "center", ...typography.display },
  emptyText: {
    color: colors.mistDark,
    maxWidth: 300,
    textAlign: "center",
    ...typography.timestamp,
  },
  examples: { gap: spacing.sm, marginTop: spacing.sm, width: "100%" },
  exampleChip: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  exampleChipText: { color: colors.graphite, ...typography.body },
  pressed: { opacity: 0.76 },
});
