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
    render(<MobileComposer onSearch={onSearch} onScan={vi.fn()} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Wann war der Elternabend?" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    expect(onSearch).toHaveBeenCalledWith("Wann war der Elternabend?");
    expect(input.value).toBe("");
  });

  it("refuses a second question while an answer is still streaming", () => {
    // Without this the bar looked ready mid-stream, cleared the textarea on
    // submit, and the question was dropped by the /suche handler.
    const onSearch = vi.fn();
    render(<MobileComposer onSearch={onSearch} onScan={vi.fn()} isLoading />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "Und die Frist?" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(onSearch).not.toHaveBeenCalled();

    expect(
      (screen.getByRole("button", { name: /senden/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("opens the scanner from its own button", () => {
    const onScan = vi.fn();
    render(<MobileComposer onSearch={vi.fn()} onScan={onScan} />);
    fireEvent.click(screen.getByRole("button", { name: /scannen/i }));
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it("publishes its height so page content can clear the fixed bar", () => {
    const { unmount } = render(
      <MobileComposer onSearch={vi.fn()} onScan={vi.fn()} />,
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
