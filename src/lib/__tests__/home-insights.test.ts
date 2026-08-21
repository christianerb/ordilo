import { describe, expect, it } from "vitest";
import { deriveDiscoveryInsight } from "@/lib/home-insights";

describe("deriveDiscoveryInsight", () => {
  it("returns null when no document mentions a discovery keyword", () => {
    const result = deriveDiscoveryInsight([
      { id: "1", title: "Kita-Anmeldung", summary: "Anmeldeformular für die Kita." },
      { id: "2", title: "Elternbrief", summary: null },
    ]);
    expect(result).toBeNull();
  });

  it("surfaces the first document whose summary hints at a subsidy", () => {
    const result = deriveDiscoveryInsight([
      { id: "1", title: "Elternbrief", summary: "Informationen zum Schulausflug." },
      {
        id: "2",
        title: "GBS-Betreuung",
        summary: "Für die Nachmittagsbetreuung könnte es einen Zuschuss geben.",
      },
    ]);
    expect(result).toEqual({
      documentId: "2",
      documentTitle: "GBS-Betreuung",
      message: "Für die Nachmittagsbetreuung könnte es einen Zuschuss geben.",
    });
  });

  it("matches case-insensitively and falls back to a generic title", () => {
    const result = deriveDiscoveryInsight([
      { id: "1", title: null, summary: "ErmäßiGung möglich laut Bescheid." },
    ]);
    expect(result?.documentTitle).toBe("Dokument");
  });
});
