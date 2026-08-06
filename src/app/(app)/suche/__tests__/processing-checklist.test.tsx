import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  ProcessingChecklist,
  type ToolCallProgress,
} from "@/app/(app)/suche/processing-checklist";

/**
 * The status display used to be an accumulating checklist — one line per
 * tool call, so a multi-search question read like a four-step protocol.
 * These tests pin the replacement: a single live status line that shows
 * only what is happening right now. Every label still corresponds to a
 * tool call the server actually reported — nothing is invented.
 */
describe("ProcessingChecklist", () => {
  it("shows a single thinking line before any tool runs", () => {
    render(<ProcessingChecklist />);

    const steps = screen.getAllByTestId("processing-step");
    expect(steps).toHaveLength(1);
    expect(steps[0].getAttribute("data-status")).toBe("active");
    expect(steps[0].textContent).toMatch(/Ordilo denkt nach/);
  });

  it("shows only the current step, even when several tools already ran", () => {
    const calls: ToolCallProgress[] = [
      { toolName: "search_documents", state: "done" },
      { toolName: "list_tasks", state: "start" },
    ];
    render(<ProcessingChecklist toolCalls={calls} />);

    // One line, not a checklist — the finished search collapsed into the
    // currently running step.
    const steps = screen.getAllByTestId("processing-step");
    expect(steps).toHaveLength(1);
    expect(steps[0].getAttribute("data-status")).toBe("active");
    expect(steps[0].textContent).toMatch(/Prüft Aufgaben und Fristen/);
    expect(screen.queryByText(/Durchsucht deine Dokumente/)).toBeNull();
  });

  it("switches to writing the answer once all tools are done", () => {
    render(
      <ProcessingChecklist
        toolCalls={[{ toolName: "search_documents", state: "done" }]}
      />,
    );

    const step = screen.getByTestId("processing-step");
    expect(step.getAttribute("data-status")).toBe("done");
    expect(step.textContent).toMatch(/Schreibt die Antwort/);
  });

  it("marks a failed tool instead of quietly moving on", () => {
    render(
      <ProcessingChecklist
        toolCalls={[{ toolName: "search_documents", state: "error" }]}
      />,
    );

    const step = screen.getByTestId("processing-step");
    expect(step.getAttribute("data-status")).toBe("error");
    expect(step.textContent).toMatch(/hat nicht geklappt/);
  });

  it("falls back to a neutral label for an unknown tool", () => {
    render(
      <ProcessingChecklist
        toolCalls={[{ toolName: "some_new_tool", state: "start" }]}
      />,
    );
    expect(screen.getByTestId("processing-step").textContent).toMatch(
      /Arbeitet/,
    );
  });

  it("announces progress to assistive tech", () => {
    render(<ProcessingChecklist />);
    const region = screen.getByTestId("processing-checklist");
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
  });
});
