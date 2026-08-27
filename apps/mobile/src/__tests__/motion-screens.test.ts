/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mobileRoot = resolve(__dirname, "../..");
const source = (path: string) =>
  readFileSync(resolve(mobileRoot, path), "utf8");

describe("native motion wiring", () => {
  it("renders settings without repeated mount entrances", () => {
    const settings = source("app/einstellungen.tsx");
    expect(settings).not.toContain("FadeInView");
    expect(settings).not.toContain("PressableScale");
    expect(settings).toContain("SpringPressable");
  });

  it("uses Reanimated's native CSS easing object for press transitions", () => {
    const ui = source("src/components/ui.tsx");

    expect(ui).toContain("cubicBezier(0.23, 1, 0.32, 1)");
    expect(ui).toContain("transitionTimingFunction: PRESS_EASE_OUT");
    expect(ui).not.toMatch(
      /transitionTimingFunction:\s*["']cubic-bezier\(/,
    );
  });

  it("keys onboarding and login form steps inside stationary scroll views", () => {
    const onboarding = source("app/onboarding.tsx");
    const login = source("app/(auth)/login.tsx");

    for (const key of ["family-name", "add-member", "ready"]) {
      expect(onboarding).toContain(`key="${key}"`);
    }
    expect(onboarding).toContain("stepEntering(stepDirection, reduceMotion)");
    expect(login).toContain('key={codeSent ? "code" : "email"}');
    expect(login).toContain("stepEntering(formDirection, reduceMotion)");
    expect(login).toContain("pendingLoginChecked");
  });

  it("uses one gesture-capable image preview with no native slide owner", () => {
    const documentScreen = source("app/document/[id].tsx");
    const noteScreen = source("app/note/[id].tsx");
    const preview = source("src/components/swipe-image-preview.tsx");

    expect(documentScreen).toContain("<SwipeImagePreview");
    expect(noteScreen).toContain("<SwipeImagePreview");
    expect(preview).toContain('animationType="none"');
    expect(preview).toContain("useReducedMotion()");
    expect(preview).toContain("scheduleOnRN(finishClose)");
    expect(preview.match(/withTiming\(/g)).toHaveLength(5);
    expect(preview.match(/reduceMotion: ReduceMotion\.Never/g)).toHaveLength(5);
  });

  it("branches every custom form modal for Reduce Motion", () => {
    for (const path of [
      "src/components/contacts.tsx",
      "src/components/note-form-sheet.tsx",
      "app/note/[id].tsx",
      "src/components/ordilo-tab-bar.tsx",
    ]) {
      expect(source(path)).toContain("modalAnimationType(reduceMotion)");
    }
  });
});
