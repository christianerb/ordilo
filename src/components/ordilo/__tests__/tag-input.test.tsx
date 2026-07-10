import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TagInput } from "@/components/ordilo/tag-input";

describe("TagInput", () => {
  it("renders existing tags as chips", () => {
    render(<TagInput value={["Auto", "Versicherung"]} onChange={vi.fn()} />);
    expect(screen.getByText("Auto")).toBeInTheDocument();
    expect(screen.getByText("Versicherung")).toBeInTheDocument();
  });

  it("converts text into a tag as soon as a comma is typed", () => {
    const onChange = vi.fn();
    render(<TagInput value={[]} onChange={onChange} testId="tags" />);
    const input = screen.getByTestId("tags-input");
    fireEvent.change(input, { target: { value: "Autokennzeichen," } });
    expect(onChange).toHaveBeenCalledWith(["Autokennzeichen"]);
  });

  it("splits a pasted comma-separated string into multiple tags", () => {
    const onChange = vi.fn();
    render(<TagInput value={[]} onChange={onChange} testId="tags" />);
    const input = screen.getByTestId("tags-input");
    fireEvent.change(input, { target: { value: "a, b, c," } });
    expect(onChange).toHaveBeenCalledWith(["a", "b", "c"]);
  });

  it("commits the current text as a tag on Enter", () => {
    const onChange = vi.fn();
    render(<TagInput value={[]} onChange={onChange} testId="tags" />);
    const input = screen.getByTestId("tags-input");
    fireEvent.change(input, { target: { value: "Bester Freund" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["Bester Freund"]);
  });

  it("does not add duplicate tags", () => {
    const onChange = vi.fn();
    render(<TagInput value={["Auto"]} onChange={onChange} testId="tags" />);
    const input = screen.getByTestId("tags-input");
    fireEvent.change(input, { target: { value: "Auto," } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a tag when its remove button is clicked", () => {
    const onChange = vi.fn();
    render(<TagInput value={["Auto", "Versicherung"]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Tag "Auto" entfernen'));
    expect(onChange).toHaveBeenCalledWith(["Versicherung"]);
  });

  it("removes the last tag on Backspace when the input is empty", () => {
    const onChange = vi.fn();
    render(<TagInput value={["Auto", "Versicherung"]} onChange={onChange} testId="tags" />);
    const input = screen.getByTestId("tags-input");
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(onChange).toHaveBeenCalledWith(["Auto"]);
  });

  it("does not remove a tag on Backspace when the input has text", () => {
    const onChange = vi.fn();
    render(<TagInput value={["Auto"]} onChange={onChange} testId="tags" />);
    const input = screen.getByTestId("tags-input");
    fireEvent.change(input, { target: { value: "Versi" } });
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
