import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrdiloMark } from "@/components/ordilo/ordilo-mark";

describe("OrdiloMark", () => {
  it("renders the compact hexagon elephant at the requested size", () => {
    const { container } = render(<OrdiloMark size={36} />);
    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("width")).toBe("36");
    expect(svg?.getAttribute("height")).toBe("36");
    expect(svg?.getAttribute("class") ?? "").not.toContain("ordilo-mark--alive");
    expect(container.querySelector('[data-part="elephant-silhouette"]')).not.toBeNull();
    expect(container.querySelector('[data-part="ear"]')).not.toBeNull();
    expect(container.querySelector(".ordilo-mark__eye")).not.toBeNull();
    expect(container.querySelector(".ordilo-mark__tusk")).not.toBeNull();
  });

  it("only animates when a contextual brand moment opts in", () => {
    const { container } = render(<OrdiloMark animate />);
    expect(container.querySelector("svg")?.getAttribute("class")).toContain(
      "ordilo-mark--alive",
    );
  });
});
