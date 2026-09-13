/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  describeScanCompletion,
  loadFirstOpenDocumentId,
  waitForFirstOpenDocument,
} from "../lib/intake-status";

const mockFrom = jest.fn();

jest.mock("../lib/supabase", () => ({
  getSupabase: () => ({ from: mockFrom }),
}));

function queryResolving(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit"]) {
    query[method] = jest.fn(() => query);
  }
  query.then = (resolve: (value: unknown) => void) => resolve(result);
  return query as Record<string, jest.Mock> & { then: unknown };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("describeScanCompletion", () => {
  it("names the count and stays calm", () => {
    expect(describeScanCompletion(1).title).toBe("1 Dokument ist angekommen");
    expect(describeScanCompletion(3).title).toBe("3 Dokumente sind angekommen");
    expect(describeScanCompletion(3).detail).toContain("Ordilo liest");
  });
});

describe("loadFirstOpenDocumentId", () => {
  it("returns the oldest document that still needs a review", async () => {
    const query = queryResolving({ data: [{ id: "doc-1" }], error: null });
    mockFrom.mockReturnValue(query);

    await expect(loadFirstOpenDocumentId("fam-1")).resolves.toBe("doc-1");
    expect(mockFrom).toHaveBeenCalledWith("documents");
    expect(query.eq).toHaveBeenCalledWith("family_id", "fam-1");
    expect(query.in).toHaveBeenCalledWith("status", [
      "uploaded",
      "ocr_processing",
      "ocr_done",
      "analyzing",
      "analyzed",
    ]);
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("returns null when nothing is waiting", async () => {
    mockFrom.mockReturnValue(queryResolving({ data: [], error: null }));
    await expect(loadFirstOpenDocumentId("fam-1")).resolves.toBeNull();
  });

  it("surfaces a plain German error when the query fails", async () => {
    mockFrom.mockReturnValue(queryResolving({ data: null, error: { message: "RLS" } }));
    await expect(loadFirstOpenDocumentId("fam-1")).rejects.toThrow(
      "Das Dokument konnte nicht gefunden werden. Bitte versuch es nochmal.",
    );
  });
});

describe("waitForFirstOpenDocument", () => {
  const noSleep = async () => undefined;

  it("returns as soon as a document shows up", async () => {
    mockFrom
      .mockReturnValueOnce(queryResolving({ data: [], error: null }))
      .mockReturnValueOnce(queryResolving({ data: [{ id: "doc-2" }], error: null }));

    await expect(
      waitForFirstOpenDocument("fam-1", { tries: 5, sleep: noSleep }),
    ).resolves.toBe("doc-2");
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it("gives up calmly after the last try", async () => {
    mockFrom.mockReturnValue(queryResolving({ data: [], error: null }));

    await expect(
      waitForFirstOpenDocument("fam-1", { tries: 3, sleep: noSleep }),
    ).resolves.toBeNull();
    expect(mockFrom).toHaveBeenCalledTimes(3);
  });
});

describe("scan handoff wiring", () => {
  const mobileRoot = resolve(__dirname, "../..");
  const scan = readFileSync(resolve(mobileRoot, "app/scan.tsx"), "utf8");
  const document = readFileSync(resolve(mobileRoot, "app/document/[id].tsx"), "utf8");

  it("ends a single-document scan in the review, marked as intake", () => {
    expect(scan).toContain('from: "intake"');
    expect(scan).toContain('source: "scan"');
    // The person a scan was started for travels into the review.
    expect(scan).toContain("...(person ? { person } : {})");
  });

  it("offers „Jetzt prüfen“ and „Später prüfen“ after several documents", () => {
    expect(scan).toContain('phase: "complete"');
    expect(scan).toContain('title={handoffBusy ? "Ordilo sucht das erste Dokument …" : "Jetzt prüfen"}');
    expect(scan).toContain('title="Später prüfen"');
    expect(scan).toContain("waitForFirstOpenDocument(family.id)");
    expect(scan).toContain("drainIntake(");
  });

  it("lets the review screen follow processing and refresh the offline copy", () => {
    expect(document).toContain('from === "intake"');
    expect(document).toContain("awaitingAnalysis");
    expect(document).toContain("refreshOfflineCopyQuietly(id)");
    expect(document).toContain("STILL_PROCESSING");
  });
});
