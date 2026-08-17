import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OrdiloAccordion } from "@/components/ordilo/ordilo-accordion";

describe("OrdiloAccordion", () => {
  it("announces and toggles its disclosure state", () => {
    render(
      <OrdiloAccordion title="Weitere Angaben">
        <p>Zusätzlicher Inhalt</p>
      </OrdiloAccordion>,
    );

    const toggle = screen.getByRole("button", { name: "Weitere Angaben" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
