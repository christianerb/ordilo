import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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

  it("renders an icon", () => {
    const { container } = render(<AnswerCard card={buildCard()} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
