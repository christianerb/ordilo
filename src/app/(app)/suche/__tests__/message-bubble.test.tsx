import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { MessageBubble, type ChatMessage } from "@/app/(app)/suche/message-bubble";
import type { ChatSource } from "@/lib/schemas/chat";

function buildMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    role: "assistant",
    content: "",
    sources: [],
    ...overrides,
  };
}

const passesAllFilters = () => true;

describe("MessageBubble — Markdown rendering", () => {
  it("renders **bold** Markdown as an actual <strong>, not literal asterisks", async () => {
    render(
      <MessageBubble
        message={buildMessage({ content: "Frist: **12. Juli 2026**" })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("12. Juli 2026").tagName).toBe("STRONG");
    });
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it("renders a Markdown table (GFM) as an actual <table> with cells", async () => {
    const table = [
      "| Dokument | Frist |",
      "| --- | --- |",
      "| Kita-Brief | 12.07.2026 |",
    ].join("\n");
    const { container } = render(
      <MessageBubble
        message={buildMessage({ content: table })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector("table")).not.toBeNull();
    });
    expect(screen.getByText("Kita-Brief").tagName).toBe("TD");
    expect(screen.getByText("Frist").tagName).toBe("TH");
  });

  it("does not parse Markdown in user messages (plain text)", () => {
    render(
      <MessageBubble
        message={buildMessage({ role: "user", content: "Ist **das** wichtig?" })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.getByText("Ist **das** wichtig?")).toBeDefined();
  });
});

describe("MessageBubble — Quellen (source citations)", () => {
  const sources: ChatSource[] = [
    {
      document_id: "doc-1",
      title: "Stromrechnung Juli",
      excerpt: "45,80 €",
      score: 0.85,
    },
    {
      document_id: "doc-2",
      title: "Kita-Brief",
      excerpt: "Rückmeldung bis 12.07.",
      score: 0.7,
    },
  ];

  it("renders one compact chip per visible source", () => {
    render(
      <MessageBubble
        message={buildMessage({ content: "Antwort", sources })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId("source-card")).toHaveLength(2);
  });

  it("hides sources filtered out by passesFilters", () => {
    render(
      <MessageBubble
        message={buildMessage({ content: "Antwort", sources })}
        passesFilters={(id) => id === "doc-1"}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId("source-card")).toHaveLength(1);
  });

  it("does not render the 'Quellen' label when there are no sources", () => {
    render(
      <MessageBubble
        message={buildMessage({ content: "Antwort", sources: [] })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.queryByText("Quellen")).toBeNull();
  });

  it("renders the 'Quellen' label when sources are visible", () => {
    render(
      <MessageBubble
        message={buildMessage({ content: "Antwort", sources })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.getByText("Quellen")).toBeDefined();
  });

  it("labels a source with an 'Aufgabe: ' excerpt prefix as Aufgaben-Suche", () => {
    render(
      <MessageBubble
        message={buildMessage({
          content: "Antwort",
          sources: [
            {
              document_id: "doc-3",
              title: "Aufgabenliste",
              excerpt: "Aufgabe: Wäsche waschen",
              score: 0.9,
            },
          ],
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.getByText("Aufgaben-Suche")).toBeDefined();
  });

  it("labels a source with a 'Person: ' excerpt prefix as Personen-Suche", () => {
    render(
      <MessageBubble
        message={buildMessage({
          content: "Antwort",
          sources: [
            {
              document_id: "doc-4",
              title: "Familienliste",
              excerpt: "Person: Emma Müller",
              score: 0.9,
            },
          ],
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.getByText("Personen-Suche")).toBeDefined();
  });

  it("labels a plain document source as Dokumenten-Suche", () => {
    render(
      <MessageBubble
        message={buildMessage({ content: "Antwort", sources })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Dokumenten-Suche")).toHaveLength(2);
  });
});

describe("MessageBubble — top matches vs. minimal reference list", () => {
  it("promotes high-relevance sources to a match card with a relevance badge", () => {
    render(
      <MessageBubble
        message={buildMessage({
          content: "Antwort",
          sources: [
            { document_id: "doc-1", title: "Kita-Brief", excerpt: "x", score: 0.92 },
          ],
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId("source-match-relevance").textContent).toBe(
      "Sehr relevant",
    );
    expect(screen.queryByText(/92\s*%/)).toBeNull();
  });

  it("does not show a sources toggle when every source is a top match", () => {
    render(
      <MessageBubble
        message={buildMessage({
          content: "Antwort",
          sources: [
            { document_id: "doc-1", title: "Kita-Brief", excerpt: "x", score: 0.92 },
            { document_id: "doc-2", title: "Schulbrief", excerpt: "x", score: 0.7 },
          ],
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("show-more-sources")).toBeNull();
  });

  it("collapses low-relevance sources behind a toggle", () => {
    render(
      <MessageBubble
        message={buildMessage({
          content: "Antwort",
          sources: [
            { document_id: "doc-1", title: "Kita-Brief", excerpt: "x", score: 0.95 },
            { document_id: "doc-2", title: "Duplikat 1", excerpt: "x", score: 0.4 },
            { document_id: "doc-3", title: "Duplikat 2", excerpt: "x", score: 0.31 },
          ],
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    // Low-relevance sources are collapsed behind a quiet toggle by
    // default (answer-first hierarchy) …
    const toggle = screen.getByTestId("show-more-sources");
    expect(toggle.textContent).toContain("2 weitere mögliche Dokumente");
    expect(screen.queryByText("Duplikat 1")).toBeNull();
    // … and expand on demand. Raw percentages are announced to assistive
    // tech only, never shown as visible UI noise.
    fireEvent.click(toggle);
    expect(screen.getByTestId("source-match-relevance")).toBeDefined();
    expect(screen.getByText("Duplikat 1")).toBeDefined();
    expect(screen.getByText(/Relevanz 40 Prozent/)).toBeDefined();
    expect(screen.getByText(/Relevanz 31 Prozent/)).toBeDefined();
  });

  it("always promotes at least one source to a match card, even if none clear the relevance threshold", () => {
    render(
      <MessageBubble
        message={buildMessage({
          content: "Antwort",
          sources: [
            { document_id: "doc-1", title: "Schwacher Treffer", excerpt: "x", score: 0.32 },
          ],
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId("source-match-relevance").textContent).toBe(
      "Möglich relevant",
    );
    expect(screen.queryByTestId("show-more-sources")).toBeNull();
  });
});

describe("MessageBubble — loading checklist", () => {
  it("shows the processing checklist while streaming with no content or card yet", () => {
    render(
      <MessageBubble
        message={buildMessage({ content: "" })}
        isStreaming
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId("processing-checklist")).toBeDefined();
  });

  it("hides the processing checklist once streamed text has arrived", () => {
    render(
      <MessageBubble
        message={buildMessage({ content: "Teilantwort" })}
        isStreaming
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("processing-checklist")).toBeNull();
  });

  it("hides the processing checklist once a card has arrived", () => {
    render(
      <MessageBubble
        message={buildMessage({
          content: "",
          card: {
            type: "termin",
            title: "Zahnarzttermin",
            subtitle: null,
            fields: [{ label: "Datum", value: "12.08.2026" }],
            actionDocumentId: null,
          },
        })}
        isStreaming
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("processing-checklist")).toBeNull();
    expect(screen.getByTestId("answer-card")).toBeDefined();
  });
});

describe("MessageBubble — structured answer card", () => {
  it("renders an AnswerCard instead of Markdown text when message.card is set", () => {
    render(
      <MessageBubble
        message={buildMessage({
          content: "",
          card: {
            type: "termin",
            title: "Zahnarzttermin",
            subtitle: "Emma",
            fields: [{ label: "Datum", value: "12.08.2026" }],
            actionDocumentId: null,
          },
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId("answer-card")).toBeDefined();
    expect(screen.getByText("Zahnarzttermin")).toBeDefined();
    expect(screen.getByText("Emma")).toBeDefined();
    expect(screen.queryByTestId("message-content")).toBeNull();
  });

  it("calls onSourceCardClick when the card's action button is clicked", () => {
    const onSourceCardClick = vi.fn();
    render(
      <MessageBubble
        message={buildMessage({
          content: "",
          card: {
            type: "dokument",
            title: "Stromrechnung",
            subtitle: null,
            fields: [{ label: "Betrag", value: "45 EUR" }],
            actionDocumentId: "doc-1",
          },
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={onSourceCardClick}
      />,
    );
    fireEvent.click(screen.getByTestId("answer-card-action"));
    expect(onSourceCardClick).toHaveBeenCalledWith("doc-1");
  });
});

describe("MessageBubble — feedback icons", () => {
  it("shows feedback icons for a completed text answer", () => {
    render(
      <MessageBubble
        message={buildMessage({ content: "Antwort" })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId("answer-feedback")).toBeDefined();
    expect(screen.getByTestId("feedback-up")).toBeDefined();
    expect(screen.getByTestId("feedback-down")).toBeDefined();
    expect(screen.getByTestId("feedback-copy")).toBeDefined();
  });

  it("does not show feedback icons while still loading", () => {
    render(
      <MessageBubble
        message={buildMessage({ content: "" })}
        isStreaming
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("answer-feedback")).toBeNull();
  });

  it("does not show feedback icons for user messages", () => {
    render(
      <MessageBubble
        message={buildMessage({ role: "user", content: "Frage" })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("answer-feedback")).toBeNull();
  });

  it("toggles the thumbs-up button to a pressed state when clicked", () => {
    render(
      <MessageBubble
        message={buildMessage({ content: "Antwort" })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    const up = screen.getByTestId("feedback-up");
    expect(up.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(up);
    expect(up.getAttribute("aria-pressed")).toBe("true");
  });

  it("copies the answer text to the clipboard when the copy button is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <MessageBubble
        message={buildMessage({ content: "Die Antwort." })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("feedback-copy"));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("Die Antwort.");
    });
  });
});
