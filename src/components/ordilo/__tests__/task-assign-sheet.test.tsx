import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { TaskAssignSheet } from "@/components/ordilo/task-assign-sheet";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const members = [
  { id: "m1", name: "Christian", role: "Vater" },
  { id: "m2", name: "Karina", role: "Mutter" },
];

function renderSheet(
  overrides: Partial<React.ComponentProps<typeof TaskAssignSheet>> = {},
) {
  const props: React.ComponentProps<typeof TaskAssignSheet> = {
    task: { id: "task-1", title: "Trikot waschen", assigned_to: null },
    members,
    open: true,
    onOpenChange: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };
  render(<TaskAssignSheet {...props} />);
  return props;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TaskAssignSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks the question in plain German and names the task", () => {
    renderSheet();
    expect(screen.getByText("Wer macht das?")).toBeDefined();
    expect(screen.getByText("Trikot waschen")).toBeDefined();
  });

  it("lists every family member with their role", () => {
    renderSheet();
    expect(screen.getByText("Christian")).toBeDefined();
    expect(screen.getByText("Vater")).toBeDefined();
    expect(screen.getByText("Karina")).toBeDefined();
  });

  it("commits the choice and closes — there is no save step", () => {
    const props = renderSheet();

    fireEvent.click(screen.getByTestId("task-assign-m2"));

    expect(props.onSelect).toHaveBeenCalledWith("m2");
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("marks whoever already has the task", () => {
    renderSheet({
      task: { id: "task-1", title: "Trikot waschen", assigned_to: "m1" },
    });

    expect(
      screen.getByTestId("task-assign-m1").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByTestId("task-assign-m2").getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("can hand the task back to nobody", () => {
    const props = renderSheet({
      task: { id: "task-1", title: "Trikot waschen", assigned_to: "m1" },
    });

    fireEvent.click(screen.getByTestId("task-assign-none"));

    expect(props.onSelect).toHaveBeenCalledWith(null);
  });

  it("shows a member's photo when there is one", () => {
    renderSheet({ memberPhotoUrls: { m1: "https://example.test/karina.jpg" } });

    const photos = screen.getAllByTestId("member-avatar-photo");
    expect(photos).toHaveLength(1);
    expect(photos[0].getAttribute("src")).toBe(
      "https://example.test/karina.jpg",
    );
  });
});
