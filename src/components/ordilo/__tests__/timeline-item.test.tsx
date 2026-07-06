import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { TimelineItem } from "@/components/ordilo/timeline-item";
import type { TimelineEvent } from "@/lib/profile-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  overrides: Partial<TimelineEvent> = {},
): TimelineEvent {
  return {
    type: "document",
    date: "2026-07-15",
    title: "Kita-Brief für Emma",
    description: "Schule",
    documentId: "doc-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TimelineItem", () => {
  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  it("renders the title", () => {
    render(<TimelineItem event={makeEvent({ title: "Stromrechnung" })} />);
    expect(screen.getByText("Stromrechnung")).toBeDefined();
  });

  it("renders the formatted German date", () => {
    render(<TimelineItem event={makeEvent({ date: "2026-07-15" })} />);
    expect(screen.getByText(/15\.07\.2026/)).toBeDefined();
  });

  it("renders the description when provided", () => {
    render(
      <TimelineItem
        event={makeEvent({ description: "Rechnung bezahlen" })}
      />,
    );
    expect(screen.getByText("Rechnung bezahlen")).toBeDefined();
  });

  it("does not render description when omitted", () => {
    render(<TimelineItem event={makeEvent({ description: undefined })} />);
    // Only the date and title should be present
    expect(screen.queryByText("Rechnung bezahlen")).toBeNull();
  });

  it("has data-testid='timeline-item'", () => {
    render(<TimelineItem event={makeEvent()} />);
    expect(screen.getByTestId("timeline-item")).toBeDefined();
  });

  it("has data-type attribute matching the event type", () => {
    render(<TimelineItem event={makeEvent({ type: "task" })} />);
    expect(
      screen.getByTestId("timeline-item").getAttribute("data-type"),
    ).toBe("task");
  });

  // ---------------------------------------------------------------------------
  // Visual structure: connector + dot + content
  // ---------------------------------------------------------------------------

  it("renders a vertical connector element", () => {
    render(<TimelineItem event={makeEvent()} />);
    expect(screen.getByTestId("timeline-connector")).toBeDefined();
  });

  it("renders a dot element", () => {
    render(<TimelineItem event={makeEvent()} />);
    expect(screen.getByTestId("timeline-dot")).toBeDefined();
  });

  it("renders a content card element", () => {
    render(<TimelineItem event={makeEvent()} />);
    expect(screen.getByTestId("timeline-content")).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Icons per event type
  // ---------------------------------------------------------------------------

  it("renders a document icon for document events", () => {
    render(<TimelineItem event={makeEvent({ type: "document" })} />);
    const dot = screen.getByTestId("timeline-dot");
    expect(dot.querySelector("svg")).not.toBeNull();
  });

  it("renders a calendar icon for task events", () => {
    render(<TimelineItem event={makeEvent({ type: "task" })} />);
    const dot = screen.getByTestId("timeline-dot");
    expect(dot.querySelector("svg")).not.toBeNull();
  });

  it("renders a clock icon for date events", () => {
    render(<TimelineItem event={makeEvent({ type: "date" })} />);
    const dot = screen.getByTestId("timeline-dot");
    expect(dot.querySelector("svg")).not.toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Interaction: clickable to navigate to document
  // ---------------------------------------------------------------------------

  it("does not render a link when onClick is not provided", () => {
    render(<TimelineItem event={makeEvent()} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders a clickable link when onClick is provided", () => {
    const onClick = vi.fn();
    render(<TimelineItem event={makeEvent()} onClick={onClick} />);
    const link = screen.getByRole("button");
    expect(link).toBeDefined();
  });

  it("calls onClick when the content card is clicked", () => {
    const onClick = vi.fn();
    render(<TimelineItem event={makeEvent()} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Last item (no connector line below)
  // ---------------------------------------------------------------------------

  it("renders the connector when isLast is false (default)", () => {
    render(<TimelineItem event={makeEvent()} />);
    expect(screen.getByTestId("timeline-connector")).toBeDefined();
  });

  it("hides the connector when isLast is true", () => {
    render(<TimelineItem event={makeEvent()} isLast />);
    const connector = screen.getByTestId("timeline-connector");
    // The connector element still exists but should be hidden
    expect(connector.className).toContain("hidden");
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it("handles an event with no documentId", () => {
    render(
      <TimelineItem event={makeEvent({ documentId: undefined })} />,
    );
    expect(screen.getByTestId("timeline-item")).toBeDefined();
  });
});
