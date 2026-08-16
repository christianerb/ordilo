import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mockFrom }),
}));

import { TaskCreateSheet } from "@/components/ordilo/task-create-sheet";
import { resolveSchedulePreset, todayLocalDate } from "@/lib/task-utils";

const members = [
  { id: "m1", name: "Christian", role: "Vater" },
  { id: "m2", name: "Karina", role: "Mutter" },
];

function renderSheet(
  overrides: Partial<React.ComponentProps<typeof TaskCreateSheet>> = {},
) {
  const props: React.ComponentProps<typeof TaskCreateSheet> = {
    open: true,
    onOpenChange: vi.fn(),
    familyId: "family-1",
    members,
    onCreated: vi.fn(),
    ...overrides,
  };
  render(<TaskCreateSheet {...props} />);
  return props;
}

describe("TaskCreateSheet", () => {
  it("offers the same quick days as the detail sheet", () => {
    renderSheet();

    // Creating and editing a task are the same job; they should not have
    // different vocabularies.
    fireEvent.click(screen.getByTestId("task-create-due-tomorrow"));
    expect(
      screen.getByTestId("task-create-due-tomorrow").getAttribute("aria-pressed"),
    ).toBe("true");

    const tomorrow = resolveSchedulePreset("tomorrow", todayLocalDate())!;
    const [year, month, day] = tomorrow.split("-");
    expect(
      (screen.getByTestId("task-create-due-date") as HTMLInputElement).value,
    ).toBe(`${day}.${month}.${year}`);
  });

  it("lets a tapped quick day be tapped off again", () => {
    renderSheet();

    fireEvent.click(screen.getByTestId("task-create-due-today"));
    fireEvent.click(screen.getByTestId("task-create-due-today"));

    expect(
      (screen.getByTestId("task-create-due-date") as HTMLInputElement).value,
    ).toBe("");
  });

  it("picks the assignee with faces rather than a dropdown", () => {
    renderSheet();

    fireEvent.click(screen.getByTestId("task-create-assignee-m2"));
    expect(
      screen.getByTestId("task-create-assignee-m2").getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByTestId("task-create-assignee-none").getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("starts on the member the list is filtered to", () => {
    // Looking at Karina's tasks and tapping "+" almost always means "and
    // one more for Karina".
    renderSheet({ defaultAssignee: "m2" });

    expect(
      screen.getByTestId("task-create-assignee-m2").getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("starts on nobody when the whole family is shown", () => {
    renderSheet();

    expect(
      screen.getByTestId("task-create-assignee-none").getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("offers no assignee picker in a family without members", () => {
    renderSheet({ members: [] });
    expect(screen.queryByTestId("task-create-assignee-section")).toBeNull();
  });

  it("rejects a manually entered due date in the past", () => {
    renderSheet({ members: [] });

    fireEvent.change(screen.getByTestId("task-create-title"), {
      target: { value: "Stromrechnung bezahlen" },
    });
    fireEvent.change(screen.getByTestId("task-create-due-date"), {
      target: { value: "01.01.2000" },
    });
    fireEvent.click(screen.getByTestId("task-create-save"));

    expect(
      screen.getByText("Bitte wähle heute oder einen späteren Tag."),
    ).toBeInTheDocument();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
