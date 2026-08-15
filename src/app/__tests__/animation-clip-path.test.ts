import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard for reveal animations that keep clipping after they finish.
 *
 * `animation-fill-mode: both` (or `forwards`) retains the final keyframe
 * forever. For a reveal that ends on `clip-path: inset(0 0 0 0 round 20px)`
 * that is not a no-op: the element stays clipped to its border box with
 * rounded corners, which shaves the first letter off any label sitting in
 * the top-left and crops every shadow reaching past the box.
 *
 * That is what mangled the onboarding step header ("ɔchritt 1 von 2"). These
 * reveals all animate FROM a modified state TO the element's natural one, so
 * `backwards` is the correct fill mode — nothing needs retaining.
 */

const CSS = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf-8");

/**
 * Names of @keyframes blocks that END on a ROUNDED clip-path.
 *
 * The `round` is what marks a container reveal: it crops the element to its
 * own rounded border box, which is only ever meant to last for the duration
 * of the reveal. A retained clip WITHOUT `round` can be perfectly deliberate
 * — `strike-through` draws a line that has to stay drawn — so those are not
 * flagged.
 */
function keyframesEndingOnRoundedClip(): string[] {
  const names: string[] = [];
  const blocks = CSS.matchAll(/@keyframes\s+([\w-]+)\s*\{/g);
  for (const block of blocks) {
    const start = block.index! + block[0].length;
    // Walk to the matching close brace so nested rule blocks stay together.
    let depth = 1;
    let index = start;
    while (index < CSS.length && depth > 0) {
      if (CSS[index] === "{") depth++;
      else if (CSS[index] === "}") depth--;
      index++;
    }
    const body = CSS.slice(start, index);
    const finalClip = body.match(/(?:to|100%)\s*\{[^}]*clip-path:\s*([^;]+);/);
    if (finalClip && /\bround\b/.test(finalClip[1])) names.push(block[1]);
  }
  return names;
}

describe("clip-path reveal animations", () => {
  const clipKeyframes = keyframesEndingOnRoundedClip();

  it("finds the rounded clip-path reveals", () => {
    expect(clipKeyframes).toContain("onboarding-step-in");
    expect(clipKeyframes.length).toBeGreaterThan(1);
  });

  it("never retains the final clipped frame", () => {
    const offenders: string[] = [];

    for (const declaration of CSS.matchAll(/animation:\s*([^;]+);/g)) {
      const shorthand = declaration[1];
      const usesClip = clipKeyframes.some((name) =>
        new RegExp(`(^|\\s)${name}(\\s|$)`).test(shorthand),
      );
      if (!usesClip) continue;
      if (/(^|\s)(both|forwards)(\s|$)/.test(shorthand)) {
        offenders.push(shorthand.trim());
      }
    }

    expect(
      offenders,
      "a clip-path reveal must not use fill-mode both/forwards — it stays clipped after the animation",
    ).toEqual([]);
  });
});
