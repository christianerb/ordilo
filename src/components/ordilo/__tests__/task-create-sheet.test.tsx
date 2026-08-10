import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mockFrom }),
}));

import { TaskCreateSheet } from "@/components/ordilo/task-create-sheet";

describe("TaskCreateSheet", () => {
  it("rejects a manually entered due date in the past", () => {
    render(
      <TaskCreateSheet
        open
        onOpenChange={vi.fn()}
        familyId="family-1"
        members={[]}
        onCreated={vi.fn()}
      />,
    );

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
