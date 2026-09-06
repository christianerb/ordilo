import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FIRST_VALUE_EXAMPLE as example } from "@ordilo/document-contract";
import { FirstValueExample } from "../first-value-example";

describe("first value example", () => {
  it("offers the real entry explicitly, without starting it automatically", () => {
    const next = vi.fn();
    render(<FirstValueExample onContinue={next} />);
    fireEvent.click(screen.getByRole("button", { name: "Ohne eigenen Brief ausprobieren" }));
    fireEvent.click(screen.getByRole("button", { name: example.question }));
    expect(next).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mit eigenem Brief loslegen" }));
    expect(next).toHaveBeenCalledOnce();
  });
  it("reveals a labelled example and grounded answer without any network request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<FirstValueExample />);
    const open = screen.getByRole("button", { name: "Ohne eigenen Brief ausprobieren" });
    expect(open).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(open);
    expect(screen.getByText(example.notice)).toBeVisible();
    expect(screen.getByText(example.letter)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: example.question }));
    expect(screen.getByRole("heading", { name: example.answer })).toBeVisible();
    expect(screen.getByText(`„${example.quote}“`)).toBeVisible();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("lets the user close and restart without retaining a fake result", () => {
    render(<FirstValueExample />);
    fireEvent.click(screen.getByRole("button", { name: "Ohne eigenen Brief ausprobieren" }));
    fireEvent.click(screen.getByRole("button", { name: example.question }));
    fireEvent.click(screen.getByRole("button", { name: "Beispiel schließen" }));
    expect(screen.queryByText(example.answer)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ohne eigenen Brief ausprobieren" }));
    expect(screen.getByText(example.letter)).toBeVisible();
    expect(screen.queryByRole("heading", { name: example.answer })).not.toBeInTheDocument();
  });
});
