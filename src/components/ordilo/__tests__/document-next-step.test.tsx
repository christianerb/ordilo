import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentNextStep } from "../document-next-step";
import { recordDocumentValueEvent } from "@/lib/analytics/first-value";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/analytics/first-value", () => ({ recordDocumentValueEvent: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("document next step", () => {
  it.each([
    [1, 1, "Zum Kalender", "/aufgaben?tab=planer", "calendar"],
    [0, 1, "Zu den Aufgaben", "/aufgaben", "tasks"],
    [0, 0, "Ordilo dazu fragen", `/suche?q=${encodeURIComponent("Was ist in „Testbrief“ wichtig? Bitte zeig mir die Fundstelle.")}`, "question"],
  ])("routes a saved result (%i, %i) to the right destination", (events, tasks, label, destination, kind) => {
    const leave = vi.fn();
    render(<DocumentNextStep documentId="doc-1" title="Testbrief" eventsCreated={Number(events)} tasksKept={Number(tasks)} onLeave={leave} />);
    fireEvent.click(screen.getByRole("button", { name: String(label) }));
    expect(leave).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith(destination);
    expect(recordDocumentValueEvent).toHaveBeenCalledWith({
      name: "document_next_step_selected", documentId: "doc-1", destination: kind,
    });
  });
});
