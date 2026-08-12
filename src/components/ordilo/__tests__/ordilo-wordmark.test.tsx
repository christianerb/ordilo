import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrdiloWordmark } from "@/components/ordilo/ordilo-wordmark";

describe("OrdiloWordmark", () => {
  it("renders the brand name with the mascot mark", () => {
    const { container } = render(<OrdiloWordmark mascotSize={30} />);

    expect(screen.getByText("Ordilo")).toBeDefined();
    expect(container.querySelector(".ordilo-wordmark")).not.toBeNull();
    expect(container.querySelector(".ordilo-wordmark__mascot svg")?.getAttribute("width")).toBe("30");
    expect(container.querySelector(".ordilo-wordmark__label")).not.toBeNull();
  });

  it("carries no decorative sparkle elements (DESIGN.md motion contract)", () => {
    const { container } = render(<OrdiloWordmark />);

    // The mark lives in persistent navigation — decorative sparkles and
    // entrance flourishes were removed to comply with the motion rules.
    expect(container.querySelectorAll(".ordilo-wordmark__sparkle")).toHaveLength(0);
  });
});
