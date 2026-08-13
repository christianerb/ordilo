import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrdiloWordmark } from "@/components/ordilo/ordilo-wordmark";

describe("OrdiloWordmark", () => {
  it("renders the brand name with the animated mascot mark", () => {
    const { container } = render(<OrdiloWordmark mascotSize={30} />);

    expect(screen.getByText("Ordilo")).toBeDefined();
    expect(container.querySelector(".ordilo-wordmark")).not.toBeNull();
    expect(container.querySelector(".ordilo-mark")?.getAttribute("width")).toBe("30");
    expect(container.querySelector(".ordilo-wordmark__label")).not.toBeNull();
    expect(container.querySelectorAll(".ordilo-wordmark__sparkle")).toHaveLength(3);
  });
});
