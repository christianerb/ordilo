import { describe, expect, it } from "vitest";
import { acceptedNaturalAnswer } from "../chat";
import type { ToolContext } from "../tools";

const id = "10000000-0000-4000-8000-000000000001";
const pageText = "Audi BKK – Emma Erb. Versicherungsnummer von Emma Erb bei der Audi BKK: [Versicherungsnummer]";
const today = new Date("2026-10-22T10:00:00Z");

function context(claimText = "Emma ist bei der Audi BKK krankenversichert."): ToolContext {
  return {
    client: {} as ToolContext["client"],
    familyId: "family-a",
    sources: [],
    speakerName: "Christian",
    documentQuestion: "Welche Krankenkasse hat Emma?",
    preloadedFamilyMembers: [{ name: "Emma Erb", role: "Tochter" }, { name: "Hanna Erb", role: "Tochter" }],
    documentEvidence: [{ documentId: id, title: "Audi BKK – Emma Erb", page: 1, text: pageText }],
    documentAnswer: {
      text: claimText,
      state: "answered",
      sources: [{ document_id: id, title: "Audi BKK – Emma Erb", excerpt: pageText, quote: pageText, highlight: "Audi BKK", score: 1, origin: "semantic", cited: true }],
    },
  };
}
const input = [{ role: "user" as const, content: "Welche Krankenkasse hat Emma?" }];

describe("acceptedNaturalAnswer", () => {
  it("accepts a natural rewording with a compound the pages imply", () => {
    const answer = "Emma ist bei der **Audi BKK** krankenversichert, so steht es in ihrer Versicherungsnotiz. Damit habt ihr die Kasse schnell zur Hand.";
    expect(acceptedNaturalAnswer(answer, context(), input, today)).toBe(answer);
  });

  it.each([
    ["swaps the institution", "Emma ist bei der AOK krankenversichert."],
    ["drops the highlighted value", "Emma ist gesetzlich krankenversichert."],
    ["drops the person the claim names", "Sie ist bei der Audi BKK krankenversichert."],
    ["invents a person", "Emma ist über Dr. Müller bei der Audi BKK krankenversichert."],
    ["names an unread long institution", "Emma ist bei der Audi BKK und der Techniker Krankenkasse versichert."],
    ["adds an unread number", "Emma ist seit 2019 bei der Audi BKK krankenversichert."],
    ["hedges", "Emma ist vermutlich bei der Audi BKK krankenversichert."],
    ["reverses the claim", "Emma ist nicht bei der Audi BKK krankenversichert."],
    ["reverses it with kein", "Emma hat keine Versicherung bei der Audi BKK."],
  ])("rejects an answer that %s", (_name, answer) => {
    expect(acceptedNaturalAnswer(answer, context(), input, today)).toBeNull();
  });

  it("rejects a past date talked about as still ahead", () => {
    const ctx = context("Die Mitgliedschaft endete am 31.07.2026.");
    ctx.documentEvidence = [{ documentId: id, title: "Audi BKK – Emma Erb", page: 1, text: `${pageText} Ende der Mitgliedschaft: 31.07.2026` }];
    ctx.documentAnswer!.sources[0].highlight = undefined;
    expect(acceptedNaturalAnswer("Emmas Mitgliedschaft bei der Audi BKK endet am 31.07.2026.", ctx, input, today)).toBeNull();
    expect(acceptedNaturalAnswer("Emmas Mitgliedschaft bei der Audi BKK ist am 31.07.2026 abgelaufen.", ctx, input, today)).not.toBeNull();
  });

  it("keeps a negation the claim itself carries", () => {
    const ctx = context("Emma ist nicht mehr bei der Audi BKK krankenversichert.");
    expect(acceptedNaturalAnswer("Emma ist nicht mehr bei der **Audi BKK** krankenversichert.", ctx, input, today)).not.toBeNull();
    expect(acceptedNaturalAnswer("Emma ist bei der Audi BKK krankenversichert.", ctx, input, today)).toBeNull();
  });

  it("needs a verified document answer", () => {
    const ctx = context();
    ctx.documentAnswer = undefined;
    expect(acceptedNaturalAnswer("Emma ist bei der Audi BKK krankenversichert.", ctx, input, today)).toBeNull();
  });
});
