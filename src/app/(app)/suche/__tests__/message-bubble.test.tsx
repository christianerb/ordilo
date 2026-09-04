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
    actions: [],
    ...overrides,
  };
}

const passesAllFilters = () => true;

describe("MessageBubble — Markdown rendering", () => {
  it("uses the Ordilo elephant mark for assistant answers", () => {
    const { container } = render(
      <MessageBubble
        message={buildMessage({ content: "Antwort" })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );

    expect(
      container.querySelector('[data-part="elephant-silhouette"]'),
    ).not.toBeNull();
  });

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

  it("renders only the best source until the rest are expanded", () => {
    render(
      <MessageBubble
        message={buildMessage({ content: "Antwort", sources })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId("source-card")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("show-more-sources"));
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

  it("does not render the document suggestions label when there are no sources", () => {
    render(
      <MessageBubble
        message={buildMessage({ content: "Antwort", sources: [] })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.queryByText("Quellen")).toBeNull();
  });

  it("renders the document suggestions label and count when sources are visible", () => {
    render(
      <MessageBubble
        message={buildMessage({ content: "Antwort", sources })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.getByText("Quellen")).toBeDefined();
    expect(screen.getByTestId("source-count-badge").textContent).toBe("2");
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
    expect(screen.getAllByText("Dokumenten-Suche")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("show-more-sources"));
    expect(screen.getAllByText("Dokumenten-Suche")).toHaveLength(2);
  });

  it("opens safe web sources as external links", () => {
    render(
      <MessageBubble
        message={buildMessage({
          content: "Antwort laut Verbraucherzentrale.",
          sources: [
            {
              document_id: "web-1",
              title: "Verbraucherzentrale",
              excerpt: "Aktuelle Information",
              score: 0.9,
              origin: "web",
              url: "https://www.verbraucherzentrale.de/wissen",
            },
          ],
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );

    const link = screen.getByRole("link", { name: /Verbraucherzentrale/ });
    expect(link.getAttribute("href")).toBe(
      "https://www.verbraucherzentrale.de/wissen",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("Web-Quelle")).toBeDefined();
  });

  it("does not create a link for an unsafe web URL", () => {
    render(
      <MessageBubble
        message={buildMessage({
          content: "Antwort",
          sources: [
            {
              document_id: "web-unsafe",
              title: "Unsichere Quelle",
              excerpt: "Nicht öffnen",
              score: 0.9,
              origin: "web",
              url: "javascript:alert(1)",
            },
          ],
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("link", { name: /Unsichere Quelle/ }),
    ).toBeNull();
  });
});

describe("MessageBubble — answer metadata", () => {
  it("renders a non-success response state after streaming completes", () => {
    render(
      <MessageBubble
        message={buildMessage({
          content: "Ich habe nur einen Teil gefunden.",
          responseState: "partial",
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );

    expect(screen.getByText("Teilweise beantwortet")).toBeDefined();
  });

  it("runs the single suggested follow-up from its button", () => {
    const onSuggestionClick = vi.fn();
    render(
      <MessageBubble
        message={buildMessage({
          content: "Antwort",
          suggestion: {
            label: "Fristen prüfen",
            prompt: "Welche Fristen laufen diese Woche ab?",
          },
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
        onSuggestionClick={onSuggestionClick}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fristen prüfen" }));
    expect(onSuggestionClick).toHaveBeenCalledWith(
      "Welche Fristen laufen diese Woche ab?",
    );
  });
});

describe("MessageBubble — controlled repair", () => {
  it("starts a new search even when feedback storage fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const onRepair = vi.fn().mockResolvedValue(undefined);
    render(
      <MessageBubble
        message={buildMessage({
          dbId: "3f668177-5e95-455e-894a-e42e4bcc7a1e",
          content: "Die alte Antwort.",
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
        onRepair={onRepair}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Antwort war nicht hilfreich" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Falsche Antwort" }));
    fireEvent.click(screen.getByRole("button", { name: "Besser antworten" }));

    await waitFor(() =>
      expect(onRepair).toHaveBeenCalledWith(
        expect.objectContaining({
          dbId: "3f668177-5e95-455e-894a-e42e4bcc7a1e",
        }),
        ["falsche_antwort"],
        "",
      ),
    );
    vi.unstubAllGlobals();
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

  it("shows why the best document matches without adding another card", () => {
    render(
      <MessageBubble
        message={buildMessage({
          content: "Antwort",
          sources: [
            {
              document_id: "doc-1",
              title: "Kita-Brief",
              excerpt: "Die Bewilligung gilt bis 31.07.2026.",
              score: 0.92,
            },
          ],
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.getByText("Die Bewilligung gilt bis 31.07.2026.")).toBeDefined();
    expect(screen.getByText("Beste Übereinstimmung")).toBeDefined();
  });

  it("does not show a sources toggle for one source", () => {
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
    expect(toggle.textContent).toContain("2 weitere Quellen");
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
            hasSecret: false,
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
            hasSecret: false,
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
            hasSecret: false,
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

describe("MessageBubble — Ordilo Action Card", () => {
  const taskAction = {
    id: "action-1",
    toolName: "add_task" as const,
    args: {
      title: "Anmeldung abschicken",
      due_date: "2026-08-15",
      assignee_name: "Emma",
    },
    state: "ready" as const,
  };

  it("renders a clear proposed action separate from the assistant answer", () => {
    render(
      <MessageBubble
        message={buildMessage({
          content: "Ich habe das für dich vorbereitet.",
          actions: [taskAction],
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId("ordilo-action-card")).toBeDefined();
    expect(screen.getByText("Aufgabe vorbereiten")).toBeDefined();
    expect(screen.getByText("Anmeldung abschicken")).toBeDefined();
    expect(screen.getByText("15.08.2026")).toBeDefined();
    expect(screen.getByTestId("action-card-confirm")).toHaveTextContent(
      "Übernehmen",
    );
  });

  it("routes the card controls to the message action callbacks", () => {
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();
    const onAdjust = vi.fn();
    render(
      <MessageBubble
        message={buildMessage({ actions: [taskAction] })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
        onActionConfirm={onConfirm}
        onActionDismiss={onDismiss}
        onActionAdjust={onAdjust}
      />,
    );

    fireEvent.click(screen.getByTestId("action-card-confirm"));
    fireEvent.click(screen.getByTestId("action-card-adjust"));
    fireEvent.click(screen.getByTestId("action-card-dismiss"));

    expect(onConfirm).toHaveBeenCalledWith("msg-1", "action-1");
    expect(onAdjust).toHaveBeenCalledWith(
      expect.objectContaining({ id: "msg-1" }),
      taskAction,
    );
    expect(onDismiss).toHaveBeenCalledWith("msg-1", "action-1");
  });

  it("renders a contact proposal with its saved contact details", () => {
    render(
      <MessageBubble
        message={buildMessage({
          actions: [{
            id: "contact-action",
            toolName: "add_contact",
            args: {
              name: "Hein Blöd",
              phone: "+49 30 123456",
              email: "hein@example.de",
            },
            state: "ready",
          }],
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );

    expect(screen.getByText("Kontakt vorbereiten")).toBeDefined();
    expect(screen.getByText("Hein Blöd")).toBeDefined();
    expect(screen.getByText("+49 30 123456")).toBeDefined();
    expect(screen.getByText("hein@example.de")).toBeDefined();
  });

  it("shows the complete note text before a note proposal is confirmed", () => {
    render(
      <MessageBubble
        message={buildMessage({
          actions: [{
            id: "note-action",
            toolName: "create_note",
            args: {
              title: "Audi BKK – Emma Erb",
              content: "Versicherungsnummer Emma Erb: X123456789",
            },
            state: "ready",
          }],
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );

    expect(screen.getByText("Notiz anlegen")).toBeDefined();
    expect(screen.getByText("Notiz")).toBeDefined();
    expect(
      screen.getByText("Versicherungsnummer Emma Erb: X123456789"),
    ).toBeDefined();
  });

  it("renders every proposed note change as its own action card", () => {
    render(
      <MessageBubble
        message={buildMessage({
          actions: [
            {
              id: "update-emma",
              toolName: "update_note",
              args: {
                note_title: "Audi BKK – Emma Erb",
                append_content: "Versicherungsnummer Emma Erb: X123456789",
              },
              state: "ready",
            },
            {
              id: "update-hanna",
              toolName: "update_note",
              args: {
                note_title: "Audi BKK – Hanna Erb",
                append_content: "Versicherungsnummer Hanna Erb: Y987654321",
              },
              state: "ready",
            },
          ],
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Notiz ändern")).toHaveLength(2);
    expect(screen.getByText("Audi BKK – Emma Erb")).toBeDefined();
    expect(screen.getByText("Audi BKK – Hanna Erb")).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Übernehmen" })).toHaveLength(
      2,
    );
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
    expect(screen.getByTestId("feedback-thanks").textContent).toBe(
      "Danke, gespeichert.",
    );
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

describe("MessageBubble — quoting", () => {
  it("does not show a quote button when onQuote is not provided", () => {
    render(
      <MessageBubble
        message={buildMessage({ content: "Antwort" })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("feedback-quote")).toBeNull();
  });

  it("calls onQuote with the message when the quote button is clicked", () => {
    const onQuote = vi.fn();
    const message = buildMessage({ content: "Die Frist ist der 12. Juli." });
    render(
      <MessageBubble
        message={message}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
        onQuote={onQuote}
      />,
    );
    fireEvent.click(screen.getByTestId("feedback-quote"));
    expect(onQuote).toHaveBeenCalledWith(message);
  });

  it("renders a quoted excerpt above a user message that has one", () => {
    render(
      <MessageBubble
        message={buildMessage({
          role: "user",
          content: "Und wann genau?",
          quotedText: "Die Frist ist der 12. Juli.",
        })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId("message-quoted-text").textContent).toBe(
      "Die Frist ist der 12. Juli.",
    );
    expect(screen.getByText("Und wann genau?")).toBeDefined();
  });

  it("does not render a quoted excerpt when the user message has none", () => {
    render(
      <MessageBubble
        message={buildMessage({ role: "user", content: "Frage ohne Zitat" })}
        passesFilters={passesAllFilters}
        onSourceCardClick={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("message-quoted-text")).toBeNull();
  });
});
