import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  ConfidenceBadge,
  getConfidenceLevel,
  CONFIDENCE_HIGH_THRESHOLD,
  CONFIDENCE_MEDIUM_THRESHOLD,
} from "@/components/ordilo/confidence-badge";

describe("ConfidenceBadge", () => {
  // ---------------------------------------------------------------------------
  // Percentage display
  // ---------------------------------------------------------------------------

  it("renders the rounded percentage for a high confidence value", () => {
    render(<ConfidenceBadge confidence={0.92} />);
    expect(screen.getByText("92%")).toBeDefined();
  });

  it("renders the rounded percentage for a medium confidence value", () => {
    render(<ConfidenceBadge confidence={0.75} />);
    expect(screen.getByText("75%")).toBeDefined();
  });

  it("renders the rounded percentage for a low confidence value", () => {
    render(<ConfidenceBadge confidence={0.65} />);
    expect(screen.getByText("65%")).toBeDefined();
  });

  it("renders 100% for confidence of 1", () => {
    render(<ConfidenceBadge confidence={1} />);
    expect(screen.getByText("100%")).toBeDefined();
  });

  it("renders 0% for confidence of 0", () => {
    render(<ConfidenceBadge confidence={0} />);
    expect(screen.getByText("0%")).toBeDefined();
  });

  it("rounds to the nearest integer", () => {
    render(<ConfidenceBadge confidence={0.854} />);
    // 0.854 * 100 = 85.4, rounds to 85
    expect(screen.getByText("85%")).toBeDefined();
  });

  it("clamps values above 1 to 100%", () => {
    render(<ConfidenceBadge confidence={1.5} />);
    expect(screen.getByText("100%")).toBeDefined();
  });

  it("clamps values below 0 to 0%", () => {
    render(<ConfidenceBadge confidence={-0.5} />);
    expect(screen.getByText("0%")).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Color coding (confidence level)
  // ---------------------------------------------------------------------------

  it("uses high (green) styling for confidence >= 0.85", () => {
    render(<ConfidenceBadge confidence={0.9} />);
    const badge = screen.getByTestId("confidence-badge");
    expect(badge.getAttribute("data-confidence-level")).toBe("high");
  });

  it("uses high (green) styling for confidence exactly 0.85", () => {
    render(<ConfidenceBadge confidence={0.85} />);
    const badge = screen.getByTestId("confidence-badge");
    expect(badge.getAttribute("data-confidence-level")).toBe("high");
  });

  it("uses medium (amber) styling for confidence >= 0.70 and < 0.85", () => {
    render(<ConfidenceBadge confidence={0.75} />);
    const badge = screen.getByTestId("confidence-badge");
    expect(badge.getAttribute("data-confidence-level")).toBe("medium");
  });

  it("uses medium (amber) styling for confidence exactly 0.70", () => {
    render(<ConfidenceBadge confidence={0.7} />);
    const badge = screen.getByTestId("confidence-badge");
    expect(badge.getAttribute("data-confidence-level")).toBe("medium");
  });

  it("uses low (red) styling for confidence < 0.70", () => {
    render(<ConfidenceBadge confidence={0.65} />);
    const badge = screen.getByTestId("confidence-badge");
    expect(badge.getAttribute("data-confidence-level")).toBe("low");
  });

  it("uses low (red) styling for confidence of 0", () => {
    render(<ConfidenceBadge confidence={0} />);
    const badge = screen.getByTestId("confidence-badge");
    expect(badge.getAttribute("data-confidence-level")).toBe("low");
  });

  // ---------------------------------------------------------------------------
  // Data attributes
  // ---------------------------------------------------------------------------

  it("sets data-confidence-value with the original (unclamped) value", () => {
    render(<ConfidenceBadge confidence={0.854} />);
    const badge = screen.getByTestId("confidence-badge");
    expect(badge.getAttribute("data-confidence-value")).toBe("0.854");
  });

  it("renders a colored dot indicator", () => {
    render(<ConfidenceBadge confidence={0.9} />);
    const badge = screen.getByTestId("confidence-badge");
    const dot = badge.querySelector("span > span");
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain("rounded-full");
  });

  // ---------------------------------------------------------------------------
  // getConfidenceLevel function
  // ---------------------------------------------------------------------------

  it("getConfidenceLevel returns 'high' for values >= 0.85", () => {
    expect(getConfidenceLevel(0.85)).toBe("high");
    expect(getConfidenceLevel(0.9)).toBe("high");
    expect(getConfidenceLevel(1)).toBe("high");
  });

  it("getConfidenceLevel returns 'medium' for values >= 0.70 and < 0.85", () => {
    expect(getConfidenceLevel(0.7)).toBe("medium");
    expect(getConfidenceLevel(0.75)).toBe("medium");
    expect(getConfidenceLevel(0.84)).toBe("medium");
  });

  it("getConfidenceLevel returns 'low' for values < 0.70", () => {
    expect(getConfidenceLevel(0)).toBe("low");
    expect(getConfidenceLevel(0.5)).toBe("low");
    expect(getConfidenceLevel(0.69)).toBe("low");
  });

  // ---------------------------------------------------------------------------
  // Threshold constants
  // ---------------------------------------------------------------------------

  it("exports the correct threshold constants", () => {
    expect(CONFIDENCE_HIGH_THRESHOLD).toBe(0.85);
    expect(CONFIDENCE_MEDIUM_THRESHOLD).toBe(0.7);
  });
});
