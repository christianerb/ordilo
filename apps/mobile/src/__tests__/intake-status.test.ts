import {
  describeIntake,
  describeIntakeFailure,
  intakeStatusLabel,
} from "../lib/intake-status";
import type { PersistedScanQueueItem } from "../lib/scan";

function item(
  overrides: Partial<PersistedScanQueueItem> = {},
): PersistedScanQueueItem {
  return {
    uri: "file:///scan-1.jpg",
    name: "scan-1.jpg",
    mimeType: "image/jpeg",
    size: 1024,
    state: "processing",
    ...overrides,
  } as PersistedScanQueueItem;
}

describe("what the intake banner says", () => {
  it("says nothing when nothing is on its way in", () => {
    expect(describeIntake([])).toBeNull();
  });

  it("names Ordilo as the one doing the reading", () => {
    expect(describeIntake([item()])).toEqual({
      tone: "working",
      title: "Ordilo liest 1 Dokument",
      detail: "Du kannst weitermachen. Ich melde mich, wenn es fertig ist.",
      count: 1,
    });
    expect(describeIntake([item(), item({ name: "b" })])?.title).toBe(
      "Ordilo liest 2 Dokumente",
    );
  });

  it("names the step for a single document, and stays calm for several", () => {
    expect(describeIntake([item({ processingStep: "ocr" })])?.detail).toBe(
      "Ordilo entziffert gerade den Text.",
    );
    expect(describeIntake([item({ processingStep: "analysis" })])?.detail).toBe(
      "Ordilo sortiert gerade, was drinsteht.",
    );
    expect(
      describeIntake([
        item({ processingStep: "ocr" }),
        item({ name: "b", processingStep: "analysis" }),
      ])?.detail,
    ).toBe("Du kannst weitermachen. Ich melde mich, wenn es fertig ist.");
  });

  it("distinguishes a queue that has not started yet", () => {
    expect(describeIntake([item({ state: "queued" })])).toEqual({
      tone: "waiting",
      title: "1 Dokument wartet",
      detail: "Der Upload startet automatisch, sobald es geht.",
      count: 1,
    });
    expect(
      describeIntake([item({ state: "queued" }), item({ name: "b", state: "queued" })])
        ?.title,
    ).toBe("2 Dokumente warten");
    // One item already moving means the queue is running, not waiting.
    expect(
      describeIntake([item({ state: "queued" }), item({ name: "b", state: "uploading" })])
        ?.tone,
    ).toBe("working");
  });

  it("puts something that needs a person ahead of progress", () => {
    const status = describeIntake([
      item({ state: "processing" }),
      item({ name: "b", state: "failed" }),
    ]);
    expect(status).toEqual({
      tone: "attention",
      title: "Ein Import braucht dich",
      detail: "Tipp hier, dann machen wir das zusammen fertig.",
      count: 1,
    });
    expect(
      describeIntake([
        item({ state: "failed" }),
        item({ name: "b", state: "failed" }),
      ])?.title,
    ).toBe("2 Importe brauchen dich");
  });

  it("admits when the queue itself cannot be read", () => {
    expect(describeIntakeFailure()).toEqual({
      tone: "error",
      title: "Eingang nicht lesbar",
      detail: "Tipp hier, um es nochmal zu versuchen.",
      count: 0,
    });
  });

  it("reads the whole banner out in one sentence", () => {
    expect(intakeStatusLabel(describeIntake([item()])!)).toBe(
      "Ordilo liest 1 Dokument. Du kannst weitermachen. Ich melde mich, wenn es fertig ist.",
    );
  });
});
