import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileText, ListChecks } from "lucide-react";

import { SourceMatchCard } from "@/components/ordilo/source-match-card";

describe("SourceMatchCard", () => {
  const defaultProps = {
    documentId: "doc-123",
    title: "Kita-Brief",
    score: 0.92,
    kind: { icon: FileText, label: "Dokumenten-Suche" },
  };

  it("renders the document title and source-kind caption", () => {
    render(<SourceMatchCard {...defaultProps} />);
    expect(screen.getByText("Kita-Brief")).toBeDefined();
    expect(screen.getByText("Dokumenten-Suche")).toBeDefined();
  });

  it("falls back to 'Unbenanntes Dokument' when title is null", () => {
    render(<SourceMatchCard {...defaultProps} title={null} />);
    expect(screen.getByText("Unbenanntes Dokument")).toBeDefined();
  });

  it("shows a 'Sehr relevant' badge for high scores", () => {
    render(<SourceMatchCard {...defaultProps} score={0.9} />);
    expect(screen.getByTestId("source-match-relevance").textContent).toBe(
      "Sehr relevant",
    );
  });

  it("shows a 'Relevant' badge for mid-range scores", () => {
    render(<SourceMatchCard {...defaultProps} score={0.6} />);
    expect(screen.getByTestId("source-match-relevance").textContent).toBe(
      "Relevant",
    );
  });

  it("shows a 'Möglich relevant' badge for low scores", () => {
    render(<SourceMatchCard {...defaultProps} score={0.3} />);
    expect(screen.getByTestId("source-match-relevance").textContent).toBe(
      "Möglich relevant",
    );
  });

  it("renders a custom kind icon and label", () => {
    render(
      <SourceMatchCard
        {...defaultProps}
        kind={{ icon: ListChecks, label: "Aufgaben-Suche" }}
      />,
    );
    expect(screen.getByText("Aufgaben-Suche")).toBeDefined();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<SourceMatchCard {...defaultProps} onClick={onClick} />);
    fireEvent.click(screen.getByTestId("source-card"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is keyboard accessible (role button, tabIndex, Enter key)", () => {
    const onClick = vi.fn();
    render(<SourceMatchCard {...defaultProps} onClick={onClick} />);
    const card = screen.getByTestId("source-card");
    expect(card.getAttribute("role")).toBe("button");
    expect(card.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not crash when onClick is not provided", () => {
    render(<SourceMatchCard {...defaultProps} />);
    expect(screen.getByText("Kita-Brief")).toBeDefined();
  });

  it("does not show a raw percentage anywhere", () => {
    render(<SourceMatchCard {...defaultProps} score={0.92} />);
    expect(screen.queryByText(/92\s*%/)).toBeNull();
  });
});
