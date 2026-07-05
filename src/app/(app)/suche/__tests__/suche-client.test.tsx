import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

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
  it("submits an example query when clicked and shows user message", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockChatResponse("Ich finde dazu kein Dokument.", []),
    ) as unknown as typeof fetch;

    render(<SucheClient {...defaultProps} />);

    // Click the first example query
    fireEvent.click(screen.getByText("Zeig mir alle Dokumente von Emma"));

    // The user message should appear
    await waitFor(() => {
      expect(
        screen.getByText("Zeig mir alle Dokumente von Emma"),
      ).toBeDefined();
    });
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
  it("renders filter chips for persons in the family", () => {
    render(<SucheClient {...defaultProps} />);
    // Person chips based on members
    expect(screen.getByText("Emma")).toBeDefined();
    expect(screen.getByText("Hanna")).toBeDefined();
  });

  it("renders filter chips for categories", () => {
    render(<SucheClient {...defaultProps} />);
    expect(screen.getByText("Rechnungen")).toBeDefined();
    expect(screen.getByText("Schule")).toBeDefined();
    expect(screen.getByText("Gesundheit")).toBeDefined();
  });

  it("renders filter chips for document types in German", () => {
    render(<SucheClient {...defaultProps} />);
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

  it("does not render empty filter chips when no documents have a category", () => {
    render(
      <SucheClient
        {...defaultProps}
        documents={[
          { id: "doc-1", title: "Ohne Kategorie", category: null, document_type: "other", persons: [] },
        ]}
      />,
    );
    // No category chips should be shown
    expect(screen.queryByText("Rechnungen")).toBeNull();
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
