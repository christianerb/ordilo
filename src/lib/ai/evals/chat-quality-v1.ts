import type { ChatResponseState } from "@ordilo/chat-contract";
import { FORBIDDEN_HEDGING_PHRASES } from "@/lib/schemas/chat";

export const CHAT_EVAL_VERSION = "chat-quality-v1";

export type ChatEvalCase = {
  id: string;
  knowledgeSpace: "family" | "general" | "web" | "mixed";
  question: string;
  expectedState: ChatResponseState;
  requiredFacts: string[];
  requiredSourceNames?: string[];
  forbiddenPhrases?: string[];
  maxWords: number;
  referenceAnswer: string;
};

export type ChatEvalResult = {
  id: string;
  score: number;
  failures: string[];
};

const DEFAULT_FORBIDDEN = [
  ...FORBIDDEN_HEDGING_PHRASES,
  "möglicherweise",
  "ich denke",
];

function normalized(value: string): string {
  return value.toLocaleLowerCase("de-DE").replace(/\s+/g, " ").trim();
}

/** Deterministic quality gate for captured or reference chat answers. */
export function scoreChatAnswer(
  testCase: ChatEvalCase,
  answer: string,
  state: ChatResponseState,
): ChatEvalResult {
  const failures: string[] = [];
  const text = normalized(answer);

  if (state !== testCase.expectedState) {
    failures.push(`state:${state}`);
  }
  for (const fact of testCase.requiredFacts) {
    if (!text.includes(normalized(fact))) failures.push(`fact:${fact}`);
  }
  for (const source of testCase.requiredSourceNames ?? []) {
    if (!text.includes(normalized(source))) failures.push(`source:${source}`);
  }
  for (const phrase of [
    ...DEFAULT_FORBIDDEN,
    ...(testCase.forbiddenPhrases ?? []),
  ]) {
    if (text.includes(normalized(phrase))) failures.push(`phrase:${phrase}`);
  }
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  if (words > testCase.maxWords) failures.push(`length:${words}`);

  const checkCount =
    1 +
    testCase.requiredFacts.length +
    (testCase.requiredSourceNames?.length ?? 0) +
    DEFAULT_FORBIDDEN.length +
    (testCase.forbiddenPhrases?.length ?? 0) +
    1;

  return {
    id: testCase.id,
    score: (checkCount - failures.length) / checkCount,
    failures,
  };
}

export const CHAT_QUALITY_CASES_V1: ChatEvalCase[] = [
  {
    id: "family-exact-date",
    knowledgeSpace: "family",
    question: "Wie lange ist Hannas Deutschlandticket gültig?",
    expectedState: "answered",
    requiredFacts: ["31. August 2027"],
    requiredSourceNames: ["Deutschlandticket"],
    maxWords: 35,
    referenceAnswer:
      "Hannas Deutschlandticket ist bis zum 31. August 2027 gültig. Quelle: Deutschlandticket.",
  },
  {
    id: "family-deadline",
    knowledgeSpace: "family",
    question: "Bis wann müssen wir auf den Kita-Brief antworten?",
    expectedState: "answered",
    requiredFacts: ["12. Juli 2026"],
    requiredSourceNames: ["Kita-Brief"],
    maxWords: 35,
    referenceAnswer:
      "Ihr müsst bis zum 12. Juli 2026 antworten. Das steht im Kita-Brief.",
  },
  {
    id: "family-partial",
    knowledgeSpace: "family",
    question: "Wann und wo ist der Elternabend?",
    expectedState: "partial",
    requiredFacts: ["18 Uhr", "Ort fehlt"],
    requiredSourceNames: ["Einladung"],
    maxWords: 55,
    referenceAnswer:
      "Gesichert ist 18 Uhr laut Einladung. Der Ort fehlt. Soll ich in weiteren Unterlagen danach suchen?",
  },
  {
    id: "family-conflict",
    knowledgeSpace: "family",
    question: "Wann ist der Ausflug?",
    expectedState: "conflict",
    requiredFacts: ["14. Juni", "15. Juni", "widersprechen"],
    maxWords: 55,
    referenceAnswer:
      "Die Angaben widersprechen sich: Der Brief nennt den 14. Juni, der Kalender den 15. Juni. Welches Datum wurde zuletzt bestätigt?",
  },
  {
    id: "family-not-found",
    knowledgeSpace: "family",
    question: "Wie lautet die Versicherungsnummer?",
    expectedState: "not_found",
    requiredFacts: ["Familien-Unterlagen", "nicht gefunden"],
    maxWords: 45,
    referenceAnswer:
      "Ich habe in den Familien-Unterlagen gesucht und die Versicherungsnummer nicht gefunden. Lade den Versicherungsbrief hoch oder nenne mir den Anbieter.",
  },
  {
    id: "general-stable",
    knowledgeSpace: "general",
    question: "Was ist der Unterschied zwischen Garantie und Gewährleistung?",
    expectedState: "answered",
    requiredFacts: ["freiwillig", "gesetzlich"],
    maxWords: 65,
    referenceAnswer:
      "Gewährleistung ist gesetzlich und betrifft Mängel, die schon beim Kauf bestanden. Eine Garantie ist eine freiwillige zusätzliche Zusage des Herstellers oder Händlers.",
  },
  {
    id: "web-current",
    knowledgeSpace: "web",
    question: "Was ändert sich aktuell beim Deutschlandticket?",
    expectedState: "answered",
    requiredFacts: ["aktuell"],
    requiredSourceNames: ["Bundesregierung"],
    maxWords: 65,
    referenceAnswer:
      "Aktuell gelten die von der Bundesregierung veröffentlichten Bedingungen. Quelle: Bundesregierung. Prüfe vor dem Kauf zusätzlich den Preis deines Verkehrsverbunds.",
  },
  {
    id: "mixed-public-and-family",
    knowledgeSpace: "mixed",
    question: "Gilt die neue Regel auch für Hannas Ticket?",
    expectedState: "partial",
    requiredFacts: ["öffentliche Regel", "Hannas Ticket", "nicht eindeutig"],
    maxWords: 65,
    referenceAnswer:
      "Die öffentliche Regel ist klar. Ob sie für Hannas Ticket gilt, ist in den Familien-Unterlagen nicht eindeutig. Soll ich die Vertragsdetails gezielt prüfen?",
  },
];
