import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DateEditControl } from "@/components/ordilo/review-card/edit-controls";

describe("DateEditControl", () => {
  it("reveals the date input (German format) when the edit button is clicked", () => {
    render(<DateEditControl value="2026-08-06" label="Datum" onChange={vi.fn()} />);

    // Initially just the pencil edit button — no text field.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("edit-date-button"));

    // The DateInput text field shows the date in German TT.MM.JJJJ format.
    expect(screen.getByRole("textbox")).toHaveValue("06.08.2026");
  });

  it("picks a calendar day, calls onChange with the ISO date, and closes", () => {
    const onChange = vi.fn();
    render(<DateEditControl value="2026-08-06" label="Datum" onChange={onChange} />);

    fireEvent.click(screen.getByTestId("edit-date-button"));
    fireEvent.click(screen.getByTestId("date-input-calendar-trigger"));
    fireEvent.click(
      screen.getByRole("button", { name: "10. August 2026 auswählen" }),
    );

    expect(onChange).toHaveBeenCalledWith("2026-08-10");
    // Editor closed — back to the pencil edit button.
    expect(screen.getByTestId("edit-date-button")).toBeInTheDocument();
  });

  it("calls onChange and closes once a full date is typed", () => {
    const onChange = vi.fn();
    render(<DateEditControl value="2026-08-06" label="Datum" onChange={onChange} />);

    fireEvent.click(screen.getByTestId("edit-date-button"));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "10.08.2026" },
    });

    expect(onChange).toHaveBeenCalledWith("2026-08-10");
    expect(screen.getByTestId("edit-date-button")).toBeInTheDocument();
  });

  it("closes on Escape without calling onChange", () => {
    const onChange = vi.fn();
    render(<DateEditControl value="2026-08-06" label="Datum" onChange={onChange} />);

    fireEvent.click(screen.getByTestId("edit-date-button"));
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("edit-date-button")).toBeInTheDocument();
  });

  it("shows an add button in showAddButton mode and reveals the input on click", () => {
    render(
      <DateEditControl
        value=""
        label="Frist hinzufügen"
        onChange={vi.fn()}
        showAddButton
        compact
      />,
    );

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("add-date-button"));

    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
