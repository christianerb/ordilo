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
    fireEvent.click(screen.getByRole("button", { name: /senden/i }));

    expect(onSearch).toHaveBeenCalledWith("Wann war der Elternabend?");
    expect(input.value).toBe("");
  });

  it("does not submit on Enter — it only inserts a newline", () => {
    const onSearch = vi.fn();
    render(<MobileComposer onSearch={onSearch} onScan={vi.fn()} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Wann war der Elternabend?" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("refuses a second question while an answer is still streaming", () => {
    // Without this the bar looked ready mid-stream, cleared the textarea on
    // submit, and the question was dropped by the /suche handler.
    const onSearch = vi.fn();
    render(<MobileComposer onSearch={onSearch} onScan={vi.fn()} isLoading />);

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

  it("opens the scanner from inside the bar, next to the mic", () => {
    // The scan button used to sit beside the bar and cost ~60px of the
    // 393px a phone has, which is why the input was ~23 characters wide.
    const onScan = vi.fn();
    const { container } = render(
      <MobileComposer onSearch={vi.fn()} onScan={onScan} />,
    );

    const scan = screen.getByTestId("composer-scan-button");
    expect(scan).toHaveAttribute("aria-label", "Scannen");
    // Inside the search bar, not a sibling of it.
    expect(
      container.querySelector('[data-testid="ai-search-bar"]')!.contains(scan),
    ).toBe(true);

    fireEvent.click(scan);
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it("gives the text its own full-width row above the controls", () => {
    render(<MobileComposer onSearch={vi.fn()} onScan={vi.fn()} />);
    const input = screen.getByRole("textbox");
    // w-full instead of flex-1 next to the buttons — the stacked layout is
    // what frees the width (measured: 201px to 335px at 393px viewport).
    expect(input.className).toContain("w-full");
  });

  it("disables scanning while an answer streams, like the rest of the bar", () => {
    const onScan = vi.fn();
    render(<MobileComposer onSearch={vi.fn()} onScan={onScan} isLoading />);
    const scan = screen.getByTestId("composer-scan-button") as HTMLButtonElement;
    expect(scan.disabled).toBe(true);
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
