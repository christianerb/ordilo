/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mobileRoot = resolve(__dirname, "../..");
const source = (path: string) =>
  readFileSync(resolve(mobileRoot, path), "utf8");

function sourceSection(contents: string, start: string, end: string): string {
  const startIndex = contents.indexOf(start);
  const endIndex = contents.indexOf(end, startIndex);
  if (startIndex === -1 || endIndex === -1) {
    throw new Error(`Could not find source section: ${start} → ${end}`);
  }
  return contents.slice(startIndex, endIndex);
}

describe("native motion wiring", () => {
  it("renders settings without repeated mount entrances", () => {
    const settings = source("app/einstellungen.tsx");
    expect(settings).not.toContain("FadeInView");
    expect(settings).not.toContain("PressableScale");
    expect(settings).toContain("SpringPressable");
  });

  it("shows new scan queue items before the tall capture surface", () => {
    const scan = source("app/scan.tsx");

    expect(scan.indexOf("{queue.length > 0 ? (")).toBeLessThan(
      scan.indexOf("<View style={styles.captureStage}>"),
    );
    expect(scan).toContain("bodyRef.current?.scrollTo");
    expect(scan).toContain("ref={bodyRef}");
  });

  it("guides a scan through real processing, review, and confirmation", () => {
    const scan = source("app/scan.tsx");
    const document = source("app/document/[id].tsx");

    expect(scan).toContain("waitForScannedDocumentAnalysis");
    expect(scan).toContain("getDocumentPipelineStepsCompleted");
    expect(scan).toContain('params: { id: documentId, source: "scan" }');
    expect(scan).toContain("Im Hintergrund weiterlaufen");
    expect(document).toContain('source === "scan"');
    expect(document).toContain("Alles sicher abgelegt");
    expect(document).toContain("Nächstes scannen");
  });

  it("animates real scan stages without ignoring reduced motion", () => {
    const scan = source("app/scan.tsx");
    const hero = source("src/components/scan-processing-hero.tsx");
    const motion = source("src/theme/motion.ts");

    expect(scan).toContain("<ScanProcessingHero stage={processingStage}");
    expect(scan).toContain("getProcessingStage(flow.status)");
    expect(scan).toContain("completionEntering(reduceMotion)");
    expect(hero).toContain("useReducedMotion()");
    expect(hero).toContain("cancelAnimation(uploadLift)");
    expect(hero).toContain("withRepeat(");
    expect(hero).toContain("Easing.linear");
    expect(hero).toContain("transform: [{ translateY:");
    expect(hero).toContain("if (reduced)");
    expect(hero).toContain("AccessibilityInfo.announceForAccessibility");
    expect(hero).toContain('accessibilityLiveRegion="polite"');
    expect(hero).toContain("accessibilityValue={{ text: stageLabel }}");
    expect(motion).toContain("export function completionEntering");
  });

  it("animates the chat thinking state without ignoring reduced motion", () => {
    const chat = source("src/components/chat.tsx");
    const thinking = sourceSection(
      chat,
      "function ThinkingDot",
      "/** User bubble",
    );

    expect(thinking).toContain("feedbackEntering(reduceMotion)");
    expect(thinking).toContain("feedbackExiting()");
    expect(thinking).toContain("useReducedMotion()");
    expect(thinking).toContain("cancelAnimation(progress)");
    expect(thinking).toContain("reduceMotion ? 0 : 70");
  });

  it("keeps the voice recorder visibly alive and responsive to speech", () => {
    const chat = source("src/components/chat.tsx");
    const recorder = sourceSection(
      chat,
      "const VOICE_WAVE_SAMPLES",
      "/** Bottom composer",
    );

    expect(recorder).toContain("VOICE_WAVE_SAMPLES = 31");
    expect(recorder).toContain("levelRef.current");
    expect(recorder).toContain("historyRef.current");
    expect(recorder).toContain("const cadence =");
    expect(recorder).toContain("const voicePeak =");
    expect(recorder).toContain("clearInterval(interval)");
    expect(recorder).toContain("if (reduceMotion) return");
    expect(recorder).toContain("reduceMotion: REDUCE_MOTION");
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
      const form = source(path);
      expect(form).toContain("OrdiloFormSheet");
      expect(form).toContain("OrdiloFormBody");
      expect(form).toContain("OrdiloFormField");
      expect(form).toContain("OrdiloFormFooter");
      expect(form).toContain("OrdiloFormInput");
      expect(form).not.toContain("AnimatedSheetModal");
    }
    expect(sheet).toContain('maxHeight: "88%"');
    expect(sheet).not.toContain('height: "88%"');
    expect(sheet).toContain("formBody: { flexShrink: 1 }");
    expect(sheet).toContain("paddingBottom: FLOATING_SHEET_INSET");
    expect(sheet).toContain("paddingHorizontal: FLOATING_SHEET_INSET");
    expect(sheet).toContain(
      "borderBottomLeftRadius: FLOATING_SHEET_BOTTOM_RADIUS",
    );
    expect(sheet).toContain("formBodyContent");
    expect(sheet).toContain("formControlFocused");
    expect(sheet).toContain("formActions");

    // The tab bar action sheet delegates presentation to the shared choice sheet.
    expect(source("src/components/ordilo-tab-bar.tsx")).toContain(
      "CreateChoiceSheet",
    );
    expect(source("src/components/ordilo-tab-bar.tsx")).toContain(
      "C137 28 139 0 180 0 C221 0 223 28 252 28",
    );
    expect(source("src/components/ordilo-tab-bar.tsx")).not.toContain(
      "centerGlow",
    );
    expect(source("src/components/ordilo-tab-bar.tsx")).toContain(
      "paddingHorizontal: 0",
    );
    expect(source("src/components/ordilo-tab-bar.tsx")).toContain(
      'route.name === "index" && styles.startTab',
    );
    expect(source("src/components/ordilo-tab-bar.tsx")).toContain(
      'route.name === "familie" && styles.familyTab',
    );
    expect(source("src/components/ordilo-tab-bar.tsx")).toContain(
      "insets.bottom - spacing.lg",
    );
    expect(source("src/components/ordilo-tab-bar.tsx")).toContain(
      'position: "absolute"',
    );
    expect(source("src/components/ordilo-tab-bar.tsx")).toContain(
      "MOBILE_DOCK_CONTENT_INSET = 136",
    );
    for (const path of [
      "app/(tabs)/index.tsx",
      "app/(tabs)/ablage.tsx",
      "app/(tabs)/plan.tsx",
      "app/(tabs)/familie.tsx",
    ]) {
      expect(source(path)).toContain("MOBILE_DOCK_CONTENT_INSET");
    }
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
      "bottomInset={detached ? FLOATING_SHEET_INSET : 0}",
    );
    expect(source("src/components/sheet.tsx")).toContain(
      "marginHorizontal: FLOATING_SHEET_INSET",
    );
    expect(source("src/components/sheet.tsx")).toContain(
      "FLOATING_SHEET_BOTTOM_RADIUS = 40",
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

  it("routes every mobile bottom sheet through the Dokumente plus styling", () => {
    const sheet = source("src/components/sheet.tsx");
    const choice = source("src/components/create-choice-sheet.tsx");
    const picker = source("src/components/picker-sheet.tsx");
    const confirm = source("src/components/confirm-dialog.tsx");
    const task = source("src/components/task-form-sheet.tsx");
    const scan = source("app/scan.tsx");
    const layout = source("app/_layout.tsx");

    expect(sheet).toContain("export function OrdiloSheetHeader");
    expect(sheet).toContain("<Sprout");
    expect(sheet).toContain("visible={mounted}");
    expect(choice).toContain("<OrdiloSheetHeader");
    expect(picker).toContain("<OrdiloSheetHeader");
    expect(picker).toContain("<OrdiloNestedSheet");
    expect(confirm).toContain("<OrdiloSheetHeader");
    expect(confirm).toContain("<OrdiloNestedSheet");
    expect(confirm).toContain("visible={visible}");
    expect(confirm).not.toContain("<Modal");
    expect(task).toContain('<OrdiloSheetHeader title="Datum wählen"');
    expect(task).not.toContain("dateOverlay");
    expect(scan).toContain("<OrdiloFormSheet");
    expect(scan).toContain("<OrdiloFormBody");
    expect(scan).not.toContain("<SafeAreaView");
    expect(layout).toContain('presentation: "transparentModal"');
  });

  it("uses one shared compact picker sheet", () => {
    const pickerSheet = source("src/components/picker-sheet.tsx");
    expect(pickerSheet).toContain("<OrdiloSheet");
    expect(pickerSheet).toContain("detached");
    expect(pickerSheet).toContain("borderRadius: radii.md");

    for (const path of [
      "app/(tabs)/ablage.tsx",
      "app/(tabs)/plan.tsx",
    ]) {
      expect(source(path)).toContain("<OrdiloPickerSheet");
    }
    for (const path of [
      "src/components/note-form-sheet.tsx",
      "src/components/task-form-sheet.tsx",
    ]) {
      expect(source(path)).toContain("<OrdiloPickerOverlay");
    }
  });

  it("uses the journal task form layout for create and edit", () => {
    const taskForm = source("src/components/task-form-sheet.tsx");
    expect(taskForm).toContain("Aufgabe erstellen");
    expect(taskForm).toContain("Aufgabe bearbeiten");
    expect(taskForm).toContain("<DateTimePicker");
    expect(taskForm).toContain('display={Platform.OS === "ios" ? "inline" : "default"}');
    expect(taskForm.match(/<OrdiloPickerOverlay/g)).toHaveLength(1);
    expect(taskForm).not.toContain("memberScroller");
    expect(taskForm).toContain("<OrdiloFormSelect");
    expect(taskForm).not.toContain("memberCircleSelected");
    expect(taskForm).toContain("<OrdiloFormFooter");
    expect(taskForm).not.toContain("styles.saveButton");
  });

  it("groups the mobile task overview into warm journal sections", () => {
    const plan = source("app/(tabs)/plan.tsx");
    expect(plan).toContain("styles.taskSection");
    expect(plan).toContain("Alle {sectionTasks.length} anzeigen");
    expect(plan).toContain("styles.taskSectionIcon");
    expect(plan).toContain("<SwipeableTaskRow");
  });

  it("welcomes an empty Ordilo chat with the illustrated journal hero", () => {
    const search = source("app/suche.tsx");
    const hero = source("src/components/ordilo-chat-hero.tsx");
    expect(search).toContain("<OrdiloChatHero");
    expect(search).toContain("Wie kann ich dir helfen?");
    expect(search).toContain("CHAT_EXAMPLE_PROMPTS.map");
    expect(hero).toContain("<Svg");
    expect(hero).toContain("colors.washSage");
  });

  it("uses the same warm journal language for scanning and conversations", () => {
    const scan = source("app/scan.tsx");
    const scanHero = source("src/components/scan-hero-illustration.tsx");
    const search = source("app/suche.tsx");
    const chat = source("src/components/chat.tsx");

    expect(scan).toContain("<ScanHeroIllustration");
    expect(scan).toContain("styles.alternativeHeading");
    expect(scan).toContain("styles.secondaryActionIcon");
    expect(scanHero).toContain("<Svg");
    expect(search).toContain("styles.dayDivider");
    expect(search).toContain("<OrdiloMark");
    expect(chat).toContain("styles.bubbleAvatar");
    expect(chat).toContain("formatChatMessageTime");
  });
});
