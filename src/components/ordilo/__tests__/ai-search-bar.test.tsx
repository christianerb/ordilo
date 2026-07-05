import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { AISearchBar } from "@/components/ordilo/ai-search-bar";

describe("AISearchBar", () => {
  it("renders a text input", () => {
    render(<AISearchBar onSubmit={vi.fn()} />);
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("renders the AI sparkle icon", () => {
    const { container } = render(<AISearchBar onSubmit={vi.fn()} />);
    // The sparkle icon is an SVG element inside the component.
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("renders a send button", () => {
    render(<AISearchBar onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: /senden/i })).toBeDefined();
  });

  it("calls onSubmit when Enter is pressed (without Shift)", () => {
    const onSubmit = vi.fn();
    render(<AISearchBar onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Zeig mir Dokumente" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(onSubmit).toHaveBeenCalledWith("Zeig mir Dokumente");
  });

  it("does not call onSubmit when Shift+Enter is pressed", () => {
    const onSubmit = vi.fn();
    render(<AISearchBar onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Mehrzeilige\nEingabe" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit when the send button is clicked", () => {
    const onSubmit = vi.fn();
    render(<AISearchBar onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Finde Rechnung" } });
    fireEvent.click(screen.getByRole("button", { name: /senden/i }));
    expect(onSubmit).toHaveBeenCalledWith("Finde Rechnung");
  });

  it("does not call onSubmit when input is empty or whitespace only", () => {
    const onSubmit = vi.fn();
    render(<AISearchBar onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears the input after successful submit via Enter", () => {
    render(<AISearchBar onSubmit={vi.fn()} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Test query" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(input.value).toBe("");
  });

  it("clears the input after successful submit via button", () => {
    render(<AISearchBar onSubmit={vi.fn()} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Test query" } });
    fireEvent.click(screen.getByRole("button", { name: /senden/i }));
    expect(input.value).toBe("");
  });

  it("accepts an initial value", () => {
    render(<AISearchBar onSubmit={vi.fn()} initialValue="Vorausgefüllt" />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.value).toBe("Vorausgefüllt");
  });

  it("disables input and button when isLoading is true", () => {
    render(<AISearchBar onSubmit={vi.fn()} isLoading={true} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    const button = screen.getByRole("button", {
      name: /senden/i,
    }) as HTMLButtonElement;
    expect(input.disabled).toBe(true);
    expect(button.disabled).toBe(true);
  });

  it("does not call onSubmit when disabled (isLoading)", () => {
    const onSubmit = vi.fn();
    render(<AISearchBar onSubmit={onSubmit} isLoading={true} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Test" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("uses the provided placeholder text", () => {
    render(
      <AISearchBar
        onSubmit={vi.fn()}
        placeholder="Frage Ordilo…"
      />,
    );
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.getAttribute("placeholder")).toBe("Frage Ordilo…");
  });
});

describe("AISearchBar — Controlled mode", () => {
  it("renders the provided value when controlled", () => {
    render(
      <AISearchBar
        onSubmit={vi.fn()}
        value="Vorausgefüllt"
        onValueChange={vi.fn()}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.value).toBe("Vorausgefüllt");
  });

  it("calls onValueChange when the user types in controlled mode", () => {
    const onValueChange = vi.fn();
    render(
      <AISearchBar
        onSubmit={vi.fn()}
        value=""
        onValueChange={onValueChange}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Neuer Text" } });
    expect(onValueChange).toHaveBeenCalledWith("Neuer Text");
  });

  it("does not call onSubmit when the controlled value is empty", () => {
    const onSubmit = vi.fn();
    render(
      <AISearchBar
        onSubmit={onSubmit}
        value=""
        onValueChange={vi.fn()}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with the controlled value and clears via onValueChange", () => {
    const onSubmit = vi.fn();
    const onValueChange = vi.fn();
    render(
      <AISearchBar
        onSubmit={onSubmit}
        value="Finde Rechnung"
        onValueChange={onValueChange}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(onSubmit).toHaveBeenCalledWith("Finde Rechnung");
    // After submit, the bar clears by notifying the parent.
    expect(onValueChange).toHaveBeenCalledWith("");
  });

  it("allows the parent to pre-fill the bar without submitting (example-query population)", () => {
    const onSubmit = vi.fn();
    const onValueChange = vi.fn();
    render(
      <AISearchBar
        onSubmit={onSubmit}
        value="Zeig mir alle Dokumente von Emma"
        onValueChange={onValueChange}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    // The query is visible and editable, but not auto-submitted.
    expect(input.value).toBe("Zeig mir alle Dokumente von Emma");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
