import { describe, expect, it } from "vitest";
import {
  extractWebCitations,
  sanitizeWebSearchQuery,
} from "@/lib/ai/web-search";
import { copiesPrivateExcerpt, copiesPrivateLink } from "@/lib/ai/tools";
import { readableQuote } from "@/lib/ai/document-evidence";

describe("sanitizeWebSearchQuery", () => {
  it("keeps an ordinary public query", () => {
    expect(
      sanitizeWebSearchQuery("Deutschlandticket Regeln 2026"),
    ).toEqual({
      ok: true,
      query: "Deutschlandticket Regeln 2026",
      changed: false,
    });
  });

  it("removes family names and structured identifiers", () => {
    const result = sanitizeWebSearchQuery(
      "Wie gelten die Regeln für Hanna Erb mit IBAN DE89 3704 0044 0532 0130 00?",
      ["Hanna Erb"],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query).toBe("Wie gelten die Regeln für mit ?");
    expect(result.query).not.toMatch(/Hanna|Erb|DE89/);
    expect(result.changed).toBe(true);
  });

  it("redacts Unicode names and private customer references", () => {
    const result = sanitizeWebSearchQuery(
      "Was gilt für Özlems Kundennummer 87654321 beim Deutschlandticket?",
      ["Özlem"],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query).toContain("Deutschlandticket");
    expect(result.query).not.toMatch(/Özlem|87654321/);
  });

  it("redacts customer references with punctuation in the label", () => {
    const result = sanitizeWebSearchQuery(
      "Deutschlandticket Regeln für Kunden-Nr. 87654321",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query).not.toContain("87654321");
    expect(result.query).not.toContain("Kunden-Nr.");
  });

  it("removes contact details, addresses, dates, and UUIDs", () => {
    const result = sanitizeWebSearchQuery(
      "Termin 12.09.2026 für test@example.de, +49 170 1234567, Hauptstraße 12, 10115, 123e4567-e89b-42d3-a456-426614174000: Kita Regeln",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query).toContain("Kita Regeln");
    expect(result.query).not.toMatch(
      /12\.09|example|\+49|Hauptstraße|10115|123e4567/,
    );
  });

  it("blocks a query that becomes empty after redaction", () => {
    expect(
      sanitizeWebSearchQuery(
        "Hanna Erb 12.09.2026 test@example.de",
        ["Hanna Erb"],
      ),
    ).toEqual({ ok: false, reason: "too_private" });
  });

  it("blocks sensitive queries with one- and two-character names", () => {
    expect(
      sanitizeWebSearchQuery("Welche Leukämie-Behandlung bekommt Li?", [
        "Li",
      ]),
    ).toEqual({ ok: false, reason: "too_private" });
    expect(
      sanitizeWebSearchQuery("Welche Behandlung bekommt X?", ["X"]),
    ).toEqual({ ok: false, reason: "too_private" });
  });

  it("redacts short names from ordinary queries", () => {
    const result = sanitizeWebSearchQuery(
      "Deutschlandticket Regeln für Li und Al",
      ["Li", "Al"],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query).toBe("Deutschlandticket Regeln für und");
    expect(result.query).not.toMatch(/\bLi\b|\bAl\b/);
  });

  it("keeps common words that merely resemble short names", () => {
    const sentenceInitial = sanitizeWebSearchQuery(
      "Als was gilt das Deutschlandticket?",
      ["Al"],
    );
    expect(sentenceInitial.ok).toBe(true);
    if (sentenceInitial.ok) {
      expect(sentenceInitial.query).toContain("Als");
    }

    const particle = sanitizeWebSearchQuery("Wie melde ich mich an?", [
      "An",
    ]);
    expect(particle.ok).toBe(true);
    if (particle.ok) {
      expect(particle.query).toContain("an");
    }
  });

  it("blocks private medical and financial circumstances", () => {
    expect(
      sanitizeWebSearchQuery(
        "Welche Behandlung gibt es für Hannas Leukämie?",
        ["Hanna"],
      ),
    ).toEqual({ ok: false, reason: "too_private" });
    expect(
      sanitizeWebSearchQuery("Was kann ich gegen meine Schulden tun?"),
    ).toEqual({ ok: false, reason: "too_private" });
    expect(
      sanitizeWebSearchQuery("Welche Behandlung gibt es für Leukämie?"),
    ).toMatchObject({ ok: true });
  });
});

describe("copiesPrivateExcerpt", () => {
  it("blocks a verbatim six-word passage", () => {
    expect(
      copiesPrivateExcerpt(
        "Suche das vorläufige Deutschlandticket für Schülerinnen ist gültig",
        [
          "Das vorläufige Deutschlandticket für Schülerinnen ist gültig bis zum Schuljahresende.",
        ],
      ),
    ).toBe(true);
  });

  it("allows a generalized public query", () => {
    expect(
      copiesPrivateExcerpt("Deutschlandticket Gültigkeit Schüler aktuell", [
        "Das vorläufige Deutschlandticket für Schülerinnen ist gültig bis zum Schuljahresende.",
      ]),
    ).toBe(false);
  });
});

describe("copiesPrivateLink", () => {
  const page =
    "Anmeldung unter [hier](https://bit.ly/X7Ab9) oder www.x.de/invite/abc123. Mehr auf https://stadtwerke-sonnenfeld.de.";

  it("blocks short private link destinations, with or without scheme", () => {
    expect(copiesPrivateLink("was ist https://bit.ly/X7Ab9", [page])).toBe(true);
    expect(copiesPrivateLink("bit.ly/x7ab9 Einladung", [page])).toBe(true);
    expect(copiesPrivateLink("x.de/invite/abc123", [page])).toBe(true);
  });

  it("blocks private links whose secret sits in the query or fragment", () => {
    const letter = "Zusagen: https://example.de?invite=X7Ab9 oder https://example.org#t=QZ81.";
    expect(copiesPrivateLink("example.de?invite=X7Ab9", [letter])).toBe(true);
    expect(copiesPrivateLink("https://example.org#t=QZ81", [letter])).toBe(true);
  });

  it("blocks a private link with its parameters dropped, or just its code", () => {
    const letter = "Einladung: https://schule.example/invite/X7Ab9?utm_source=brief";
    expect(copiesPrivateLink("schule.example/invite/X7Ab9", [letter])).toBe(true);
    expect(copiesPrivateLink("Einladung X7Ab9 Schule", [letter])).toBe(true);
    expect(copiesPrivateLink("Schule Einladung Elternabend Regeln", [letter])).toBe(false);
  });

  it("never sends a deep link to public search", () => {
    expect(copiesPrivateLink("was steht auf https://irgendwo.example/seite?id=5", [])).toBe(true);
    expect(copiesPrivateLink("Deutschlandticket Regeln 2026", [])).toBe(false);
  });

  it("still blocks a link from a cleaned excerpt saved in an earlier turn", () => {
    const saved = readableQuote("Zusagen [hier](https://schule.example/r/K7f3) bis Freitag.");
    expect(copiesPrivateLink("schule.example/r/K7f3 Zusage", [saved])).toBe(true);
  });

  it("recognizes printed links without a scheme", () => {
    const letter = "Rückmeldung bitte unter schule.example/r/K7f3 oder kurz.li?c=88Z.";
    expect(copiesPrivateLink("schule.example/r/K7f3", [letter])).toBe(true);
    expect(copiesPrivateLink("kurz.li?c=88Z", [letter])).toBe(true);
    expect(copiesPrivateLink("schule.example Elternabend", [letter])).toBe(false);
  });

  it("allows the sender's bare domain", () => {
    expect(copiesPrivateLink("stadtwerke-sonnenfeld.de Abschlag ändern", [page])).toBe(false);
  });
});

describe("extractWebCitations", () => {
  it("keeps unique HTTPS citations only", () => {
    const response = {
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://example.de/info",
                  title: "Beispiel",
                },
                {
                  type: "url_citation",
                  url: "https://example.de/info",
                  title: "Doppelt",
                },
                {
                  type: "url_citation",
                  url: "http://unsafe.example/info",
                  title: "Unsicher",
                },
              ],
            },
          ],
        },
      ],
    };

    expect(extractWebCitations(response)).toEqual([
      {
        url: "https://example.de/info",
        title: "Beispiel",
      },
    ]);
  });

  it("drops private and local HTTPS targets", () => {
    const response = {
      output: [
        {
          content: [
            {
              annotations: [
                {
                  type: "url_citation",
                  url: "https://localhost/private",
                  title: "Lokal",
                },
                {
                  type: "url_citation",
                  url: "https://192.168.1.2/private",
                  title: "Privat",
                },
              ],
            },
          ],
        },
      ],
    };

    expect(extractWebCitations(response)).toEqual([]);
  });
});
