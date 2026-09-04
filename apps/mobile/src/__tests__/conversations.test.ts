import {
  formatConversationWhen,
  getConversationTitle,
  loadConversationMessages,
  rowToChatMessage,
} from "../lib/conversations";
import { buildPersonalChatPrompts } from "@ordilo/chat-contract";
import { getSupabase } from "../lib/supabase";

jest.mock("../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../lib/supabase", () => ({ getSupabase: jest.fn() }));

describe("conversations", () => {
  it("restores a persisted assistant message with sources, card and ready actions", () => {
    const message = rowToChatMessage({
      id: "m1",
      role: "assistant",
      content: "Der Elternabend ist am 8. September.",
      sources: [
        { document_id: "d1", title: "Elternbrief", excerpt: "…", score: 0.8 },
        { nonsense: true },
      ],
      card: {
        type: "termin",
        title: "Elternabend",
        subtitle: null,
        fields: [{ label: "Wann", value: "08.09.2026" }, { broken: 1 }],
        actionDocumentId: "d1",
        hasSecret: false,
      },
      actions: [
        { action_id: "a1", tool_name: "add_calendar_event", action_args: { title: "Elternabend" } },
        { action_id: "a2", tool_name: "delete_everything", action_args: {} },
      ],
      feedback: "positive",
      response_state: "partial",
      suggestion: {
        label: "Weiter suchen",
        prompt: "Suche in weiteren Unterlagen.",
      },
      created_at: "2026-09-01T10:00:00Z",
    });
    expect(message).toMatchObject({
      id: "db-m1",
      dbId: "m1",
      status: "done",
      feedback: "positive",
      sources: [{ document_id: "d1", title: "Elternbrief", score: 0.8 }],
      card: { type: "termin", title: "Elternabend", fields: [{ label: "Wann", value: "08.09.2026" }] },
      actions: [{ id: "a1", toolName: "add_calendar_event", state: "ready" }],
      responseState: "partial",
      suggestion: {
        label: "Weiter suchen",
        prompt: "Suche in weiteren Unterlagen.",
      },
    });
  });

  it("keeps a plain user message plain", () => {
    const message = rowToChatMessage({
      id: "m2",
      role: "user",
      content: "Wann ist der Elternabend?",
      sources: null,
      card: null,
      actions: null,
      feedback: null,
      created_at: "2026-09-01T10:00:00Z",
    });
    expect(message).toMatchObject({ role: "user", card: null, sources: [], actions: [] });
  });

  it("labels conversations by day", () => {
    const now = new Date(2026, 8, 2, 12);
    expect(formatConversationWhen("2026-09-02T08:00:00", now)).toBe("Heute");
    expect(formatConversationWhen("2026-09-01T23:00:00", now)).toBe("Gestern");
    expect(formatConversationWhen("2026-08-24T09:00:00", now)).toBe("Mo., 24. Aug.");
    expect(getConversationTitle({ title: "  " })).toBe("Gespräch");
    expect(getConversationTitle({ title: "Elternabend" })).toBe("Elternabend");
  });

  it("writes suggestions with the family's names", () => {
    const prompts = buildPersonalChatPrompts({
      members: [
        { name: "Christian Müller", role: "Vater" },
        { name: "Emma Müller", role: "Tochter" },
      ],
      recentDocumentTitle: "Elternbrief Sportfest",
    });
    expect(prompts).toEqual([
      "Was muss ich bei „Elternbrief Sportfest“ beachten?",
      "Was steht für Emma als Nächstes an?",
      "Was ist diese Woche für uns wichtig?",
    ]);
    expect(
      buildPersonalChatPrompts({
        members: [{ name: "Max", role: "Sohn" }],
      }),
    ).toEqual([
      "Was steht für Max als Nächstes an?",
      "Was ist diese Woche für uns wichtig?",
      "Erkläre mir den Unterschied zwischen Garantie und Gewährleistung.",
    ]);
    expect(buildPersonalChatPrompts({ members: [] })).toEqual([
      "Was ist diese Woche für uns wichtig?",
      "Erkläre mir den Unterschied zwischen Garantie und Gewährleistung.",
      "Welche Änderungen gibt es aktuell beim Deutschlandticket?",
    ]);
  });
});

describe("loadConversationMessages", () => {
  it("reads the newest page and hands it back oldest-first", async () => {
    const order = jest.fn();
    const query: Record<string, jest.Mock> = {};
    for (const method of ["select", "eq"]) query[method] = jest.fn(() => query);
    query.order = order.mockImplementation(() => query);
    query.limit = jest.fn(async () => ({
      data: [
        { id: "m3", role: "user", content: "Und danach?", sources: null, card: null, actions: null, created_at: "2026-09-01T12:00:00Z" },
        { id: "m2", role: "assistant", content: "Am 8. September.", sources: null, card: null, actions: null, created_at: "2026-09-01T11:00:00Z" },
      ],
      error: null,
    }));
    (getSupabase as jest.Mock).mockReturnValue({ from: jest.fn(() => query) });

    const messages = await loadConversationMessages("c1", 2);

    // Newest first from the database, so a long conversation reopens on its
    // most recent turns — then reversed for display.
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(messages.map((message) => message.dbId)).toEqual(["m2", "m3"]);
  });
});
