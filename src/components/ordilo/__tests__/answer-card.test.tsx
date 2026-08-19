import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { AnswerCard } from "@/components/ordilo/answer-card";
import type { AnswerCard as AnswerCardData } from "@/lib/schemas/chat";

function buildCard(overrides: Partial<AnswerCardData> = {}): AnswerCardData {
  return {
    type: "termin",
    title: "Zahnarzttermin",
    subtitle: "Emma",
    fields: [
      { label: "Datum", value: "12.08.2026" },
      { label: "Arzt", value: "Dr. Meyer" },
    ],
    actionDocumentId: null,
    hasSecret: false,
    ...overrides,
  };
}

describe("AnswerCard", () => {
  it("renders the title and subtitle", () => {
    render(<AnswerCard card={buildCard()} />);
    expect(screen.getByText("Zahnarzttermin")).toBeDefined();
    expect(screen.getByText("Emma")).toBeDefined();
  });

  it("does not render a subtitle when null", () => {
    render(<AnswerCard card={buildCard({ subtitle: null })} />);
    expect(screen.queryByText("Emma")).toBeNull();
  });

  it("renders all detail fields as label/value pairs", () => {
    render(<AnswerCard card={buildCard()} />);
    expect(screen.getByText("Datum")).toBeDefined();
    expect(screen.getByText("12.08.2026")).toBeDefined();
    expect(screen.getByText("Arzt")).toBeDefined();
    expect(screen.getByText("Dr. Meyer")).toBeDefined();
  });

  it("does not render an action button when actionDocumentId is null", () => {
    render(<AnswerCard card={buildCard({ actionDocumentId: null })} />);
    expect(screen.queryByTestId("answer-card-action")).toBeNull();
  });

  it("renders an action button when actionDocumentId is set", () => {
    render(<AnswerCard card={buildCard({ actionDocumentId: "doc-1" })} />);
    expect(screen.getByTestId("answer-card-action")).toBeDefined();
  });

  it("calls onActionClick with the document ID when the action button is clicked", () => {
    const onActionClick = vi.fn();
    render(
      <AnswerCard
        card={buildCard({ actionDocumentId: "doc-42" })}
        onActionClick={onActionClick}
      />,
    );
    fireEvent.click(screen.getByTestId("answer-card-action"));
    expect(onActionClick).toHaveBeenCalledWith("doc-42");
  });

  it("uses the 'Zum Termin' action label for termin cards", () => {
    render(<AnswerCard card={buildCard({ type: "termin", actionDocumentId: "doc-1" })} />);
    expect(screen.getByText(/Zum Termin/)).toBeDefined();
  });

  it("uses the 'Zur Aufgabe' action label for aufgabe cards", () => {
    render(
      <AnswerCard
        card={buildCard({ type: "aufgabe", actionDocumentId: "doc-1" })}
      />,
    );
    expect(screen.getByText(/Zur Aufgabe/)).toBeDefined();
  });

  it("uses the 'Zum Dokument' action label for dokument cards", () => {
    render(
      <AnswerCard
        card={buildCard({ type: "dokument", actionDocumentId: "doc-1" })}
      />,
    );
    expect(screen.getByText(/Zum Dokument/)).toBeDefined();
  });

  it("exposes the card type as a data attribute", () => {
    render(<AnswerCard card={buildCard({ type: "aufgabe" })} />);
    expect(screen.getByTestId("answer-card").getAttribute("data-card-type")).toBe(
      "aufgabe",
    );
  });

  it("renders verified contact actions and a WhatsApp draft", () => {
    render(
      <AnswerCard
        card={buildCard({
          type: "kontakt",
          title: "Ursula Meyer",
          subtitle: "Kita Sonnenblume",
          fields: [{ label: "Telefon", value: "+49 176 12345" }],
          contact: {
            id: "contact-1",
            phone: "+49 176 12345",
            email: "ursula@example.de",
            action: "whatsapp",
            messageDraft: "Wir kommen später.",
          },
        })}
      />,
    );

    expect(screen.getByRole("link", { name: /Anrufen/ })).toHaveAttribute(
      "href",
      "tel:+4917612345",
    );
    expect(screen.getByRole("link", { name: /E-Mail/ })).toHaveAttribute(
      "href",
      "mailto:ursula@example.de",
    );
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute(
      "href",
      "https://wa.me/4917612345?text=Wir%20kommen%20sp%C3%A4ter.",
    );
    expect(screen.getByText(/Du prüfst und sendest selbst/)).toBeDefined();
  });

  it("renders an icon", () => {
    const { container } = render(<AnswerCard card={buildCard()} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Credentials cards
// ---------------------------------------------------------------------------

function buildCredentialsCard(overrides: Partial<AnswerCardData> = {}) {
  return buildCard({
    type: "zugangsdaten",
    title: "Netflix",
    subtitle: null,
    fields: [
      { label: "URL", value: "https://www.netflix.com" },
      { label: "Benutzername", value: "familie@example.de" },
    ],
    actionDocumentId: "doc-1",
    hasSecret: true,
    ...overrides,
  });
}

describe("AnswerCard — Zugangsdaten", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it("renders the URL as a link that opens in a new tab", () => {
    render(<AnswerCard card={buildCredentialsCard()} />);

    const link = screen.getByTestId("credential-link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://www.netflix.com/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("adds https to a scheme-less address", () => {
    render(
      <AnswerCard
        card={buildCredentialsCard({
          fields: [{ label: "URL", value: "www.netflix.com" }],
        })}
      />,
    );

    expect(
      (screen.getByTestId("credential-link") as HTMLAnchorElement).getAttribute("href"),
    ).toBe("https://www.netflix.com/");
  });

  it("refuses to linkify anything that is not http(s)", () => {
    render(
      <AnswerCard
        card={buildCredentialsCard({
          // Document text is untrusted — it reaches the card through OCR
          // and the model.
          fields: [{ label: "URL", value: "javascript:alert(1)" }],
        })}
      />,
    );

    expect(screen.queryByTestId("credential-link")).toBeNull();
    expect(screen.getByText("javascript:alert(1)")).toBeDefined();
  });

  it("copies a field value to the clipboard", async () => {
    render(<AnswerCard card={buildCredentialsCard()} />);

    fireEvent.click(screen.getAllByTestId("credential-copy")[1]);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("familie@example.de");
    });
  });

  it("leaves other card types as plain, uncopyable text", () => {
    render(<AnswerCard card={buildCard({ type: "dokument" })} />);
    expect(screen.queryByTestId("credential-copy")).toBeNull();
  });

  it("fetches the password only when asked, then copies it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ secret: "hunter2" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AnswerCard card={buildCredentialsCard()} />);

    // Nothing is fetched until the user asks for it.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("credential-secret-value")).toBeNull();

    fireEvent.click(screen.getByTestId("credential-secret-reveal"));

    await waitFor(() => {
      expect(screen.getByTestId("credential-secret-value").textContent).toBe(
        "hunter2",
      );
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/documents/doc-1/secret", {
      method: "POST",
    });

    fireEvent.click(screen.getByTestId("credential-secret-copy"));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("hunter2");
    });

    vi.unstubAllGlobals();
  });

  it("shows the reveal error instead of a password", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Dieses Dokument hat kein hinterlegtes Geheim." }),
      }),
    );

    render(<AnswerCard card={buildCredentialsCard()} />);
    fireEvent.click(screen.getByTestId("credential-secret-reveal"));

    await waitFor(() => {
      expect(screen.getByTestId("credential-secret-error").textContent).toBe(
        "Dieses Dokument hat kein hinterlegtes Geheim.",
      );
    });
    expect(screen.queryByTestId("credential-secret-value")).toBeNull();

    vi.unstubAllGlobals();
  });

  it("omits the password row when the document has no secret", () => {
    render(<AnswerCard card={buildCredentialsCard({ hasSecret: false })} />);
    expect(screen.queryByTestId("credential-secret")).toBeNull();
  });

  it("omits the password row when the document reference was dropped", () => {
    render(
      <AnswerCard card={buildCredentialsCard({ actionDocumentId: null })} />,
    );
    expect(screen.queryByTestId("credential-secret")).toBeNull();
  });
});
