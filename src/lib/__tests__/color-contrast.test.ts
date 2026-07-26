import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Contrast guard for the tokens used as TEXT colour.
 *
 * `--mist` (#9C978C, 2.91:1 on white) and `--apricot` (#E46018, 3.51:1)
 * were both used for body text and both fail WCAG 1.4.3. They are also
 * used for surfaces, borders, dots and the mascot, where darkening them
 * would change the brand — so `--mist-text` and `--apricot-text` exist for
 * text and are pinned here. Apricot in particular is the warning colour,
 * i.e. the text that most needs to be legible.
 */

const CSS = readFileSync(
  join(process.cwd(), "src", "app", "globals.css"),
  "utf-8",
);

function token(name: string): string {
  const match = CSS.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!match) throw new Error(`token --${name} not found or not a hex value`);
  return match[1];
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (hi + 0.05) / (lo + 0.05);
}

/** Every light surface these text colours can land on. */
const LIGHT_SURFACES: Record<string, string> = {
  white: "#FFFFFF",
  "warm-white": token("warm-white"),
  sand: token("sand"),
  "sand-light": token("sand-light"),
  "sand-warm": token("sand-warm"),
};

describe("text colour contrast", () => {
  const AA_NORMAL = 4.5;

  for (const tokenName of ["mist-text", "apricot-text", "mist-dark", "petrol"]) {
    const colour = token(tokenName);
    for (const [surfaceName, surface] of Object.entries(LIGHT_SURFACES)) {
      it(`--${tokenName} on ${surfaceName} meets ${AA_NORMAL}:1`, () => {
        expect(contrast(colour, surface)).toBeGreaterThanOrEqual(AA_NORMAL);
      });
    }
  }

  it("keeps the brand tokens they replace, so surfaces and icons are unchanged", () => {
    // Guards against "fixing" contrast by darkening the brand instead.
    expect(token("mist")).toBe("#9C978C");
    expect(token("apricot")).toBe("#E46018");
  });

  it("documents why the brand tokens are not usable as text", () => {
    expect(contrast(token("mist"), "#FFFFFF")).toBeLessThan(AA_NORMAL);
    expect(contrast(token("apricot"), "#FFFFFF")).toBeLessThan(AA_NORMAL);
    // They do clear the 3:1 that non-text (icons, dots, borders) needs.
    expect(contrast(token("apricot"), "#FFFFFF")).toBeGreaterThanOrEqual(3);
  });

  it("gives the text tokens dark-mode values", () => {
    const darkBlock = CSS.slice(CSS.indexOf(".dark {"));
    expect(darkBlock).toMatch(/--mist-text:\s*#[0-9A-Fa-f]{6}/);
    expect(darkBlock).toMatch(/--apricot-text:\s*#[0-9A-Fa-f]{6}/);
  });
});

describe("mobile input font size", () => {
  it("keeps bespoke review inputs at 16px so iOS does not zoom", () => {
    // The app shell is overflow-hidden, so an iOS zoom on focus is hard to
    // undo. Every hand-rolled input in the review flow must therefore be
    // text-base on mobile (ui/input.tsx already does this).
    for (const file of [
      join("src", "components", "ordilo", "review-card", "edit-controls.tsx"),
      join("src", "components", "ordilo", "review-card", "confirmed-details.tsx"),
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf-8");
      for (const line of source.split("\n")) {
        const isFormControl =
          line.includes("rounded-ordilo-sm border border-border") ||
          line.includes("border border-border bg-[var(--sand)]");
        if (!isFormControl) continue;
        if (!line.includes("text-sm")) continue;
        expect(
          line.includes("text-base sm:text-sm"),
          `${file} has a 14px form control: ${line.trim().slice(0, 80)}`,
        ).toBe(true);
      }
    }
  });
});
