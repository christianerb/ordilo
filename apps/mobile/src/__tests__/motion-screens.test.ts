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
  it("keeps shared navigation and actions usable with accessibility text", () => {
    const ui = source("src/components/ui.tsx");
    const sheet = source("src/components/sheet.tsx");
    const buttons = sourceSection(
      ui,
      "buttonDefault: {",
      "buttonPrimary: {",
    );

    expect(ui).toContain("maxFontSizeMultiplier={1.4}");
    expect(sheet.match(/maxFontSizeMultiplier=\{1\.4\}/g)).toHaveLength(4);
    expect(buttons).toContain("minHeight: 36");
    expect(buttons).toContain("minHeight: 48");
    expect(buttons).not.toMatch(/\bheight: (36|48)\b/);
    expect(ui).toContain('textAlign: "center"');
  });

  it("keeps compact Dokumente chrome intact with large Dynamic Type", () => {
    const library = source("app/(tabs)/ablage.tsx");
    const ui = source("src/components/ui.tsx");
    const sheet = source("src/components/sheet.tsx");
    const dock = source("src/components/ordilo-tab-bar.tsx");

    expect(ui.match(/maxFontSizeMultiplier=\{1\.4\}/g)?.length).toBeGreaterThanOrEqual(6);
    expect(ui).toContain("maxFontSizeMultiplier={1.3}");
    expect(ui).toContain(
      "hitSlop={{ bottom: 4, left: 0, right: 0, top: 4 }}",
    );
    expect(library).toContain("maxFontSizeMultiplier={1.3}");
    expect(library).toContain("hitSlop={11}");
    expect(library).toContain("minHeight: 46");
    expect(library).not.toContain("height: 46");
    expect(sheet).toContain("maxFontSizeMultiplier={1.4}");
    expect(sheet).toContain("numberOfLines={1}");
    expect(dock.match(/maxFontSizeMultiplier=\{1\.2\}/g)).toHaveLength(3);
  });

  it("renders settings without repeated mount entrances", () => {
    const settings = source("app/einstellungen.tsx");
    expect(settings).not.toContain("FadeInView");
    expect(settings).not.toContain("PressableScale");
    expect(settings).toContain("SpringPressable");
  });

  it("presents Start as one personal day brief", () => {
    const home = source("app/(tabs)/index.tsx");

    expect(home).toContain("<HomeHeader");
    expect(home).toContain("Eine Sache braucht heute deinen Blick.");
    expect(home).toContain('title="Heute bei euch"');
    expect(home).not.toContain("Was möchtest du wissen?");
    expect(home).toContain("task.documentId ? onOpenDocument(task.documentId)");
    expect(home).toContain("Schon erledigt");
  });

  it("turns family members into useful personal spaces", () => {
    const family = source("app/familie.tsx");
    const member = source("app/familie/[id].tsx");

    expect(family).toContain("Eure Familie");
    expect(family).toContain("Alles Wichtige. Für jeden von euch.");
    expect(family).toContain("router.push(`/familie/${member.id}`)");
    expect(family).toContain("Für euch gemeinsam");
    expect(member).toContain("Alles für {member.name}");
    expect(member).toContain("Griffbereit");
    expect(member).toContain("Als Nächstes");
    expect(member).toContain("mergeJournalDocuments(");
  });

  it("shows new scan queue items before the tall capture surface", () => {
    const scan = source("app/scan.tsx");

    expect(scan.indexOf("{queue.length > 0 ? (")).toBeLessThan(
      scan.indexOf("style={styles.captureStage}"),
    );
    expect(scan).toContain('label="Datei"');
    expect(scan).not.toContain('label="PDF oder Datei"');
    expect(scan).toContain("bodyRef.current?.scrollTo");
    expect(scan).toContain("ref={bodyRef}");
  });

  it("guides a scan through real processing, review, and confirmation", () => {
    const scan = source("app/scan.tsx");
    const document = source("app/document/[id].tsx");

    expect(scan).toContain("waitForScannedDocumentAnalysis");
    expect(scan).toContain("getDocumentPipelineStepsCompleted");
    // The params object may grow more entries (from, person) and wrap
    // across lines; what matters is id + source arriving together.
    expect(scan).toMatch(
      /params:\s*\{[^}]*id: documentId,[^}]*source: "scan"/s,
    );
    // Leaving the processing screen is always safe, so the leave button
    // carries one constant label; the info box owns the state nuance.
    expect(scan).toContain('const leaveTitle = "Schließen"');
    expect(scan).toContain("Du musst nicht warten");
    expect(scan).not.toContain("Im Hintergrund weiterlaufen");
    expect(scan).not.toContain("Später fortsetzen");
    expect(scan).toContain("flow.serverPipeline === true");
    expect(scan).toContain("item.serverPipeline ?? false");
    expect(scan).toContain("serverPipeline,");
    expect(scan).toContain("detachServerPipelineRef.current = keepRunning");
    expect(document).toContain('source === "scan"');
    expect(document).toContain("Alles sicher abgelegt");
    expect(document).toContain('title="Fertig"');
    expect(document).not.toContain("Nächstes scannen");
    expect(document).not.toContain("Noch etwas scannen");
    expect(document).not.toContain("An Aufgaben und Termine erinnern");
  });

  it("keeps shared button labels on one line", () => {
    const ui = source("src/components/ui.tsx");
    const button = ui.slice(
      ui.indexOf("export function OrdiloButton"),
      ui.indexOf("export function EmptyState"),
    );

    expect(button).toContain("numberOfLines={1}");
    expect(button).toContain("accessibilityLabel={accessibilityLabel ?? title}");
  });

  it("keeps the saved-document footer short and decisive", () => {
    const document = source("app/document/[id].tsx");
    const askAction = document.slice(
      document.lastIndexOf("<OrdiloButton", document.indexOf('title="Ordilo fragen"')),
      document.indexOf("/>", document.indexOf('title="Ordilo fragen"')) + 2,
    );

    expect(document).toContain('accessibilityLabel="Angaben ändern"');
    expect(document).toContain('title={loadingEditor ? "Laden …" : "Ändern"}');
    expect(askAction).toContain('title="Ordilo fragen"');
    expect(askAction).not.toContain('variant="outline"');
    expect(document).toContain('title={saving ? "Speichern …" : "Passt so"}');
    expect(document).not.toContain('title={saving ? "Wird gespeichert …" : "Passt so"}');
  });

  it("does not repeat family invitation actions at handoff points", () => {
    const onboarding = source("app/onboarding.tsx");
    const family = source("app/familie.tsx");
    const access = source("src/components/family-access-panel.tsx");

    expect(onboarding).not.toContain('title="Familie ergänzen"');
    expect(family).not.toContain('title="Einladen & Zugriff"');
    expect(family).toContain('"Person einladen"');
    expect(family).toContain("<FamilyAccessPanel");
    expect(access).toContain('<SectionHeader title="Wer Zugriff hat"');
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
    expect(hero).toContain("<OrdiloCharacter animated processing");
    const character = source("src/components/ordilo-character.tsx");
    expect(character).toContain("processing?: boolean");
    expect(character).toContain("trumpet.set(withRepeat");
    expect(character).toContain("eye.set(1)");
    expect(character).toContain("useReducedMotion()");
    expect(character).toContain("trumpet.set(processing ? 1 : 0)");
  });

  it("uses interruptible state transitions instead of pretend audio activity", () => {
    const suche = source("app/suche.tsx");
    const chat = source("src/components/chat.tsx");
    const bar = source("src/components/live-conversation-bar.tsx");

    expect(suche).toContain("<LiveConversationBar");
    expect(suche).toContain("onLiveStart={() => {");
    expect(suche).not.toContain("styles.liveStart");
    expect(chat).toContain('"Live mit Ordilo sprechen, Premium"');
    expect(chat).toContain("<AudioLines");
    expect(bar).toContain("contentEntering()");
    expect(bar).toContain("feedbackExiting()");
    expect(bar).toContain('transitionProperty: "opacity"');
    expect(bar).toContain("transitionTimingFunction: cssEaseOut");
    expect(bar).toContain("useReducedMotion()");
    expect(bar).toContain("reduced || ready ? 1 : 0.94");
    expect(bar).toContain('accessibilityLiveRegion="polite"');
    expect(bar).toContain("<SpringPressable");
    expect(bar).not.toContain("key={status}");
    expect(bar).not.toContain("withRepeat");
  });

  it("lets plan rows arrive, depart, and settle instead of teleporting", () => {
    const plan = source("app/(tabs)/plan.tsx");
    const motion = source("src/theme/motion.ts");

    // Arrival is gated to one id — an ordinary tab visit must never
    // stagger the list — and the marker clears itself after the entrance
    // so a later remount stays quiet. Exits stay armed on list rows: the
    // fade must exist in the committed tree before a section move, which
    // batching would otherwise skip. The calendar day list arms nothing,
    // because switching days unmounts rows constantly.
    expect(plan).toContain("justCreatedId");
    expect(plan).not.toContain("justDepartedId");
    expect(plan).toContain("markJustCreated(");
    expect(plan).toContain("clearTimeout(justCreatedTimerRef.current)");
    expect(plan).toContain("setTimeout(() => setJustCreatedId(null), 1000)");
    expect(plan).toContain("entry.id === justCreatedId ? arrivalMotion : undefined");
    expect(plan).toContain("entering={entryMotion}");
    expect(plan).toContain("exiting={exitMotion}");
    expect(plan).toContain("entry.kind === \"task\" ? departureMotion : undefined");
    expect(motion).toContain("export function feedbackEntering");
    expect(motion).toContain("export function feedbackExiting");

    // The done state eases its color; the strikethrough cannot animate.
    expect(plan).toContain('transitionProperty: "color"');
    expect(plan).toContain("transitionTimingFunction: cssEaseOut");

    // The all-done moment exists, is quiet, and only fires by hand.
    expect(plan).toContain("Alles erledigt");
    expect(plan).toContain("openTaskCount === 1");
    expect(plan).toContain("allDoneCheered && openTaskCount === 0");
    expect(plan).toContain('accessibilityLiveRegion="polite"');
  });

  it("aborts native setup so the server can close an accepted stale session", () => {
    const live = source("src/lib/live-conversation.ts");
    const search = source("app/suche.tsx");

    expect(live).toContain("const setupAbort = new AbortController()");
    expect(live).toContain("signal: setupAbort.signal");
    expect(live).toContain("setupAbortRef.current?.abort()");
    expect(live).toContain('import { randomUUID } from "expo-crypto"');
    expect(live).not.toContain("crypto.randomUUID()");
    expect(search).toContain('import { randomUUID } from "expo-crypto"');
    expect(search).not.toContain("crypto.randomUUID()");
    expect(live.indexOf("setupAbortRef.current?.abort()")).toBeLessThan(
      live.indexOf("peerRef.current?.close()"),
    );
  });

  it("explains background processing without promising notifications", () => {
    const scan = source("app/scan.tsx");

    expect(scan).toContain("Ordilo arbeitet im Hintergrund weiter");
    expect(scan).toContain("wenn du zurückkommst");
    expect(scan).toContain("pausiert dann einfach");
    expect(scan).toContain("{!failed ? (");
    expect(scan).not.toContain("Wir benachrichtigen dich");
  });


  it("keeps the voice recorder visibly alive and responsive to speech", () => {
    const chat = source("src/components/chat.tsx");
    const search = source("app/suche.tsx");
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
    expect(search).toContain("if (!permission.granted)");
    expect(search).toContain(
      'setVoiceError("Bitte erlaube Ordilo den Zugriff auf dein Mikrofon.")',
    );
    expect(search).toContain('"Kein Zugriff auf das Mikrofon."');
    expect(search).toContain("resetVoiceUi()");
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

  it("renders the login code state with the segmented code boxes and illustration", () => {
    const login = source("app/(auth)/login.tsx");
    const otpInput = source("src/components/otp-code-input.tsx");

    expect(login).toContain("<MailSentIllustration");
    expect(login).toContain("<OtpCodeInput");
    // The hidden TextInput keeps iOS oneTimeCode autofill and number pad.
    expect(otpInput).toContain('textContentType="oneTimeCode"');
    expect(otpInput).toContain('keyboardType="number-pad"');
    expect(otpInput).not.toContain("letterSpacing");
  });

  it("lands signed-out users on the intro screen that hands over to login", () => {
    const layout = source("app/_layout.tsx");
    const einstieg = source("app/(auth)/einstieg.tsx");
    const login = source("app/(auth)/login.tsx");

    expect(layout).toContain('router.replace("/(auth)/einstieg")');
    expect(einstieg).toContain("Deine Familie. Gut organisiert.");
    expect(einstieg).toContain('router.push("/(auth)/login")');
    expect(einstieg).toContain("const largeText = fontScale > 1.3");
    expect(einstieg).toContain("{largeText ? primaryAction : null}");
    expect(einstieg).toContain("{largeText ? null : primaryAction}");
    expect(einstieg).toContain("{largeText ? null : (");
    // The login screen offers the way back to the intro.
    expect(login).toContain("Zurück zur Übersicht");
    expect(login).toContain('router.replace("/(auth)/einstieg")');
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
      "app/familie.tsx",
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
    // Floating sheets lift clear of the home indicator (safe-area aware).
    expect(sheet).toContain(
      "Math.max(FLOATING_SHEET_INSET, insets.bottom)",
    );
    expect(sheet).toContain("paddingHorizontal: FLOATING_SHEET_INSET");
    expect(sheet).toContain(
      "borderBottomLeftRadius: FLOATING_SHEET_BOTTOM_RADIUS",
    );
    expect(sheet).toContain("formBodyContent");
    expect(sheet).toContain("formControlFocused");
    expect(sheet).toContain("formActions");

    // The dock has no choice sheet: the mark opens the conversation in one
    // tap, Scannen opens the intake sheet (scan stage, photos, files) — not
    // the camera, so a photo or PDF never has to pass through the scanner.
    expect(source("src/components/ordilo-tab-bar.tsx")).not.toContain(
      "CreateChoiceSheet",
    );
    expect(source("src/components/ordilo-tab-bar.tsx")).toContain(
      'router.push("/suche")',
    );
    expect(source("src/components/ordilo-tab-bar.tsx")).toContain(
      'router.push("/scan")',
    );
    expect(source("src/components/ordilo-tab-bar.tsx")).not.toContain(
      'params: { auto: "1" }',
    );
    // Explicit „scannen“ CTAs still open the camera directly.
    expect(source("app/(tabs)/index.tsx")).toContain('params: { auto: "1" }');
    // The dock wave is rebuilt from the measured bar width so its corner
    // radii stay round on every phone (no stretched 360pt viewBox).
    expect(source("src/components/ordilo-tab-bar.tsx")).toContain(
      "buildDockWavePath(dockWidth)",
    );
    expect(source("src/components/ordilo-tab-bar.tsx")).not.toContain(
      'preserveAspectRatio="none"',
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
      'route.name === "scannen"',
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
      "detached ? Math.max(FLOATING_SHEET_INSET, insets.bottom) : 0",
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

  it("keeps shared headers scalable and document rows recognizable", () => {
    const ui = source("src/components/ui.tsx");
    const library = source("app/(tabs)/ablage.tsx");
    const document = source("app/document/[id].tsx");

    expect(ui).not.toContain("lineHeight * fontScale");
    expect(ui).not.toContain("lineHeight: typography.largeTitle.lineHeight * fontScale");
    expect(ui).not.toContain("lineHeight: typography.timestamp.lineHeight * fontScale");
    expect(ui).toMatch(/header:\s*\{[^}]*minHeight: 80,/s);
    expect(ui).not.toMatch(/header:\s*\{[^}]*\bheight: 80,/s);
    // Every row leads with the document kind (icon + tint), never a generic
    // file glyph, and carries the people it concerns.
    expect(library).toContain("<IconTile tint={kind.tint}>");
    expect(library).toContain("getDocumentKind(document.document_type)");
    expect(library).toContain("<AvatarStack people={people}");
    expect(library).toContain("groupLibraryDocuments(");
    expect(document).toContain("const largeText = fontScale > 1.3");
    expect(document).toContain("largeText && styles.bottomBarLargeText");
    expect(document).toContain("largeText && styles.bottomActionLargeText");
  });

  it("keeps the document filter and sort actions visible", () => {
    const library = source("app/(tabs)/ablage.tsx");
    const filterSheet = sourceSection(
      library,
      "function LibraryFilterSheet",
      "function SortPicker",
    );

    expect(library).toContain("<View style={styles.libraryToolbar}>");
    expect(library).toContain("reviewFilterLabel");
    expect(library).toContain(
      'visibleReviewCount > 0 ||\n              filters.status === "needs_review"',
    );
    expect(library).toContain('title="Dokumente filtern"');
    expect(library).toContain("<LibraryFilterSheet");
    expect(library).toContain("hiddenFilterCount");
    expect(library).toContain("compactSortLabel");
    expect(library).toContain("<OrdiloFormFooter");
    expect(library).toContain('<OrdiloFormField label="Status">');
    expect(library).toContain('<OrdiloFormField label="Dokumentart">');
    expect(library).toContain('<OrdiloFormField label="Person">');
    expect(library).toContain("<OrdiloPickerOverlay");
    expect(library).toContain("loadLibraryDocumentIdsForPerson(");
    // Nested pickers are siblings of the scrolling form body. Keeping them
    // inside that ScrollView clips the overlay to the grey body rectangle.
    expect(filterSheet.indexOf("</OrdiloFormBody>")).toBeLessThan(
      filterSheet.indexOf("<OrdiloPickerOverlay"),
    );
    expect(filterSheet.indexOf("<OrdiloFormFooter")).toBeLessThan(
      filterSheet.indexOf("<OrdiloPickerOverlay"),
    );
    expect(library).not.toContain("styles.chipDivider");
    expect(library).not.toContain("styles.filterOptions");
  });

  it("animates Dokumente state changes without animating search typing", () => {
    const library = source("app/(tabs)/ablage.tsx");
    const motion = source("src/theme/motion.ts");
    const ui = source("src/components/ui.tsx");

    expect(library).toContain("entering={stateEntering()}");
    expect(library).toContain("entering={contentEntering()}");
    expect(library).toContain("layout={DOCUMENT_ROW_LAYOUT}");
    expect(library).toContain("if (!append && !filters.query.trim())");
    expect(motion).toContain("export function stateEntering");
    expect(ui).toContain("const indicatorX = useSharedValue(0)");
    expect(ui).toContain("duration: durations.base");
    expect(ui).toContain("easing: easeInOut");
    expect(ui).toContain("if (!indicatorInitialized.current || reduceMotion)");
  });

  it("uses native navigation motion and keeps peer tabs still", () => {
    const layout = source("app/_layout.tsx");
    const tabs = source("app/(tabs)/_layout.tsx");
    const appConfig = source("app.json");

    expect(layout).toContain("const reduceMotion = useReducedMotion()");
    expect(layout).toContain('animation: reduceMotion ? "fade" : "default"');
    expect(tabs).toContain('animation: "none"');
    expect(appConfig).toContain(
      '"CADisableMinimumFrameDurationOnPhone": true',
    );
  });

  // Confirmed editing is covered by document-corrections-rendering.test.js.

  it("uses one shared compact picker sheet", () => {
    const pickerSheet = source("src/components/picker-sheet.tsx");
    const sheet = source("src/components/sheet.tsx");
    expect(pickerSheet).toContain("<OrdiloSheet");
    expect(pickerSheet).toContain("detached");
    expect(pickerSheet).toContain("borderRadius: radii.md");
    expect(sheet).toContain("function ContainedNestedSheet");
    expect(sheet).toContain("scheduleOnRN(finishDismiss)");
    expect(sheet).toContain("reduceMotion ? 0 : windowHeight");
    expect(sheet).not.toContain("runOnJS");

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
    // One picker for the person, one for the recurrence rhythm.
    expect(taskForm.match(/<OrdiloPickerOverlay/g)).toHaveLength(2);
    expect(taskForm).toContain('label="Wiederholung"');
    expect(taskForm).toContain("RECURRENCE_LABELS[recurrence]");
    expect(taskForm).not.toContain("memberScroller");
    expect(taskForm).toContain("<OrdiloFormSelect");
    expect(taskForm).not.toContain("memberCircleSelected");
    expect(taskForm).toContain("<OrdiloFormFooter");
    expect(taskForm).not.toContain("styles.saveButton");
  });

  it("shows tasks and appointments through one row and one detail sheet", () => {
    const plan = source("app/(tabs)/plan.tsx");
    // Two lenses on the same entries: neither view owns a kind of thing.
    expect(plan).toContain('label: "Liste"');
    expect(plan).toContain('label: "Kalender"');
    expect(plan).toContain("groupPlanEntries(");
    expect(plan).toContain("planEntriesForDay(");
    // The Aufgaben tab no longer repeats an appointments block below the
    // list while the calendar hides every task.
    expect(plan).not.toContain('<Text style={styles.sectionTitle}>Termine</Text>');
    expect(plan).not.toContain("<PlannerEventRow");
    // Every row, either kind, either view, opens the same sheet.
    expect(plan.match(/<PlanRow/g)).toHaveLength(2);
    expect(plan).toContain("<PlanDetailSheet");
    const detail = source("src/components/plan-detail-sheet.tsx");
    expect(detail).toContain('title={isTask ? "Aufgabe" : "Termin"}');
    expect(detail).toContain("Nur diesen Tag streichen");
  });

  it("gives the document screen its own bottom-sheet host", () => {
    // Reached from the scan flow the screen sits inside a native modal
    // presentation, where the root portal renders underneath it.
    const document = source("app/document/[id].tsx");
    expect(document).toContain("<BottomSheetModalProvider>");
    expect(document).toContain("<GestureHandlerRootView");
    expect(source("app/suche.tsx")).toContain("<BottomSheetModalProvider>");
  });

  it("gives documents on their way in a banner with a state, not a grey strip", () => {
    const arrivals = source("src/components/native-arrivals.tsx");
    expect(arrivals).toContain("<IntakeBanner");
    expect(arrivals).not.toContain("backgroundColor: colors.sand,");
    const banner = source("src/components/intake-banner.tsx");
    // Ordilo itself carries the working state; a still track under Reduce
    // Motion keeps the meaning without the movement.
    expect(banner).toContain("<OrdiloMark");
    expect(banner).toContain("useReducedMotion()");
    expect(banner).toContain("styles.trackRest");
    expect(banner).toContain('accessibilityLiveRegion="polite"');
  });

  it("groups the mobile plan into warm journal sections", () => {
    const plan = source("app/(tabs)/plan.tsx");
    expect(plan).toContain("styles.taskSection");
    expect(plan).toContain("Alle {sectionEntries.length} anzeigen");
    expect(plan).toContain("styles.taskSectionIcon");
    expect(plan).toContain("<SwipeableTaskRow");
  });

  it("welcomes an empty Ordilo chat with the illustrated journal hero", () => {
    const search = source("app/suche.tsx");
    const hero = source("src/components/ordilo-chat-hero.tsx");
    expect(search).toContain("<OrdiloChatHero");
    expect(search).toContain("Was möchtest du wissen?");
    // Suggestions know the family; past conversations are one tap away.
    expect(search).toContain(
      "buildPersonalChatStarters({",
    );
    expect(search).toContain("upcomingTaskTitle");
    expect(search).toContain("listConversations(family.id)");
    expect(search).toContain("loadConversationMessages(conversation.id)");
    expect(hero).toContain("<Svg");
    expect(hero).toContain("colors.washSage");
  });


  it("uses the same warm journal language for scanning and conversations", () => {
    const scan = source("app/scan.tsx");
    const scanHero = source("src/components/scan-hero-illustration.tsx");
    const search = source("app/suche.tsx");
    const chat = source("src/components/chat.tsx");

    expect(scan).toContain("<ScanHeroIllustration");
    expect(scan).toContain("styles.captureButton");
    expect(scan).toContain("styles.secondaryActionIcon");
    // Opened from an explicit scan CTA, the camera opens by itself once.
    expect(scan).toContain('autoLaunchRef = useRef(auto === "1")');
    expect(scanHero).toContain("<Svg");
    expect(search).toContain("styles.dayDivider");
    expect(search).toContain("<OrdiloMark");
    expect(chat).toContain("<OrdiloMark");
    expect(chat).toContain("formatChatMessageTime");
  });
});
