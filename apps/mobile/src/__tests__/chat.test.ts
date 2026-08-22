import {
  applyChatEvent,
  buildChatHistory,
  buildMarkTaskDoneUndo,
  formatChatDate,
  getActionContent,
  getToolStepLabel,
  mergeConfirmationProposal,
  parseChatStreamEvent,
  splitNdjsonChunk,
  type ChatMessage,
} from "../lib/chat";

const baseMessage: ChatMessage = {
  id: "ai-1",
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

describe("NDJSON chunk splitting", () => {
  it("splits complete lines and keeps the incomplete tail", () => {
    const first = splitNdjsonChunk("", '{"type":"text","content":"Hal');
    expect(first.lines).toEqual([]);
    expect(first.rest).toBe('{"type":"text","content":"Hal');

    const second = splitNdjsonChunk(
      first.rest,
      'lo"}\n{"type":"done"}\n{"type":"sou',
    );
    expect(second.lines).toEqual([
      '{"type":"text","content":"Hallo"}',
      '{"type":"done"}',
    ]);
    expect(second.rest).toBe('{"type":"sou');
  });

  it("skips blank lines", () => {
    const { lines } = splitNdjsonChunk("", '{"type":"done"}\n\n  \n');
    expect(lines).toEqual(['{"type":"done"}']);
  });
});

describe("chat stream event parsing", () => {
  it("parses every wire event into the typed shape", () => {
    expect(
      parseChatStreamEvent({ type: "conversation", conversation_id: "c1" }),
    ).toEqual({ type: "conversation", conversationId: "c1" });
    expect(
      parseChatStreamEvent({ type: "tool", tool: "search_documents", state: "start" }),
    ).toEqual({ type: "tool", toolName: "search_documents", state: "start" });
    expect(parseChatStreamEvent({ type: "text", content: "Hi" })).toEqual({
      type: "text",
      content: "Hi",
    });
    expect(parseChatStreamEvent({ type: "replace", content: "Neu" })).toEqual({
      type: "replace",
      content: "Neu",
    });
    expect(parseChatStreamEvent({ type: "done" })).toEqual({ type: "done" });
    expect(
      parseChatStreamEvent({ type: "message_saved", message_id: "m-9" }),
    ).toEqual({ type: "message_saved", messageId: "m-9" });
    expect(
      parseChatStreamEvent({ type: "error", error: "Kaputt", code: "CHAT_FAILED" }),
    ).toEqual({ type: "error", error: "Kaputt", code: "CHAT_FAILED" });
  });

  it("builds a confirmation action with merged preview fields", () => {
    const event = parseChatStreamEvent({
      type: "confirmation_request",
      tool_name: "add_task",
      action_id: "a-1",
      action_args: { title: "Elternabend vormerken" },
      needs_confirmation: true,
      message: "Soll ich?",
      task_title: "Elternabend vormerken",
      due_date: "2026-09-01",
    });
    expect(event).toEqual({
      type: "confirmation",
      action: {
        id: "a-1",
        toolName: "add_task",
        state: "ready",
        args: {
          title: "Elternabend vormerken",
          task_title: "Elternabend vormerken",
          due_date: "2026-09-01",
        },
      },
    });
  });

  it("rejects malformed or unknown events instead of crashing", () => {
    expect(parseChatStreamEvent(null)).toBeNull();
    expect(parseChatStreamEvent({ type: "text" })).toBeNull();
    expect(parseChatStreamEvent({ type: "tool", tool: "x", state: "wat" })).toBeNull();
    expect(
      parseChatStreamEvent({
        type: "confirmation_request",
        tool_name: "drop_database",
        action_id: "a-1",
      }),
    ).toBeNull();
    expect(parseChatStreamEvent({ type: "brand_new_event", x: 1 })).toBeNull();
  });

  it("mergeConfirmationProposal mirrors the web meta-key split", () => {
    expect(
      mergeConfirmationProposal({
        type: "confirmation_request",
        tool_name: "add_task",
        action_args: { title: "A" },
        action_id: "x",
        needs_confirmation: true,
        message: "m",
        due_date: "2026-09-01",
      }),
    ).toEqual({ title: "A", due_date: "2026-09-01" });
    expect(mergeConfirmationProposal({ type: "confirmation_request" })).toEqual(
      {},
    );
  });
});

describe("chat message reducer", () => {
  it("appends text, replaces on guardrail correction and finishes", () => {
    let message = applyChatEvent(baseMessage, { type: "text", content: "Hal" });
    message = applyChatEvent(message, { type: "text", content: "lo" });
    expect(message.text).toBe("Hallo");

    message = applyChatEvent(message, { type: "replace", content: "Korrigiert" });
    expect(message.text).toBe("Korrigiert");

    message = applyChatEvent(message, { type: "done" });
    expect(message.status).toBe("done");
  });

  it("tracks tool progress, sources, actions and the persisted id", () => {
    let message = applyChatEvent(baseMessage, {
      type: "tool",
      toolName: "search_documents",
      state: "start",
    });
    message = applyChatEvent(message, {
      type: "tool",
      toolName: "search_documents",
      state: "done",
    });
    expect(message.toolCalls).toEqual([
      { toolName: "search_documents", state: "done" },
    ]);

    message = applyChatEvent(message, {
      type: "sources",
      sources: [
        { document_id: "d1", title: "Stromrechnung", excerpt: "…", score: 0.9 },
      ],
    });
    expect(message.sources).toHaveLength(1);

    message = applyChatEvent(message, {
      type: "confirmation",
      action: { id: "a-1", toolName: "add_task", args: {}, state: "ready" },
    });
    expect(message.actions.map((action) => action.id)).toEqual(["a-1"]);

    message = applyChatEvent(message, { type: "message_saved", messageId: "m-1" });
    expect(message.dbId).toBe("m-1");
  });

  it("marks stream errors on the message", () => {
    const message = applyChatEvent(baseMessage, {
      type: "error",
      error: "Da ist was schiefgegangen. Bitte frag nochmal.",
      code: "CHAT_FAILED",
    });
    expect(message.status).toBe("error");
  });
});

describe("chat history for follow-up questions", () => {
  it("appends source titles to assistant answers like the web client", () => {
    const history = buildChatHistory([
      {
        ...baseMessage,
        id: "user-1",
        role: "user",
        text: "Was steht in der Stromrechnung?",
        status: "done",
      },
      {
        ...baseMessage,
        text: "Der Abschlag beträgt 80 Euro.",
        status: "done",
        sources: [
          { document_id: "d1", title: "Stromrechnung Juli", excerpt: "", score: 0.8 },
        ],
      },
      { ...baseMessage, id: "ai-2", text: "läuft", status: "streaming" },
    ]);
    expect(history).toEqual([
      { role: "user", content: "Was steht in der Stromrechnung?" },
      {
        role: "assistant",
        content: "Der Abschlag beträgt 80 Euro.\n\n[Gefundene Dokumente: Stromrechnung Juli]",
      },
    ]);
  });
});

describe("action card content (ported from the web)", () => {
  it("renders a task proposal with German date and assignee", () => {
    const content = getActionContent({
      id: "a-1",
      toolName: "add_task",
      args: { title: "Elternabend vormerken", due_date: "2026-09-01", assignee_name: "Emma" },
      state: "ready",
    });
    expect(content.eyebrow).toBe("Aufgabe vorbereiten");
    expect(content.title).toBe("Elternabend vormerken");
    expect(content.details).toEqual([
      { label: "Frist", value: "01.09.2026" },
      { label: "Für", value: "Emma" },
    ]);
  });

  it("formats calendar events and credentials notes", () => {
    const event = getActionContent({
      id: "a-2",
      toolName: "add_calendar_event",
      args: { title: "Kita-Fest", starts_on: "2026-09-03", starts_time: "15:00" },
      state: "ready",
    });
    expect(event.details).toEqual([
      { label: "Wann", value: "03.09.2026" },
      { label: "Uhrzeit", value: "15:00" },
    ]);

    const note = getActionContent({
      id: "a-3",
      toolName: "create_note",
      args: { document_type: "credentials", url: "https://stadtwerke.de" },
      state: "ready",
    });
    expect(note.eyebrow).toBe("Zugangsdaten anlegen");
    expect(note.title).toBe("Neue Zugangsdaten");
    expect(note.details).toEqual([{ label: "URL", value: "https://stadtwerke.de" }]);
  });

  it("falls back to generic German titles", () => {
    expect(
      getActionContent({ id: "a-4", toolName: "mark_task_done", args: {}, state: "ready" }).title,
    ).toBe("Aufgabe erledigen");
    expect(getToolStepLabel("search_documents")).toBe("Durchsucht deine Dokumente");
    expect(getToolStepLabel("unknown_tool")).toBe("Arbeitet");
  });
});

describe("undo for confirmed actions", () => {
  it("builds the mark_task_done inverse via update_task", () => {
    const undo = buildMarkTaskDoneUndo(
      { id: "a-1", toolName: "mark_task_done", args: {}, state: "confirmed" },
      { task_id: "t-7" },
    );
    expect(undo).toEqual({
      id: "a-1-undo",
      toolName: "update_task",
      args: { task_id: "t-7", status: "open" },
    });
  });

  it("refuses undo for other tools or missing task ids", () => {
    expect(
      buildMarkTaskDoneUndo(
        { id: "a-2", toolName: "add_task", args: {}, state: "confirmed" },
        { task_id: "t-7" },
      ),
    ).toBeUndefined();
    expect(
      buildMarkTaskDoneUndo(
        { id: "a-3", toolName: "mark_task_done", args: {}, state: "confirmed" },
        {},
      ),
    ).toBeUndefined();
  });
});

describe("German date formatting", () => {
  it("formats ISO dates and rejects garbage", () => {
    expect(formatChatDate("2026-09-01")).toBe("01.09.2026");
    expect(formatChatDate("2026-09-01T18:00:00")).toBe("01.09.2026");
    expect(formatChatDate("nächste Woche")).toBeNull();
    expect(formatChatDate(null)).toBeNull();
  });
});
