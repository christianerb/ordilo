import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";

import { SucheClient } from "@/app/(app)/suche/suche-client";
import type { SucheClientProps } from "@/app/(app)/suche/suche-client";

const mockOpenDocument = vi.fn();
vi.mock("@/lib/scan/scan-context", () => ({
  useDocumentViewer: () => ({
    openDocument: mockOpenDocument,
  }),
}));

// Mock next/navigation useRouter
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// SucheClient no longer renders its own search bar — the composer lives
// once, globally, in the app shell's bottom bar (VAL-NAV), which submits
// queries by calling the handler SucheClient registers here via
// `setActiveHandler`. Capture it so tests can simulate the global
// composer submitting a query, exactly like the real integration does.
let activeHandler: ((query: string) => void) | null = null;
vi.mock("@/lib/search/active-search-context", () => ({
  useActiveSearch: () => ({
    setActiveHandler: (handler: ((query: string) => void) | null) => {
      activeHandler = handler;
    },
    submitQuery: (query: string) => activeHandler?.(query),
  }),
}));

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

const src = (id: string, title: string, score = 0.8) => ({
  document_id: id,
  title,
  excerpt: "A",
  score,
});

// ---------------------------------------------------------------------------
// Stream mock helpers
// ---------------------------------------------------------------------------

/**
 * Create a Response with a ReadableStream body emitting NDJSON lines.
 */
function streamResponse(events: unknown[], ok = true): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: ok ? 200 : 500,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

/** Response that never resolves (keeps loading state). */
function pendingResponse(): Promise<Response> {
  return new Promise(() => {});
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  mockPush.mockClear();
  mockOpenDocument.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
  global.fetch = vi.fn().mockResolvedValue(
    streamResponse([
      { type: "text", content: "Default response." },
      { type: "sources", sources: [] },
      { type: "done" },
    ]),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: submit a query and wait for stream to process
// ---------------------------------------------------------------------------

async function submitQuery(query: string) {
  await act(async () => {
    activeHandler?.(query);
  });

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(query),
      }),
    );
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SucheClient — Empty State", () => {
  it("does not render its own search bar (the global composer owns it)", () => {
    render(<SucheClient {...defaultProps} />);
    expect(screen.queryByRole("textbox")).toBeNull();
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
    const heading = screen.getByRole("heading");
    expect(heading.textContent).toMatch(/finden|suchen|frage|helfen|ordilo/i);
  });
});

describe("SucheClient — Chat Interaction (Streaming)", () => {
  it("shows the AI answer after stream completes", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        { type: "text", content: "Hier ist" },
        { type: "text", content: " deine Antwort." },
        { type: "sources", sources: [src("doc-1", "Stromrechnung")] },
        { type: "done" },
      ]),
    );

    render(<SucheClient {...defaultProps} />);
    await submitQuery("Finde Rechnung");

    await waitFor(() => {
      expect(screen.getByText("Hier ist deine Antwort.")).toBeDefined();
    });
  });

  it("shows source cards after stream completes with sources", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        { type: "text", content: "Antwort mit Quellen." },
        {
          type: "sources",
          sources: [
            src("doc-1", "Stromrechnung Juli", 0.85),
            src("doc-2", "Kita-Brief", 0.72),
          ],
        },
        { type: "done" },
      ]),
    );

    render(<SucheClient {...defaultProps} />);
    await submitQuery("Zeig Dokumente");

    await waitFor(() => {
      expect(screen.getByText("Stromrechnung Juli")).toBeDefined();
      expect(screen.getByText("Kita-Brief")).toBeDefined();
    });
  });

  it("does not show source cards when sources is empty", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        { type: "text", content: "Ich finde dazu kein Dokument." },
        { type: "sources", sources: [] },
        { type: "done" },
      ]),
    );

    render(<SucheClient {...defaultProps} />);
    await submitQuery("Nichtexistent");

    await waitFor(() => {
      expect(
        screen.getByText("Ich finde dazu kein Dokument."),
      ).toBeDefined();
    });
    expect(screen.queryAllByTestId("source-card")).toHaveLength(0);
  });

  it("shows loading indicator while awaiting stream", async () => {
    global.fetch = vi.fn().mockReturnValue(pendingResponse());

    render(<SucheClient {...defaultProps} />);

    act(() => {
      activeHandler?.("Test");
    });

    await waitFor(() => {
      expect(screen.getByTestId("processing-checklist")).toBeDefined();
    });
  });

  it("hides loading indicator when stream text arrives", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        { type: "text", content: "Antwort." },
        { type: "sources", sources: [src("doc-1", "Test")] },
        { type: "done" },
      ]),
    );

    render(<SucheClient {...defaultProps} />);
    await submitQuery("Test");

    await waitFor(() => {
      expect(screen.queryByTestId("processing-checklist")).toBeNull();
    });
  });

  it("shows user message and AI answer after exchange", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        { type: "text", content: "Du hast 2 offene Aufgaben." },
        { type: "sources", sources: [] },
        { type: "done" },
      ]),
    );

    render(<SucheClient {...defaultProps} />);
    await submitQuery("Was muss ich erledigen?");

    await waitFor(() => {
      expect(screen.getByText("Was muss ich erledigen?")).toBeDefined();
      expect(
        screen.getByText("Du hast 2 offene Aufgaben."),
      ).toBeDefined();
    });
  });

  it("shows a German error message when the chat API returns non-ok", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      streamResponse([{ type: "error", error: "API error", code: "FAIL" }], false),
    );

    render(<SucheClient {...defaultProps} />);

    act(() => {
      activeHandler?.("Fehler Test");
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Da ist was schiefgegangen/i),
      ).toBeDefined();
    });
  });

  it("shows error message on network failure (fetch rejects)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    render(<SucheClient {...defaultProps} />);

    act(() => {
      activeHandler?.("Netzwerk Test");
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Da ist was schiefgegangen/i),
      ).toBeDefined();
    });
  });
});

describe("SucheClient — Filter Chips", () => {
  it("does not render filter chips before any results exist", () => {
    render(<SucheClient {...defaultProps} />);
    expect(screen.queryByTestId("filter-chips")).toBeNull();
  });

  it("renders person filter chips derived from the current result set", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        { type: "text", content: "Antwort." },
        {
          type: "sources",
          sources: [
            src("doc-1", "Stromrechnung Juli"),
            src("doc-2", "Kita-Brief für Emma", 0.7),
            src("doc-3", "Arztbrief Hanna", 0.6),
          ],
        },
        { type: "done" },
      ]),
    );

    render(<SucheClient {...defaultProps} />);
    await submitQuery("Alle");

    await waitFor(() => {
      expect(screen.getByTestId("filter-chips")).toBeDefined();
    });
    expect(screen.getByRole("button", { name: /^Emma$/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Hanna$/ })).toBeDefined();
    expect(
      screen.queryByRole("button", { name: /^Christian$/ }),
    ).toBeNull();
  });

  it("renders category filter chips derived from the current result set", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        { type: "text", content: "Antwort." },
        {
          type: "sources",
          sources: [
            src("doc-1", "Stromrechnung Juli"),
            src("doc-2", "Kita-Brief für Emma", 0.7),
            src("doc-3", "Arztbrief Hanna", 0.6),
          ],
        },
        { type: "done" },
      ]),
    );

    render(<SucheClient {...defaultProps} />);
    await submitQuery("Alle");

    await waitFor(() => {
      expect(screen.getByText("Rechnungen")).toBeDefined();
      expect(screen.getByText("Schule")).toBeDefined();
      expect(screen.getByText("Gesundheit")).toBeDefined();
    });
  });

  it("renders document type filter chips in German", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        { type: "text", content: "Antwort." },
        {
          type: "sources",
          sources: [
            src("doc-1", "Stromrechnung Juli"),
            src("doc-2", "Kita-Brief für Emma", 0.7),
            src("doc-3", "Arztbrief Hanna", 0.6),
          ],
        },
        { type: "done" },
      ]),
    );

    render(<SucheClient {...defaultProps} />);
    await submitQuery("Alle");

    await waitFor(() => {
      expect(screen.getByText("Rechnung")).toBeDefined();
      expect(screen.getByText("Brief")).toBeDefined();
      expect(screen.getByText("Arztbrief")).toBeDefined();
    });
  });

  it("filters source cards by person when a person chip is activated", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        { type: "text", content: "Antwort." },
        {
          type: "sources",
          sources: [
            src("doc-1", "Stromrechnung Juli"),
            src("doc-2", "Kita-Brief für Emma", 0.7),
            src("doc-3", "Arztbrief Hanna", 0.6),
          ],
        },
        { type: "done" },
      ]),
    );

    render(<SucheClient {...defaultProps} />);
    await submitQuery("Alle");

    await waitFor(() => {
      expect(screen.getAllByTestId("source-card")).toHaveLength(3);
    });

    fireEvent.click(screen.getByRole("button", { name: /^Hanna$/ }));
    await waitFor(() => {
      expect(screen.getAllByTestId("source-card")).toHaveLength(1);
      expect(screen.getByText("Arztbrief Hanna")).toBeDefined();
    });
  });

  it("can clear a filter chip by clicking it again", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        { type: "text", content: "Antwort." },
        {
          type: "sources",
          sources: [
            src("doc-1", "Stromrechnung Juli"),
            src("doc-3", "Arztbrief Hanna", 0.6),
          ],
        },
        { type: "done" },
      ]),
    );

    render(<SucheClient {...defaultProps} />);
    await submitQuery("Test");

    await waitFor(() => {
      expect(screen.getAllByTestId("source-card")).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole("button", { name: /^Hanna$/ }));
    await waitFor(() =>
      expect(screen.getAllByTestId("source-card")).toHaveLength(1),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Hanna$/ }));
    await waitFor(() =>
      expect(screen.getAllByTestId("source-card")).toHaveLength(2),
    );
  });

  it("does not render empty filter chips when result documents have no category", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        { type: "text", content: "Antwort." },
        {
          type: "sources",
          sources: [src("doc-nocat", "Ohne Kategorie", 0.5)],
        },
        { type: "done" },
      ]),
    );

    render(
      <SucheClient
        {...defaultProps}
        documents={[
          {
            id: "doc-nocat",
            title: "Ohne Kategorie",
            category: null,
            document_type: "other",
            persons: [],
          },
        ]}
        members={[{ id: "m1", name: "Emma" }]}
      />,
    );
    await submitQuery("Test");

    await waitFor(() => {
      expect(screen.getByTestId("filter-chips")).toBeDefined();
    });
    expect(screen.getByText("Sonstiges")).toBeDefined();
    const filterChipsContainer = screen.getByTestId("filter-chips");
    const chipButtons = within(filterChipsContainer).getAllByRole("button");
    for (const btn of chipButtons) {
      expect(btn.textContent?.trim().length).toBeGreaterThan(0);
    }
    expect(
      screen.queryByRole("button", { name: /^Emma$/ }),
    ).toBeNull();
  });
});

describe("SucheClient — Result-Aware Filter Chips (VAL-SEARCH-032)", () => {
  it("person chips only list members appearing in the current result set", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        { type: "text", content: "Antwort." },
        { type: "sources", sources: [src("doc-3", "Arztbrief Hanna", 0.6)] },
        { type: "done" },
      ]),
    );

    render(<SucheClient {...defaultProps} />);
    await submitQuery("Hanna");

    await waitFor(() => {
      expect(screen.getByTestId("filter-chips")).toBeDefined();
    });
    expect(screen.getByRole("button", { name: /^Hanna$/ })).toBeDefined();
    expect(screen.queryByRole("button", { name: /^Emma$/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^Christian$/ }),
    ).toBeNull();
  });

  it("category/type chips only reflect values present in the current result set", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        { type: "text", content: "Antwort." },
        { type: "sources", sources: [src("doc-1", "Stromrechnung Juli", 0.8)] },
        { type: "done" },
      ]),
    );

    render(<SucheClient {...defaultProps} />);
    await submitQuery("Rechnung");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^Rechnungen$/ }),
      ).toBeDefined();
      expect(
        screen.getByRole("button", { name: /^Rechnung$/ }),
      ).toBeDefined();
    });
    expect(
      screen.queryByRole("button", { name: /^Schule$/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^Gesundheit$/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /^Brief$/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^Arztbrief$/ }),
    ).toBeNull();
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

describe("SucheClient — Source Card Opening", () => {
  it("opens the shared document sheet when a source card is clicked", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      streamResponse([
        { type: "text", content: "Antwort." },
        { type: "sources", sources: [src("doc-1", "Stromrechnung", 0.8)] },
        { type: "done" },
      ]),
    );

    render(<SucheClient {...defaultProps} />);
    await submitQuery("Test");

    await waitFor(() => {
      expect(screen.getByText("Stromrechnung")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("source-card"));
    expect(mockOpenDocument).toHaveBeenCalledWith("doc-1");
  });
});
