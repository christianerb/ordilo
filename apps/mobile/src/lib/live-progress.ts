import { isChatActionToolName } from "@ordilo/chat-contract";

import type { AnswerCard, ChatStreamEvent } from "./chat";

/** Shown the moment a Live question reaches the backend. */
export const LIVE_PROGRESS_START = "Ich schaue in euren Unterlagen nach …";

/**
 * When Ordilo speaks a short "still working" update while the backend is
 * busy. GPT Live already restates the question as it delegates, so the
 * first update only comes once that sentence is over.
 */
export const LIVE_SPOKEN_PROGRESS_DELAYS_MS = [5_000, 12_000] as const;

/**
 * GPT Live accepts at most 500 tokens per append. German runs at roughly
 * four characters per token, so this stays well below the limit.
 */
const MAX_COMMENTARY_CHARS = 1_400;

const TOOL_PROGRESS: Record<string, string> = {
  search_documents: "Ich suche in euren Unterlagen …",
  read_document: "Ich lese die passende Stelle …",
  answer_from_documents: "Ich prüfe die Fundstelle …",
  list_documents: "Ich sehe eure Dokumente durch …",
  list_tasks: "Ich schaue in eure Aufgaben …",
  list_family_members: "Ich schaue, wer zur Familie gehört …",
  graph_query: "Ich suche Zusammenhänge …",
  search_web: "Ich prüfe aktuelle Infos …",
};

function toolProgress(toolName: string): string {
  if (TOOL_PROGRESS[toolName]) return TOOL_PROGRESS[toolName];
  if (isChatActionToolName(toolName)) return "Ich bereite einen Vorschlag vor …";
  return "Ich schaue nach …";
}

/**
 * Something GPT Live can say for an answer that arrived as a card. Login
 * details are never read out loud — the card on screen shows them.
 */
export function speakAnswerCard(card: AnswerCard): string {
  if (card.type === "zugangsdaten" || card.hasSecret) {
    return `Die Zugangsdaten für ${card.title} stehen jetzt auf dem Bildschirm.`;
  }
  return [
    card.title,
    card.subtitle,
    ...card.fields.map((field) => `${field.label}: ${field.value}`),
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(". ")
    .concat(".");
}

/** A "still working" update; it never contains a result. */
export function spokenProgress(foundTitle: string | null): string {
  return foundTitle
    ? `Zwischenstand, noch ohne Ergebnis: Ordilo hat die Unterlage „${foundTitle}“ gefunden und liest gerade nach.`
    : "Zwischenstand, noch ohne Ergebnis: Ordilo sucht noch in den Unterlagen der Familie.";
}

/**
 * Splits a long answer at sentence ends so each GPT Live append stays
 * under its size limit. Short answers come back unchanged as one part.
 */
export function splitForCommentary(
  text: string,
  maxChars: number = MAX_COMMENTARY_CHARS,
): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed ? [trimmed] : [];
  const sentences = trimmed.match(/[^.!?\n]+[.!?]*[\s]*|\n+/g) ?? [trimmed];
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && (current + sentence).length > maxChars) {
      parts.push(current.trim());
      current = "";
    }
    // A single run-on sentence longer than the limit is cut hard.
    let rest = sentence;
    while (rest.length > maxChars) {
      parts.push(rest.slice(0, maxChars).trim());
      rest = rest.slice(maxChars);
    }
    current += rest;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

export interface LiveTurnUpdate {
  /** New plain status for the Live bar. */
  progress?: string;
  /** The finished answer, as soon as the server has released it. */
  answer?: string;
}

/**
 * Follows one chat stream on behalf of a Live turn. The answer is final
 * at `answer_ready` — saving it afterwards is bookkeeping the listener
 * does not need to wait for.
 */
export function createLiveTurnCollector() {
  let text = "";
  let card: AnswerCard | null = null;
  let foundTitle: string | null = null;
  let finished = false;

  return {
    get foundTitle() {
      return foundTitle;
    },
    apply(event: ChatStreamEvent): LiveTurnUpdate {
      switch (event.type) {
        case "tool":
          if (event.state !== "start") return {};
          if (event.documentTitle) {
            foundTitle = event.documentTitle;
            return { progress: `Gefunden in: ${event.documentTitle}` };
          }
          return { progress: toolProgress(event.toolName) };
        case "text":
          text += event.content;
          return {};
        case "replace":
          text = event.content;
          return {};
        case "card":
          card = event.card;
          return {};
        case "answer_ready":
        case "done": {
          if (finished) return {};
          finished = true;
          const answer = text.trim() || (card ? speakAnswerCard(card) : "");
          return answer ? { answer } : {};
        }
        default:
          return {};
      }
    },
  };
}
