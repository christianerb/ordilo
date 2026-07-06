import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";

// Mock next/navigation useRouter
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock the AISearchBar so we can control it more easily in integration tests
// Actually, we'll use the real AISearchBar for better integration coverage.

import { SucheClient } from "@/app/(app)/suche/suche-client";
import type { SucheClientProps } from "@/app/(app)/suche/suche-client";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const familyId = "fam-123";

const members = [
  { id: "m1", name: "Emma" },
  { id: "m2", name: "Hanna" },
  { id: "m3", name: "Christian" },
];

const documents = [
  {
    id: "doc-1",
    title: "Stromrechnung Juli",
    category: "Rechnungen",
    document_type: "invoice",
    persons: ["Emma"],
  },
  {
    id: "doc-2",
    title: "Kita-Brief für Emma",
    category: "Schule",
    document_type: "letter",
    persons: ["Emma"],
  },
  {
    id: "doc-3",
    title: "Arztbrief Hanna",
    category: "Gesundheit",
    document_type: "medical",
    persons: ["Hanna"],
  },
];

const defaultProps: SucheClientProps = {
  familyId,
  familyName: "Testfamilie",
  members,
  documents,
};

// ---------------------------------------------------------------------------
// Mock fetch for /api/chat
// ---------------------------------------------------------------------------

function mockChatResponse(
  answer: string,
  sources: Array<{
    document_id: string;
    title: string | null;
    excerpt: string;
    score: number;
  }>,
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ answer, sources }),
  } as Response;
}

const originalFetch = global.fetch;

beforeEach(() => {
  mockPush.mockClear();
  // Mock scrollIntoView (not implemented in jsdom)
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SucheClient — Empty State", () => {
  it("renders the AI search bar on initial load", () => {
    render(<SucheClient {...defaultProps} />);
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("shows the four example queries in the empty state", () => {
    render(<SucheClient {...defaultProps} />);
    expect(
      screen.getByText("Zeig mir alle Dokumente von Emma"),
    ).toBeDefined();
    expect(
      screen.getByText("Welche Fristen laufen bald ab?"),
    ).toBeDefined();
    expect(
      screen.getByText("Finde die letzte Stromrechnung"),
    ).toBeDefined();
    expect(
      screen.getByText("Was muss ich diese Woche erledigen?"),
    ).toBeDefined();
  });

  it("shows a warm German welcome heading in the empty state", () => {
    render(<SucheClient {...defaultProps} />);
    // Should have a warm German heading
    const heading = screen.getByRole("heading");
    expect(heading.textContent).toMatch(/finden|suchen|frage|ordilo/i);
  });
});

describe("SucheClient — Chat Interaction", () => {
  it("populates the search bar and submits the example query (VAL-SEARCH-021)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      mockChatResponse("Ich finde dazu kein Dokument.", []),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    // Click the first example query (VAL-SEARCH-021: clicking an example
    // populates the search bar AND submits it, rendering the user message
    // bubble and an AI answer).
    fireEvent.click(screen.getByText("Zeig mir alle Dokumente von Emma"));

    // The search bar should be populated with the example query.
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.value).toBe("Zeig mir alle Dokumente von Emma");

    // A chat submission should have occurred: fetch was called with the
    // example query as the message body.
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "Zeig mir alle Dokumente von Emma",
          family_id: familyId,
        }),
      }),
    );

    // The user message bubble should be rendered.
    await waitFor(() => {
      expect(screen.getByText("Ich finde dazu kein Dokument.")).toBeDefined();
    });

    // The empty state should no longer be shown — the chat conversation
    // has replaced it.
    expect(screen.queryByTestId("suche-empty-state")).toBeNull();
  });

  it("shows AI answer bubble after response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockChatResponse("Hier ist deine Antwort.", [
        {
          document_id: "doc-1",
          title: "Stromrechnung",
          excerpt: "Rechnung über 45€",
          score: 0.9,
        },
      ]),
    ) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    // Submit a query via the search bar
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Finde Rechnung" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText("Hier ist deine Antwort.")).toBeDefined();
    });
  });

  it("shows source cards under AI answers with sources", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockChatResponse("Antwort mit Quellen.", [
        {
          document_id: "doc-1",
          title: "Stromrechnung Juli",
          excerpt: "Rechnung über 45€",
          score: 0.85,
        },
        {
          document_id: "doc-2",
          title: "Kita-Brief",
          excerpt: "Einschulung",
          score: 0.72,
        },
      ]),
    ) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Zeig Dokumente" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText("Stromrechnung Juli")).toBeDefined();
      expect(screen.getByText("Kita-Brief")).toBeDefined();
    });
  });

  it("does not show source cards when sources is empty (no results)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockChatResponse("Ich finde dazu kein Dokument.", []),
    ) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Nichtexistent" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText("Ich finde dazu kein Dokument.")).toBeDefined();
    });

    // No source cards should be present
    expect(screen.queryAllByTestId("source-card")).toHaveLength(0);
  });

  it("shows a loading indicator while awaiting response", async () => {
    // Create a controlled promise so we can check the loading state
    let resolveChat: (value: Response) => void = () => {};
    const chatPromise = new Promise<Response>((resolve) => {
      resolveChat = resolve;
    });
    global.fetch = vi.fn().mockReturnValue(chatPromise) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Test" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    // Loading indicator should be visible
    await waitFor(() => {
      expect(screen.getByTestId("chat-loading-indicator")).toBeDefined();
    });

    // Resolve the chat promise
    await act(async () => {
      resolveChat(
        mockChatResponse("Antwort.", [
          {
            document_id: "doc-1",
            title: "Test",
            excerpt: "Test",
            score: 0.5,
          },
        ]),
      );
      await chatPromise;
    });

    // Loading indicator should be gone
    await waitFor(() => {
      expect(screen.queryByTestId("chat-loading-indicator")).toBeNull();
    });
  });

  it("preserves chat history across multiple messages", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          mockChatResponse("Erste Antwort.", [
            { document_id: "doc-1", title: "Dok1", excerpt: "A", score: 0.8 },
          ]),
        );
      }
      return Promise.resolve(
        mockChatResponse("Zweite Antwort.", [
          { document_id: "doc-2", title: "Dok2", excerpt: "B", score: 0.7 },
        ]),
      );
    }) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    // First message
    let input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Erste Frage" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText("Erste Antwort.")).toBeDefined();
    });

    // Second message
    input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Zweite Frage" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText("Zweite Antwort.")).toBeDefined();
    });

    // Both user messages should still be visible
    expect(screen.getByText("Erste Frage")).toBeDefined();
    expect(screen.getByText("Zweite Frage")).toBeDefined();
    // Both AI answers should still be visible
    expect(screen.getByText("Erste Antwort.")).toBeDefined();
    expect(screen.getByText("Zweite Antwort.")).toBeDefined();
  });

  it("submits via the send button", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockChatResponse("Button Antwort.", []),
    ) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Button Test" } });
    fireEvent.click(screen.getByRole("button", { name: /senden/i }));

    await waitFor(() => {
      expect(screen.getByText("Button Antwort.")).toBeDefined();
    });
  });

  it("shows a German error message when the chat API fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Chat fehlgeschlagen", code: "CHAT_FAILED" }),
    } as Response) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Fehler Test" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      // Should show a friendly German error, not a raw stack trace
      expect(screen.getByText(/fehlgeschlagen|fehler/i)).toBeDefined();
    });
  });
});

describe("SucheClient — Filter Chips", () => {
  it("does not render filter chips before any results exist", () => {
    render(<SucheClient {...defaultProps} />);
    expect(screen.queryByTestId("filter-chips")).toBeNull();
  });

  it("does not render filter chips before results even when family documents exist", () => {
    render(
      <SucheClient
        {...defaultProps}
        documents={documents}
        members={members}
      />,
    );
    expect(screen.queryByTestId("filter-chips")).toBeNull();
  });

  it("renders person filter chips derived from the current result set", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockChatResponse("Antwort.", [
        { document_id: "doc-1", title: "Stromrechnung Juli", excerpt: "A", score: 0.8 },
        { document_id: "doc-2", title: "Kita-Brief für Emma", excerpt: "B", score: 0.7 },
        { document_id: "doc-3", title: "Arztbrief Hanna", excerpt: "C", score: 0.6 },
      ]),
    ) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Alle" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByTestId("filter-chips")).toBeDefined();
    });

    // Only members appearing in the result documents get chips.
    expect(screen.getByRole("button", { name: /^Emma$/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Hanna$/ })).toBeDefined();
    // Christian is a family member but appears in no result document.
    expect(screen.queryByRole("button", { name: /^Christian$/ })).toBeNull();
  });

  it("renders category filter chips derived from the current result set", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockChatResponse("Antwort.", [
        { document_id: "doc-1", title: "Stromrechnung Juli", excerpt: "A", score: 0.8 },
        { document_id: "doc-2", title: "Kita-Brief für Emma", excerpt: "B", score: 0.7 },
        { document_id: "doc-3", title: "Arztbrief Hanna", excerpt: "C", score: 0.6 },
      ]),
    ) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Alle" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByTestId("filter-chips")).toBeDefined();
    });

    expect(screen.getByText("Rechnungen")).toBeDefined();
    expect(screen.getByText("Schule")).toBeDefined();
    expect(screen.getByText("Gesundheit")).toBeDefined();
  });

  it("renders document type filter chips in German derived from the result set", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockChatResponse("Antwort.", [
        { document_id: "doc-1", title: "Stromrechnung Juli", excerpt: "A", score: 0.8 },
        { document_id: "doc-2", title: "Kita-Brief für Emma", excerpt: "B", score: 0.7 },
        { document_id: "doc-3", title: "Arztbrief Hanna", excerpt: "C", score: 0.6 },
      ]),
    ) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Alle" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByTestId("filter-chips")).toBeDefined();
    });

    // invoice → Rechnung, letter → Brief, medical → Arztbrief
    expect(screen.getByText("Rechnung")).toBeDefined();
    expect(screen.getByText("Brief")).toBeDefined();
    expect(screen.getByText("Arztbrief")).toBeDefined();
  });

  it("filters source cards by person when a person chip is activated", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockChatResponse("Antwort.", [
        { document_id: "doc-1", title: "Stromrechnung Juli", excerpt: "A", score: 0.8 },
        { document_id: "doc-2", title: "Kita-Brief für Emma", excerpt: "B", score: 0.7 },
        { document_id: "doc-3", title: "Arztbrief Hanna", excerpt: "C", score: 0.6 },
      ]),
    ) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    // Submit a query to get results
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Alle" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText("Stromrechnung Juli")).toBeDefined();
    });

    // All three source cards visible
    expect(screen.getAllByTestId("source-card")).toHaveLength(3);

    // Activate the "Hanna" person filter
    // Find the filter chip for Hanna — it should be a button/chip
    const hannaChip = screen.getByRole("button", { name: /^Hanna$/ });
    fireEvent.click(hannaChip);

    // Only doc-3 (Hanna) should be visible
    await waitFor(() => {
      expect(screen.getAllByTestId("source-card")).toHaveLength(1);
      expect(screen.getByText("Arztbrief Hanna")).toBeDefined();
    });
  });

  it("can clear a filter chip by clicking it again", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockChatResponse("Antwort.", [
        { document_id: "doc-1", title: "Stromrechnung Juli", excerpt: "A", score: 0.8 },
        { document_id: "doc-3", title: "Arztbrief Hanna", excerpt: "C", score: 0.6 },
      ]),
    ) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Alle" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getAllByTestId("source-card")).toHaveLength(2);
    });

    // Activate Hanna filter
    fireEvent.click(screen.getByRole("button", { name: /^Hanna$/ }));

    await waitFor(() => {
      expect(screen.getAllByTestId("source-card")).toHaveLength(1);
    });

    // Deactivate Hanna filter (click again)
    fireEvent.click(screen.getByRole("button", { name: /^Hanna$/ }));

    await waitFor(() => {
      expect(screen.getAllByTestId("source-card")).toHaveLength(2);
    });
  });

  it("does not render empty filter chips when result documents have no category", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockChatResponse("Antwort.", [
        { document_id: "doc-nocat", title: "Ohne Kategorie", excerpt: "X", score: 0.5 },
      ]),
    ) as unknown as typeof fetch;

    render(
      <SucheClient
        {...defaultProps}
        documents={[
          { id: "doc-nocat", title: "Ohne Kategorie", category: null, document_type: "other", persons: [] },
        ]}
        members={[{ id: "m1", name: "Emma" }]}
      />,
    );

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Test" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByTestId("filter-chips")).toBeDefined();
    });

    // The doc-type chip "Sonstiges" should appear (document_type: "other"),
    // but no empty/blank chip may be rendered for the null category, and no
    // person chip should appear (the result doc has no persons).
    expect(screen.getByText("Sonstiges")).toBeDefined();
    const filterChipsContainer = screen.getByTestId("filter-chips");
    const chipButtons = within(filterChipsContainer).getAllByRole("button");
    for (const btn of chipButtons) {
      expect(btn.textContent?.trim().length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole("button", { name: /^Emma$/ })).toBeNull();
  });
});

describe("SucheClient — Result-Aware Filter Chips (VAL-SEARCH-032)", () => {
  it("person chips only list members appearing in the current result set, not the full family", async () => {
    // Result set: only doc-3 (Hanna). Emma and Christian are family members
    // (and Emma appears in other family documents), but neither appears in
    // this result set → no chip for them.
    global.fetch = vi.fn().mockResolvedValue(
      mockChatResponse("Antwort.", [
        { document_id: "doc-3", title: "Arztbrief Hanna", excerpt: "C", score: 0.6 },
      ]),
    ) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Hanna" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByTestId("filter-chips")).toBeDefined();
    });

    expect(screen.getByRole("button", { name: /^Hanna$/ })).toBeDefined();
    expect(screen.queryByRole("button", { name: /^Emma$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Christian$/ })).toBeNull();
  });

  it("category/type chips only reflect values present in the current result set", async () => {
    // Result set: only doc-1 (category "Rechnungen", type "invoice").
    // The family has other categories/types, but they are not in this
    // result set → no chips for them.
    global.fetch = vi.fn().mockResolvedValue(
      mockChatResponse("Antwort.", [
        { document_id: "doc-1", title: "Stromrechnung Juli", excerpt: "A", score: 0.8 },
      ]),
    ) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Rechnung" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByTestId("filter-chips")).toBeDefined();
    });

    // Only the result doc's category/type should produce chips.
    expect(screen.getByRole("button", { name: /^Rechnungen$/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Rechnung$/ })).toBeDefined();
    // Categories/types from docs NOT in the result set must not appear.
    expect(screen.queryByRole("button", { name: /^Schule$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Gesundheit$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Brief$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Arztbrief$/ })).toBeNull();
  });

  it("hides filter chips again when the latest query returns no sources", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          mockChatResponse("Antwort.", [
            { document_id: "doc-1", title: "Stromrechnung Juli", excerpt: "A", score: 0.8 },
          ]),
        );
      }
      return Promise.resolve(
        mockChatResponse("Ich finde dazu kein Dokument.", []),
      );
    }) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    let input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Emma" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    // First query returns a result → chips appear.
    await waitFor(() => {
      expect(screen.getByTestId("filter-chips")).toBeDefined();
    });

    input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Nichts" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    // Second query returns no sources → no current result set → no chips.
    await waitFor(() => {
      expect(screen.queryByTestId("filter-chips")).toBeNull();
    });
  });
});

describe("SucheClient — Stale Filter Reconciliation (m4 scrutiny round 2)", () => {
  it("drops stale filters referencing facets absent from a new result set so new source cards are not hidden", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First search: returns all three docs (Emma + Hanna).
        return Promise.resolve(
          mockChatResponse("Antwort 1.", [
            { document_id: "doc-1", title: "Stromrechnung Juli", excerpt: "A", score: 0.8 },
            { document_id: "doc-2", title: "Kita-Brief für Emma", excerpt: "B", score: 0.7 },
            { document_id: "doc-3", title: "Arztbrief Hanna", excerpt: "C", score: 0.6 },
          ]),
        );
      }
      // Second search: returns only Emma docs (Hanna facet absent).
      return Promise.resolve(
        mockChatResponse("Antwort 2.", [
          { document_id: "doc-1", title: "Stromrechnung Juli", excerpt: "A", score: 0.85 },
          { document_id: "doc-2", title: "Kita-Brief für Emma", excerpt: "B", score: 0.75 },
        ]),
      );
    }) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    // First search → all three docs returned, filter chips appear.
    let input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Alle" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByTestId("filter-chips")).toBeDefined();
    });

    // Activate the "Hanna" person filter → only doc-3 visible.
    fireEvent.click(screen.getByRole("button", { name: /^Hanna$/ }));

    await waitFor(() => {
      expect(screen.getAllByTestId("source-card")).toHaveLength(1);
      expect(screen.getByText("Arztbrief Hanna")).toBeDefined();
    });

    // Second search → only Emma docs returned (Hanna facet absent).
    input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Emma" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    // The stale Hanna filter must be reconciled away so the new Emma
    // source cards are NOT hidden. Without reconciliation, the stale
    // Hanna filter would hide both new Emma source cards (bug).
    await waitFor(() => {
      // New Emma source cards are visible after the second search.
      expect(screen.queryAllByText("Stromrechnung Juli").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("Kita-Brief für Emma").length).toBeGreaterThan(0);
    });

    // The Hanna chip is no longer present (result-aware chips) and the
    // active Hanna filter has been dropped by reconciliation, so no
    // "Zurücksetzen" button should remain.
    expect(screen.queryByRole("button", { name: /^Hanna$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Zurücksetzen/i })).toBeNull();
  });

  it("keeps filters still present in the new result set applied", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          mockChatResponse("Antwort 1.", [
            { document_id: "doc-1", title: "Stromrechnung Juli", excerpt: "A", score: 0.8 },
            { document_id: "doc-2", title: "Kita-Brief für Emma", excerpt: "B", score: 0.7 },
            { document_id: "doc-3", title: "Arztbrief Hanna", excerpt: "C", score: 0.6 },
          ]),
        );
      }
      // Second search: Emma still present (doc-1, doc-2) alongside Hanna.
      return Promise.resolve(
        mockChatResponse("Antwort 2.", [
          { document_id: "doc-1", title: "Stromrechnung Juli", excerpt: "A", score: 0.85 },
          { document_id: "doc-2", title: "Kita-Brief für Emma", excerpt: "B", score: 0.75 },
          { document_id: "doc-3", title: "Arztbrief Hanna", excerpt: "C", score: 0.65 },
        ]),
      );
    }) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    let input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Alle" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByTestId("filter-chips")).toBeDefined();
    });

    // Activate the "Emma" person filter → only Emma docs visible (doc-1, doc-2).
    fireEvent.click(screen.getByRole("button", { name: /^Emma$/ }));

    await waitFor(() => {
      expect(screen.getAllByTestId("source-card")).toHaveLength(2);
    });

    // Second search → Emma still present in the result set. The Emma
    // filter must REMAIN applied (not cleared by reconciliation), so
    // doc-3 (Hanna) stays hidden in the new message.
    input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Nochmal" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText("Antwort 2.")).toBeDefined();
    });

    // The Emma chip should still be active (pressed).
    const emmaChip = screen.getByRole("button", { name: /^Emma$/ });
    expect(emmaChip.getAttribute("aria-pressed")).toBe("true");

    // Arztbrief Hanna (doc-3) must remain hidden by the still-active Emma filter.
    expect(screen.queryAllByText("Arztbrief Hanna").length).toBe(0);

    // Zurücksetzen should still be present (the Emma filter remains active).
    expect(screen.getByRole("button", { name: /Zurücksetzen/i })).toBeDefined();
  });

  it("clears all active filters when a subsequent search returns no sources", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          mockChatResponse("Antwort 1.", [
            { document_id: "doc-1", title: "Stromrechnung Juli", excerpt: "A", score: 0.8 },
            { document_id: "doc-3", title: "Arztbrief Hanna", excerpt: "C", score: 0.6 },
          ]),
        );
      }
      if (callCount === 2) {
        // Second search: no sources → no result set, no facets.
        return Promise.resolve(
          mockChatResponse("Ich finde dazu kein Dokument.", []),
        );
      }
      // Third search: Hanna doc returns. If the stale Hanna filter had been
      // left active, the Hanna chip would render pressed after this search.
      return Promise.resolve(
        mockChatResponse("Antwort 3.", [
          { document_id: "doc-3", title: "Arztbrief Hanna", excerpt: "C", score: 0.6 },
        ]),
      );
    }) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    let input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Hanna" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByTestId("filter-chips")).toBeDefined();
    });

    // Activate the Hanna filter.
    fireEvent.click(screen.getByRole("button", { name: /^Hanna$/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Zurücksetzen/i })).toBeDefined();
    });

    // Second search → no sources. The stale Hanna filter must be cleared
    // (no facets to match against), and no chips / Zurücksetzen remain.
    input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Nichts" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.queryByTestId("filter-chips")).toBeNull();
    });
    expect(screen.queryByRole("button", { name: /Zurücksetzen/i })).toBeNull();

    // Third search → Hanna doc returns. The Hanna chip must NOT be pressed,
    // proving the stale filter was actually cleared from state (not just
    // visually hidden). Without reconciliation the chip would still be pressed.
    input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Hanna2" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByTestId("filter-chips")).toBeDefined();
    });
    const hannaChipAfter = screen.getByRole("button", { name: /^Hanna$/ });
    expect(hannaChipAfter.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("button", { name: /Zurücksetzen/i })).toBeNull();
  });
});

describe("SucheClient — No Internal Terminology", () => {
  it("does not expose 'Knowledge Graph' in the UI", () => {
    const { container } = render(<SucheClient {...defaultProps} />);
    expect(container.textContent).not.toContain("Knowledge Graph");
  });

  it("does not expose 'pgvector' in the UI", () => {
    const { container } = render(<SucheClient {...defaultProps} />);
    expect(container.textContent).not.toContain("pgvector");
  });

  it("does not expose 'embedding' in the UI", () => {
    const { container } = render(<SucheClient {...defaultProps} />);
    expect(container.textContent?.toLowerCase()).not.toContain("embedding");
  });
});

describe("SucheClient — Source Card Navigation", () => {
  it("navigates to document when source card is clicked", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockChatResponse("Antwort.", [
        { document_id: "doc-1", title: "Stromrechnung", excerpt: "A", score: 0.8 },
      ]),
    ) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Test" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText("Stromrechnung")).toBeDefined();
    });

    // Click the source card
    fireEvent.click(screen.getByTestId("source-card"));

    expect(mockPush).toHaveBeenCalledWith("/scan?doc=doc-1");
  });
});
