import { LIVE_PROGRESS_TAG } from "@ordilo/chat-contract";

import {
  createLiveTurnCollector,
  LIVE_SPOKEN_PROGRESS_DELAYS_MS,
  speakAnswerCard,
  splitForCommentary,
  spokenProgress,
} from "../lib/live-progress";
import type { AnswerCard } from "../lib/chat";

const card = (overrides: Partial<AnswerCard> = {}): AnswerCard => ({
  type: "termin",
  title: "Zahnarzt",
  subtitle: "Dr. Weber",
  fields: [
    { label: "Datum", value: "3. September 2026" },
    { label: "Uhrzeit", value: "10:30 Uhr" },
  ],
  actionDocumentId: null,
  hasSecret: false,
  ...overrides,
});

describe("Live turn collector", () => {
  it("turns tool steps into plain progress, naming the opened document", () => {
    const collector = createLiveTurnCollector();
    expect(
      collector.apply({ type: "tool", toolName: "search_documents", state: "start" }),
    ).toEqual({ progress: "Ich suche in euren Unterlagen …" });
    expect(
      collector.apply({ type: "tool", toolName: "search_documents", state: "done" }),
    ).toEqual({});
    expect(
      collector.apply({
        type: "tool",
        toolName: "read_document",
        state: "start",
        documentTitle: "Handyvertrag",
      }),
    ).toEqual({ progress: "Gefunden in: Handyvertrag" });
    expect(collector.stage).toEqual({
      foundTitle: "Handyvertrag",
      preparingAction: false,
    });
    expect(
      collector.apply({ type: "tool", toolName: "add_task", state: "start" }),
    ).toEqual({ progress: "Ich bereite einen Vorschlag vor …" });
    expect(collector.stage.preparingAction).toBe(true);
    expect(
      collector.apply({ type: "tool", toolName: "something_new", state: "start" }),
    ).toEqual({ progress: "Ich schaue nach …" });
  });

  it("hands over the final text at answer_ready, not after saving", () => {
    const collector = createLiveTurnCollector();
    collector.apply({ type: "text", content: "Ein Entwurf" });
    collector.apply({ type: "replace", content: "" });
    collector.apply({ type: "text", content: "Der Vertrag endet am " });
    collector.apply({ type: "text", content: "30. September 2027. " });
    expect(collector.apply({ type: "answer_ready" })).toEqual({
      answer: "Der Vertrag endet am 30. September 2027.",
    });
    // The later done event must not hand the same answer over twice.
    expect(collector.apply({ type: "done" })).toEqual({});
  });

  it("speaks a card answer instead of saying nothing", () => {
    const collector = createLiveTurnCollector();
    collector.apply({ type: "card", card: card() });
    expect(collector.apply({ type: "answer_ready" })).toEqual({
      answer: "Zahnarzt. Dr. Weber. Datum: 3. September 2026. Uhrzeit: 10:30 Uhr.",
    });
  });

  it("leaves an empty or failed stream to the caller's fallback", () => {
    const collector = createLiveTurnCollector();
    expect(
      collector.apply({ type: "error", error: "Kaputt", code: null }),
    ).toEqual({});
    expect(collector.apply({ type: "done" })).toEqual({});
  });
});

describe("Live speech helpers", () => {
  it("never reads login details out loud", () => {
    const login = speakAnswerCard(
      card({
        type: "zugangsdaten",
        title: "Stadtwerke",
        fields: [{ label: "Benutzer", value: "familie@example.de" }],
        hasSecret: true,
      }),
    );
    expect(login).toBe("Die Zugangsdaten für Stadtwerke stehen jetzt auf dem Bildschirm.");
    expect(login).not.toContain("familie@example.de");
  });

  it("tags spoken progress and speaks it in Ordilo's own voice", () => {
    const searching = spokenProgress(
      { foundTitle: null, preparingAction: false },
      new Set(),
    );
    expect(searching).toBe(`${LIVE_PROGRESS_TAG} Ich suche noch, einen kleinen Moment.`);

    const reading = spokenProgress(
      { foundTitle: "Kita-Brief", preparingAction: false },
      new Set(),
    );
    expect(reading).toBe(
      `${LIVE_PROGRESS_TAG} Ich habe „Kita-Brief“ gefunden und lese kurz nach.`,
    );
    // No third-person "Ordilo hat …" and no prompt wording to read aloud.
    expect(reading).not.toContain("Ordilo");
    expect(reading).not.toContain("noch ohne Ergebnis");
  });

  it("does not claim to search while a change is being prepared", () => {
    expect(
      spokenProgress({ foundTitle: null, preparingAction: true }, new Set()),
    ).toBe(`${LIVE_PROGRESS_TAG} Ich bereite das gerade vor.`);
  });

  it("never says the same update twice in one turn", () => {
    const stage = { foundTitle: null, preparingAction: false };
    const said = new Set<string>();
    const first = spokenProgress(stage, said);
    said.add(first!);
    const second = spokenProgress(stage, said);
    expect(second).toBe(`${LIVE_PROGRESS_TAG} Dauert noch einen kleinen Moment.`);
    said.add(second!);
    expect(spokenProgress(stage, said)).toBeNull();
  });

  it("names a document found between two updates", () => {
    const said = new Set([
      `${LIVE_PROGRESS_TAG} Ich suche noch, einen kleinen Moment.`,
    ]);
    expect(
      spokenProgress({ foundTitle: "Handyvertrag", preparingAction: false }, said),
    ).toBe(`${LIVE_PROGRESS_TAG} Ich habe „Handyvertrag“ gefunden und lese kurz nach.`);
  });

  it("waits past a typical answer before the first spoken update", () => {
    expect(LIVE_SPOKEN_PROGRESS_DELAYS_MS[0]).toBeGreaterThanOrEqual(7_000);
  });

  it("keeps short answers whole and splits long ones at sentence ends", () => {
    expect(splitForCommentary("  Kurz und gut.  ")).toEqual(["Kurz und gut."]);
    expect(splitForCommentary("   ")).toEqual([]);

    const sentence = "Das ist ein ganzer Satz mit genug Inhalt. ";
    const parts = splitForCommentary(sentence.repeat(10), 100);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(100);
      expect(part.endsWith(".")).toBe(true);
    }
    expect(parts.join(" ")).toBe(sentence.repeat(10).trim());
  });

  it("cuts a run-on sentence that is longer than one part", () => {
    const parts = splitForCommentary("a".repeat(250), 100);
    expect(parts).toEqual(["a".repeat(100), "a".repeat(100), "a".repeat(50)]);
  });
});
