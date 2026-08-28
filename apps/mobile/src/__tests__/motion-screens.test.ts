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

  it("routes every custom form modal through the motion-aware sheet primitives", () => {
    // AnimatedSheetModal owns the Reduce Motion branch for raw modals: the
    // overlay fades in place while only the sheet travels.
    const sheet = source("src/components/sheet.tsx");
    expect(sheet).toContain("useReducedMotion");
    expect(sheet).toContain('animationType="none"');
    expect(sheet).toContain("reduceMotion ? 0 : windowHeight");

    for (const path of [
      "src/components/collection-form-sheet.tsx",
      "src/components/contacts.tsx",
      "src/components/event-form-sheet.tsx",
      "src/components/note-form-sheet.tsx",
      "src/components/task-form-sheet.tsx",
      "app/(tabs)/familie.tsx",
      "app/note/[id].tsx",
    ]) {
      expect(source(path)).toContain("OrdiloFormSheet");
      expect(source(path)).not.toContain("AnimatedSheetModal");
    }

    // The tab bar action sheet delegates presentation to the shared choice sheet.
    expect(source("src/components/ordilo-tab-bar.tsx")).toContain(
      "CreateChoiceSheet",
    );
    expect(source("src/components/ordilo-tab-bar.tsx")).toContain(
      "C336 24 352 40 352 60 C352 80 336 96 316 96",
    );
    expect(source("src/components/ordilo-tab-bar.tsx")).not.toContain(
      "centerGlow",
    );
    expect(source("src/components/ordilo-tab-bar.tsx")).toContain(
      "paddingHorizontal: 0",
    );
  });

  it("uses one shared create-choice sheet in Ablage and Plan", () => {
    const choiceSheet = source("src/components/create-choice-sheet.tsx");
    expect(choiceSheet).toContain("Was möchtest du anlegen?");
    expect(choiceSheet).toContain("Wähle aus, was du jetzt festhalten möchtest.");
    expect(choiceSheet).toContain("paddingHorizontal: spacing.lg");
    expect(choiceSheet).toContain("detached");
    expect(choiceSheet).toContain("minHeight: 86");
    expect(choiceSheet).toContain("paddingBottom: spacing.md");
    expect(source("src/components/sheet.tsx")).toContain(
      "bottomInset={detached ? spacing.md : 0}",
    );
    expect(source("src/components/sheet.tsx")).toContain(
      "marginHorizontal: spacing.md",
    );
    expect(source("src/components/sheet.tsx")).toContain(
      "DETACHED_SHEET_BOTTOM_RADIUS = 40",
    );

    for (const path of [
      "app/(tabs)/ablage.tsx",
      "app/(tabs)/plan.tsx",
      "src/components/ordilo-tab-bar.tsx",
    ]) {
      expect(source(path)).toContain("<CreateChoiceSheet");
      expect(source(path)).not.toContain("CreatePlanItemSheet");
      expect(source(path)).not.toContain("CreateLibraryItemSheet");
    }
  });

  it("uses one shared compact picker sheet", () => {
    const pickerSheet = source("src/components/picker-sheet.tsx");
    expect(pickerSheet).toContain("<OrdiloSheet");
    expect(pickerSheet).toContain("detached");
    expect(pickerSheet).toContain("borderRadius: radii.md");

    for (const path of [
      "app/(tabs)/ablage.tsx",
      "app/(tabs)/plan.tsx",
      "src/components/note-form-sheet.tsx",
    ]) {
      expect(source(path)).toContain("<OrdiloPickerSheet");
    }
  });
});
