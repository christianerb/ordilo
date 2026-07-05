import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { SourceCard } from "@/components/ordilo/source-card";

describe("SourceCard", () => {
  const defaultProps = {
    documentId: "doc-123",
    title: "Stromrechnung Juli 2026",
    excerpt: "Rechnung über 45,80 € für Juli 2026",
    score: 0.85,
  };

  it("renders the document title", () => {
    render(<SourceCard {...defaultProps} />);
    expect(screen.getByText("Stromrechnung Juli 2026")).toBeDefined();
  });

  it("renders the excerpt text", () => {
    render(<SourceCard {...defaultProps} />);
    expect(
      screen.getByText("Rechnung über 45,80 € für Juli 2026"),
    ).toBeDefined();
  });

  it("renders the relevance score as a bounded percentage", () => {
    render(<SourceCard {...defaultProps} score={0.85} />);
    // 0.85 → 85%
    expect(screen.getByText(/85%/)).toBeDefined();
  });

  it("clamps score above 1 to 100%", () => {
    render(<SourceCard {...defaultProps} score={1.5} />);
    expect(screen.getByText(/100%/)).toBeDefined();
  });

  it("clamps score below 0 to 0%", () => {
    render(<SourceCard {...defaultProps} score={-0.3} />);
    expect(screen.getByText(/0%/)).toBeDefined();
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

  it("displays the relevance label in German", () => {
    render(<SourceCard {...defaultProps} score={0.92} />);
    // Should show a German relevance label like "Relevanz"
    expect(screen.getByText(/relevanz/i)).toBeDefined();
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

  it("handles special characters in excerpt safely", () => {
    render(
      <SourceCard
        {...defaultProps}
        excerpt="Betrag: 100€ <script>alert('xss')</script>"
      />,
    );
    // The text is rendered as text content, not HTML
    expect(screen.getByText(/Betrag: 100€/)).toBeDefined();
    expect(screen.queryByText("alert('xss')")).toBeNull();
  });
});
