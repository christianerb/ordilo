import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ListChecks } from "lucide-react";

import { SourceCard } from "@/components/ordilo/source-card";

describe("SourceCard", () => {
  const defaultProps = {
    documentId: "doc-123",
    title: "Stromrechnung Juli 2026",
    score: 0.85,
  };

  it("renders the document title", () => {
    render(<SourceCard {...defaultProps} />);
    expect(screen.getByText("Stromrechnung Juli 2026")).toBeDefined();
  });

  it("exposes the relevance score accessibly (no visible raw percentage)", () => {
    render(<SourceCard {...defaultProps} score={0.85} />);
    // 0.85 → 85 — announced to assistive tech, not shown as UI noise.
    expect(screen.getByText(/Relevanz 85 Prozent/)).toBeDefined();
  });

  it("clamps score above 1 to 100", () => {
    render(<SourceCard {...defaultProps} score={1.5} />);
    expect(screen.getByText(/Relevanz 100 Prozent/)).toBeDefined();
  });

  it("clamps score below 0 to 0", () => {
    render(<SourceCard {...defaultProps} score={-0.3} />);
    expect(screen.getByText(/Relevanz 0 Prozent/)).toBeDefined();
  });

  it("renders a document icon", () => {
    const { container } = render(<SourceCard {...defaultProps} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("falls back to 'Unbenanntes Dokument' when title is null", () => {
    render(<SourceCard {...defaultProps} title={null} />);
    expect(screen.getByText("Unbenanntes Dokument")).toBeDefined();
  });

  it("falls back to 'Unbenanntes Dokument' when title is empty", () => {
    render(<SourceCard {...defaultProps} title="" />);
    expect(screen.getByText("Unbenanntes Dokument")).toBeDefined();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<SourceCard {...defaultProps} onClick={onClick} />);
    fireEvent.click(screen.getByTestId("source-card"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is keyboard accessible (has role button and tabIndex)", () => {
    render(<SourceCard {...defaultProps} onClick={vi.fn()} />);
    const card = screen.getByTestId("source-card");
    expect(card.getAttribute("role")).toBe("button");
    expect(card.getAttribute("tabindex")).toBe("0");
  });

  it("triggers onClick via Enter key", () => {
    const onClick = vi.fn();
    render(<SourceCard {...defaultProps} onClick={onClick} />);
    const card = screen.getByTestId("source-card");
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not crash when onClick is not provided", () => {
    render(<SourceCard {...defaultProps} />);
    // Just verify it renders without error
    expect(screen.getByText("Stromrechnung Juli 2026")).toBeDefined();
  });

  it("announces the relevance in German for assistive tech", () => {
    render(<SourceCard {...defaultProps} score={0.92} />);
    expect(screen.getByText(/Relevanz 92 Prozent/)).toBeDefined();
  });

  it("handles special characters in title safely", () => {
    const specialTitle = 'Müller & Söhne "Rechnung" äöü';
    render(
      <SourceCard
        {...defaultProps}
        title={specialTitle}
      />,
    );
    expect(screen.getByText(specialTitle)).toBeDefined();
  });

  it("defaults to the 'Dokumenten-Suche' kind label when no kind is provided", () => {
    render(<SourceCard {...defaultProps} />);
    expect(screen.getByText("Dokumenten-Suche")).toBeDefined();
  });

  it("renders a custom kind label and icon when provided", () => {
    render(
      <SourceCard
        {...defaultProps}
        kind={{ icon: ListChecks, label: "Aufgaben-Suche" }}
      />,
    );
    expect(screen.getByText("Aufgaben-Suche")).toBeDefined();
  });

});
