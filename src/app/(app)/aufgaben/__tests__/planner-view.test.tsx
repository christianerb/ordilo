import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSearchParamsGet = vi.fn<(key: string) => string | null>(() => null);

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: mockSearchParamsGet }),
}));

import { PlannerView } from "@/app/(app)/aufgaben/planner-view";
import { usePlannerActionsOptional } from "@/app/(app)/aufgaben/planner-actions-context";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

function renderView(familyId: string | null = "family-1") {
  render(
    <PlannerView
      familyId={familyId}
      tasks={<div data-testid="tasks-view">Aufgabenansicht</div>}
      calendar={<div data-testid="calendar-view">Kalenderansicht</div>}
    />,
  );
}

/** Registers a spy as the mounted view's create handler. */
function CreateHandlerSpy({ handler }: { handler: () => void }) {
  const actions = usePlannerActionsOptional();
  useMountEffect(() => {
    actions?.setCreateHandler(handler);
    return () => actions?.setCreateHandler(null);
  });
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParamsGet.mockReturnValue(null);
});

describe("PlannerView", () => {
  it("shows the Aufgaben view by default", () => {
    renderView();
    expect(screen.getByTestId("tasks-view")).toBeInTheDocument();
    expect(screen.queryByTestId("calendar-view")).not.toBeInTheDocument();
  });

  it("shows the Planer view when the URL says ?tab=planer", () => {
    mockSearchParamsGet.mockImplementation((key: string) =>
      key === "tab" ? "planer" : null,
    );
    renderView();
    expect(screen.getByTestId("calendar-view")).toBeInTheDocument();
    expect(screen.queryByTestId("tasks-view")).not.toBeInTheDocument();
  });

  it("labels the header action after the active view", () => {
    const { unmount } = render(
      <PlannerView
        familyId="family-1"
        tasks={<div>Aufgabenansicht</div>}
        calendar={<div>Kalenderansicht</div>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Neue Aufgabe" }),
    ).toBeInTheDocument();
    unmount();

    mockSearchParamsGet.mockImplementation((key: string) =>
      key === "tab" ? "planer" : null,
    );
    renderView();
    expect(screen.getByRole("button", { name: "Termin" })).toBeInTheDocument();
  });

  it("hides the header action without a family", () => {
    renderView(null);
    expect(
      screen.queryByTestId("planner-create-button"),
    ).not.toBeInTheDocument();
  });

  it("calls the mounted view's registered create handler", () => {
    const openCreate = vi.fn();
    render(
      <PlannerView
        familyId="family-1"
        tasks={<CreateHandlerSpy handler={openCreate} />}
        calendar={<div>Kalenderansicht</div>}
      />,
    );

    fireEvent.click(screen.getByTestId("planner-create-button"));
    expect(openCreate).toHaveBeenCalledTimes(1);
  });
});
