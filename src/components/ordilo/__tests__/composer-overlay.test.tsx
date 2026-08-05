import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ComposerOverlay } from "@/components/ordilo/composer-overlay";

describe("ComposerOverlay", () => {
  it("shows a personalized greeting when a name is given", () => {
    render(
      <ComposerOverlay
        value=""
        onValueChange={vi.fn()}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
        greetingName="Familie Müller"
      />,
    );
    expect(screen.getByText(/Familie Müller/)).toBeDefined();
  });

  it("renders a suggestion chip per recent query", () => {
    render(
      <ComposerOverlay
        value=""
        onValueChange={vi.fn()}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
        recentQueries={["Wann war der Elternabend?", "Wer hat den Impfpass?"]}
      />,
    );
    expect(screen.getByText("Wann war der Elternabend?")).toBeDefined();
    expect(screen.getByText("Wer hat den Impfpass?")).toBeDefined();
  });

  it("submits and closes when a suggestion chip is clicked", () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <ComposerOverlay
        value=""
        onValueChange={vi.fn()}
        onSubmit={onSubmit}
        onClose={onClose}
        recentQueries={["Wann war der Elternabend?"]}
      />,
    );
    fireEvent.click(screen.getByText("Wann war der Elternabend?"));
    expect(onSubmit).toHaveBeenCalledWith("Wann war der Elternabend?");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via the close button", () => {
    const onClose = vi.fn();
    render(
      <ComposerOverlay
        value=""
        onValueChange={vi.fn()}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId("composer-overlay-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <ComposerOverlay
        value=""
        onValueChange={vi.fn()}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("submits and closes when the bar itself is submitted", () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <ComposerOverlay
        value="Zeig mir Rechnungen"
        onValueChange={vi.fn()}
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /senden/i }));
    expect(onSubmit).toHaveBeenCalledWith("Zeig mir Rechnungen");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("locks and restores body scroll", () => {
    const { unmount } = render(
      <ComposerOverlay
        value=""
        onValueChange={vi.fn()}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
