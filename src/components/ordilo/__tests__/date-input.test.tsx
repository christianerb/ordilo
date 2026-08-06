import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DateInput } from "@/components/ordilo/date-input";

describe("DateInput", () => {
  it("renders an empty value as an empty text field", () => {
    render(<DateInput value="" onChange={vi.fn()} aria-label="Geburtsdatum" />);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("formats an ISO value as a German TT.MM.JJJJ text", () => {
    render(<DateInput value="1985-06-15" onChange={vi.fn()} aria-label="Geburtsdatum" />);
    expect(screen.getByRole("textbox")).toHaveValue("15.06.1985");
  });

  it("calls onChange with the ISO date once a full TT.MM.JJJJ is typed", () => {
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} aria-label="Geburtsdatum" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "15.06.1985" } });
    expect(onChange).toHaveBeenCalledWith("1985-06-15");
  });

  it("does not call onChange while the typed date is incomplete", () => {
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} aria-label="Geburtsdatum" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "15.06." } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not call onChange for an invalid calendar date (e.g. 31.02.)", () => {
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} aria-label="Geburtsdatum" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "31.02.2020" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("calls onChange with an empty string when the text is cleared", () => {
    const onChange = vi.fn();
    render(<DateInput value="1985-06-15" onChange={onChange} aria-label="Geburtsdatum" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("inserts dots automatically when only digits are typed (numeric keypad)", () => {
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} aria-label="Geburtsdatum" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "06082026" } });
    expect(screen.getByRole("textbox")).toHaveValue("06.08.2026");
    expect(onChange).toHaveBeenCalledWith("2026-08-06");
  });

  it("masks partial digit input while typing", () => {
    render(<DateInput value="" onChange={vi.fn()} aria-label="Geburtsdatum" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "0608" } });
    expect(screen.getByRole("textbox")).toHaveValue("06.08");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "06.08.2" } });
    expect(screen.getByRole("textbox")).toHaveValue("06.08.2");
  });

  it("does not call onChange for incomplete digit input", () => {
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} aria-label="Geburtsdatum" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "0608202" } });
    expect(screen.getByRole("textbox")).toHaveValue("06.08.202");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores extra digits beyond TT.MM.JJJJ", () => {
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} aria-label="Geburtsdatum" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "06082026999" } });
    expect(screen.getByRole("textbox")).toHaveValue("06.08.2026");
    expect(onChange).toHaveBeenCalledWith("2026-08-06");
  });

  it("converts a pasted ISO date (yyyy-mm-dd) to German text", () => {
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} aria-label="Geburtsdatum" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "2026-08-06" } });
    expect(screen.getByRole("textbox")).toHaveValue("06.08.2026");
    expect(onChange).toHaveBeenCalledWith("2026-08-06");
  });

  it("keeps one-digit dotted dates parseable (6.8.2026)", () => {
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} aria-label="Geburtsdatum" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "6.8.2026" } });
    expect(screen.getByRole("textbox")).toHaveValue("6.8.2026");
    expect(onChange).toHaveBeenCalledWith("2026-08-06");
  });

  it("rolls overflow digits into the next segment (06.082026)", () => {
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} aria-label="Geburtsdatum" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "06.082026" } });
    expect(screen.getByRole("textbox")).toHaveValue("06.08.2026");
    expect(onChange).toHaveBeenCalledWith("2026-08-06");
  });

  it("keeps a trailing dot while typing (06.08.)", () => {
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} aria-label="Geburtsdatum" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "06.08." } });
    expect(screen.getByRole("textbox")).toHaveValue("06.08.");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("opens the calendar popover showing the selected date's month", () => {
    render(<DateInput value="1985-06-15" onChange={vi.fn()} aria-label="Geburtsdatum" />);
    fireEvent.click(screen.getByTestId("date-input-calendar-trigger"));
    expect(screen.getByTestId("date-input-month-label")).toHaveTextContent("Juni 1985");
  });

  it("picks a day from the calendar and calls onChange with that ISO date", () => {
    const onChange = vi.fn();
    render(<DateInput value="1985-06-15" onChange={onChange} aria-label="Geburtsdatum" />);
    fireEvent.click(screen.getByTestId("date-input-calendar-trigger"));
    fireEvent.click(screen.getByRole("button", { name: "20. Juni 1985 auswählen" }));
    expect(onChange).toHaveBeenCalledWith("1985-06-20");
    expect(screen.getByRole("textbox")).toHaveValue("20.06.1985");
  });

  it("navigates to the next and previous month", () => {
    render(<DateInput value="1985-06-15" onChange={vi.fn()} aria-label="Geburtsdatum" />);
    fireEvent.click(screen.getByTestId("date-input-calendar-trigger"));
    fireEvent.click(screen.getByRole("button", { name: "Nächster Monat" }));
    expect(screen.getByTestId("date-input-month-label")).toHaveTextContent("Juli 1985");
    fireEvent.click(screen.getByRole("button", { name: "Vorheriger Monat" }));
    fireEvent.click(screen.getByRole("button", { name: "Vorheriger Monat" }));
    expect(screen.getByTestId("date-input-month-label")).toHaveTextContent("Mai 1985");
  });

  it("navigates across a year boundary", () => {
    render(<DateInput value="1985-12-15" onChange={vi.fn()} aria-label="Geburtsdatum" />);
    fireEvent.click(screen.getByTestId("date-input-calendar-trigger"));
    fireEvent.click(screen.getByRole("button", { name: "Nächster Monat" }));
    expect(screen.getByTestId("date-input-month-label")).toHaveTextContent("Januar 1986");
  });

  it("disables the input and calendar trigger when disabled", () => {
    render(<DateInput value="" onChange={vi.fn()} disabled aria-label="Geburtsdatum" />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByTestId("date-input-calendar-trigger")).toBeDisabled();
  });
});
