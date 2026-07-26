import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  ProcessingChecklist,
  type ToolCallProgress,
} from "@/app/(app)/suche/processing-checklist";

/**
 * The checklist used to advance on a 700ms timer and pick its step set with
 * Math.random(), so it ticked off work — "Prüfe Aufgaben und Fristen ✓" —
 * that may never have run. These tests pin the replacement: every line
 * corresponds to a tool call the server actually reported.
 */
describe("ProcessingChecklist", () => {
  it("claims nothing beyond reading the question before any tool runs", () => {
    render(<ProcessingChecklist />);

    const steps = screen.getAllByTestId("processing-step");
    expect(steps).toHaveLength(1);
    expect(steps[0].getAttribute("data-status")).toBe("active");
    expect(steps[0].textContent).toMatch(/Liest deine Frage/);
  });

  it("invents no steps for tools that were never called", () => {
    render(
      <ProcessingChecklist
        toolCalls={[{ toolName: "search_documents", state: "start" }]}
      />,
    );

    expect(screen.getAllByTestId("processing-step")).toHaveLength(1);
    expect(screen.queryByText(/Aufgaben und Fristen/)).toBeNull();
  });

  it("shows a running tool as active and a finished one as done", () => {
    const calls: ToolCallProgress[] = [
      { toolName: "search_documents", state: "done" },
      { toolName: "list_tasks", state: "start" },
    ];
    render(<ProcessingChecklist toolCalls={calls} />);

    const steps = screen.getAllByTestId("processing-step");
    expect(steps).toHaveLength(2);
    expect(steps[0].getAttribute("data-status")).toBe("done");
    expect(steps[0].textContent).toMatch(/Durchsucht deine Dokumente/);
    expect(steps[1].getAttribute("data-status")).toBe("active");
    expect(steps[1].textContent).toMatch(/Prüft Aufgaben und Fristen/);
  });

  it("marks a failed tool instead of quietly ticking it off", () => {
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
