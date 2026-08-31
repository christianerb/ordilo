import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf-8");

function blockAfter(marker: string): string {
  const start = CSS.indexOf(marker);
  if (start === -1) return "";
  let depth = 0;
  let opened = false;
  for (let index = start; index < CSS.length; index++) {
    if (CSS[index] === "{") {
      depth++;
      opened = true;
    } else if (CSS[index] === "}") {
      depth--;
      if (opened && depth === 0) return CSS.slice(start, index + 1);
    }
  }
  return CSS.slice(start);
}

describe("Reduced Motion CSS contract", () => {
  it("globally allows only non-positional state transitions", () => {
    const reducedMotion = blockAfter("@media (prefers-reduced-motion: reduce)");
    const universal = reducedMotion.match(
      /\*,\s*\*::before,\s*\*::after\s*\{([^}]+)\}/,
    )?.[1];

    expect(universal).toContain("scroll-behavior: auto");
    expect(universal).toContain("transition-property:");
    expect(universal).toMatch(/box-shadow\s*!important/);
    for (const property of [
      "color",
      "background-color",
      "border-color",
      "text-decoration-color",
      "fill",
      "stroke",
      "opacity",
      "box-shadow",
    ]) {
      expect(universal).toMatch(new RegExp(`\\b${property}\\b`));
    }
    expect(universal).not.toMatch(
      /\b(all|transform|grid-template-rows|width|height|max-width|max-height|margin|padding|left|right|top|bottom|clip-path)\b/,
    );
    expect(universal).not.toContain("transition-duration");
    expect(universal).not.toContain("animation-duration");
  });

  it("uses an opacity-only reduced fade", () => {
    const reducedFade = blockAfter("@keyframes reduced-fade");

    expect(reducedFade).toContain("opacity");
    expect(reducedFade).not.toMatch(/transform|translate|scale|clip-path/);
  });

  it("keeps landing feedback without restoring movement", () => {
    const reducedMotion = blockAfter("@media (prefers-reduced-motion: reduce)");

    expect(CSS).toContain(
      "@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
    expect(CSS).toMatch(
      /\.landing-wordmark::before\s*\{[^}]*animation-fill-mode:\s*backwards/,
    );
    expect(CSS).toMatch(
      /\.landing-wordmark \.ordilo-wordmark__mark,[^}]*animation-fill-mode:\s*backwards/,
    );
    expect(CSS).toMatch(
      /\.landing-faq-chevron\s*\{[^}]*transition:\s*rotate 180ms var\(--ease-in-out\)/,
    );
    expect(reducedMotion).toMatch(
      /\.group\[open\] \.landing-faq-answer\s*\{[^}]*animation:\s*reduced-fade 200ms ease/,
    );
    expect(reducedMotion).toMatch(
      /\.landing-faq-chevron\s*\{[^}]*rotate:\s*none !important/,
    );
    expect(reducedMotion).toMatch(
      /\.press-scale:active\s*\{[^}]*transform:\s*none;[^}]*opacity:\s*0\.82/,
    );
  });
});
