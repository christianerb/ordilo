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

  it("renders a clear profile eye for idle mood", () => {
    const { container } = render(<OrdiloMascot mood="idle" />);
    expect(container.querySelector('[data-part="eye"]')?.tagName).toBe("circle");
  });

  it("renders a closed profile eye for sleepy mood", () => {
    const { container } = render(<OrdiloMascot mood="sleepy" />);
    expect(container.querySelector('[data-part="eye"]')?.tagName).toBe("path");
  });

  it("renders an apricot blush accent for greeting mood", () => {
    const { container } = render(<OrdiloMascot mood="greeting" />);
    expect(container.querySelector('[data-part="blush"]')).not.toBeNull();
  });

  it("does not render an apricot accent for idle mood", () => {
    const { container } = render(<OrdiloMascot mood="idle" />);
    expect(container.querySelector('[data-part="blush"]')).toBeNull();
  });

  it("uses filled elephant anatomy instead of an abstract line face", () => {
    const { container } = render(<OrdiloMascot />);

    expect(container.querySelector('[data-part="body"]')?.getAttribute("fill")).toBe("currentColor");
    expect(container.querySelector('[data-part="ear"]')).not.toBeNull();
    expect(container.querySelector('[data-part="trunk"]')).not.toBeNull();
    expect(container.querySelector('[data-part="tusk"]')).not.toBeNull();
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

  it("applies the success animation regardless of animate", () => {
    const { container } = render(<OrdiloMascot mood="success" animate={false} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("ordilo-mascot-success");
  });

  it("trumpets with an open eye while processing", () => {
    const { container } = render(<OrdiloMascot mood="processing" />);
    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("class")).toContain("ordilo-mascot-trumpet-body");
    expect(container.querySelector(".ordilo-mascot-trumpet")).not.toBeNull();
    expect(container.querySelector(".ordilo-mascot-trumpet-waves")).not.toBeNull();
    expect(container.querySelector('[data-part="eye"]')?.tagName).toBe("circle");
    expect(container.querySelector(".ordilo-mascot-blink")).toBeNull();
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
