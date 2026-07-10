import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { OrdiloMascot } from "@/components/ordilo/mascot";

describe("OrdiloMascot", () => {
  it("renders an svg with the given size", () => {
    const { container } = render(<OrdiloMascot size={32} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
  });

  it("defaults to a 40px idle mascot", () => {
    const { container } = render(<OrdiloMascot />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("40");
  });

  it("renders open eyes (two dots) for idle mood", () => {
    const { container } = render(<OrdiloMascot mood="idle" />);
    expect(container.querySelectorAll("circle").length).toBeGreaterThanOrEqual(2);
  });

  it("renders closed eyes (no eye dots) for sleepy mood", () => {
    const { container } = render(<OrdiloMascot mood="sleepy" />);
    // Sleepy has no open-eye dots and no apricot blush dot.
    expect(container.querySelectorAll("circle").length).toBe(0);
  });

  it("renders an apricot blush accent for greeting mood", () => {
    const { container } = render(<OrdiloMascot mood="greeting" />);
    const accent = Array.from(container.querySelectorAll("circle")).find(
      (c) => c.getAttribute("fill") === "var(--apricot)",
    );
    expect(accent).toBeDefined();
  });

  it("does not render an apricot accent for idle mood", () => {
    const { container } = render(<OrdiloMascot mood="idle" />);
    const accent = Array.from(container.querySelectorAll("circle")).find(
      (c) => c.getAttribute("fill") === "var(--apricot)",
    );
    expect(accent).toBeUndefined();
  });

  it("applies the breathing animation class by default", () => {
    const { container } = render(<OrdiloMascot />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("ordilo-mascot-breathe");
  });

  it("omits idle animation classes when animate is false", () => {
    const { container } = render(<OrdiloMascot animate={false} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class") ?? "").not.toContain("ordilo-mascot-breathe");
  });

  it("applies the bounce animation for success mood regardless of animate", () => {
    const { container } = render(<OrdiloMascot mood="success" animate={false} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("ordilo-mascot-bounce");
  });

  it("is hidden from assistive tech (decorative)", () => {
    const { container } = render(<OrdiloMascot />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("forwards a custom className", () => {
    const { container } = render(<OrdiloMascot className="custom-class" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("custom-class");
  });
});
