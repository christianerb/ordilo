import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { MobileComposer } from "@/components/ordilo/app-shell-navigation";

/**
 * The composer is the app's most-used control on a phone, so the mechanics
 * matter more than the looks: it must not accept a question it would drop,
 * its buttons must be thumb-sized, and it must report its own height so the
 * page below can stay clear of it.
 */
describe("MobileComposer", () => {
  it("submits a question and clears the field", () => {
    const onSearch = vi.fn();
    render(<MobileComposer onSearch={onSearch} onOpenActions={vi.fn()} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Wann war der Elternabend?" } });
    fireEvent.click(screen.getByRole("button", { name: /senden/i }));

    expect(onSearch).toHaveBeenCalledWith("Wann war der Elternabend?");
    expect(input.value).toBe("");
  });

  it("does not submit on Enter — it only inserts a newline", () => {
    const onSearch = vi.fn();
    render(<MobileComposer onSearch={onSearch} onOpenActions={vi.fn()} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Wann war der Elternabend?" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("refuses a second question while an answer is still streaming", () => {
    // Without this the bar looked ready mid-stream, cleared the textarea on
    // submit, and the question was dropped by the /suche handler.
    const onSearch = vi.fn();
    render(<MobileComposer onSearch={onSearch} onOpenActions={vi.fn()} isLoading />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "Und die Frist?" } });
    fireEvent.click(screen.getByRole("button", { name: /senden/i }));
    expect(onSearch).not.toHaveBeenCalled();

    expect(
      (screen.getByRole("button", { name: /senden/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("opens the shared + action sheet, not the scanner directly", () => {
    // Scanning used to sit inside the bar, next to the mic. It now lives
    // behind a separate + circle so the same control also reaches "Notiz
    // erstellen" and "Neue Sammlung" — the bar itself only calls back up.
    const onOpenActions = vi.fn();
    const { container } = render(
      <MobileComposer onSearch={vi.fn()} onOpenActions={onOpenActions} />,
    );

    const actions = screen.getByTestId("composer-actions-button");
    expect(actions).toHaveAttribute("aria-label", "Aktionen");
    // Beside the search bar, not inside it.
    expect(
      container.querySelector('[data-testid="ai-search-bar"]')!.contains(actions),
    ).toBe(false);

    fireEvent.click(actions);
    expect(onOpenActions).toHaveBeenCalledTimes(1);
  });

  it("disables the + button while an answer streams, like the rest of the bar", () => {
    render(<MobileComposer onSearch={vi.fn()} onOpenActions={vi.fn()} isLoading />);
    const actions = screen.getByTestId("composer-actions-button") as HTMLButtonElement;
    expect(actions.disabled).toBe(true);
  });

  it("zooms into the fullscreen overlay when the pill is focused", () => {
    render(
      <MobileComposer onSearch={vi.fn()} onOpenActions={vi.fn()} />,
    );
    expect(screen.queryByTestId("composer-overlay")).toBeNull();

    fireEvent.focus(screen.getByRole("textbox"));
    expect(screen.getByTestId("composer-overlay")).toBeDefined();
  });

  it("closes the overlay again without losing the draft", () => {
    render(<MobileComposer onSearch={vi.fn()} onOpenActions={vi.fn()} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Wo ist der Impfausweis?" } });
    fireEvent.focus(input);
    expect(screen.getByTestId("composer-overlay")).toBeDefined();

    fireEvent.click(screen.getByTestId("composer-overlay-close"));
    expect(screen.queryByTestId("composer-overlay")).toBeNull();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Wo ist der Impfausweis?",
    );
  });

  it("publishes its height so page content can clear the fixed bar", () => {
    const { unmount } = render(
      <MobileComposer onSearch={vi.fn()} onOpenActions={vi.fn()} />,
    );
    // jsdom reports 0-height boxes, so assert the contract (the variable is
    // set and cleaned up), not the value.
    expect(
      document.documentElement.style.getPropertyValue("--composer-height"),
    ).not.toBe("");

    unmount();
    expect(
      document.documentElement.style.getPropertyValue("--composer-height"),
    ).toBe("");
  });
});
