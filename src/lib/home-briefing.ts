/**
 * Home briefing and "Heute" hero logic — pure, testable functions that
 * turn the data the home page already loads into two things:
 *
 *   1. A one-sentence German daily briefing shown under the greeting
 *      ("Heute ist 'Kita-Ausflug' fällig — außerdem warten 2 Dokumente
 *      auf dein OK."). Deterministic by design: no LLM, no hallucination
 *      risk, same input → same sentence.
 *   2. The hero state for the big "Heute" card: the single most
 *      important thing right now (overdue task > due today > due
 *      tomorrow > urgent insight > calm).
 *
 * All user-facing strings are German (Hauptschul-Niveau, warm, direct).
 */

import type { HomeInsight } from "@/lib/ai/insights";
import { toLocalDateStr, type HomeTask } from "@/lib/home-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The facts the briefing and the hero are computed from. */
export interface BriefingFacts {
  /** Open, confirmed tasks with a due_date before today (most overdue first). */
  overdueTasks: HomeTask[];
  /** Open, confirmed tasks due today. */
  dueTodayTasks: HomeTask[];
  /** Open, confirmed tasks due tomorrow. */
  dueTomorrowTasks: HomeTask[];
  /** Documents with status 'analyzed' waiting for the user's confirmation. */
  unconfirmedDocCount: number;
}

/** The state the "Heute" hero card renders. */
export type HomeHeroState =
  | { kind: "task"; urgency: "overdue" | "today" | "tomorrow"; task: HomeTask }
  | { kind: "insight"; insight: HomeInsight }
  | { kind: "calm" };

// ---------------------------------------------------------------------------
// Fact derivation
// ---------------------------------------------------------------------------

/**
 * Derive the briefing facts from the raw home data.
 *
 * Only open, confirmed tasks with a due date take part — the same set the
 * "Als Nächstes" section is built from, so the briefing never announces
 * something the list below contradicts.
 *
 * @param tasks - All open confirmed tasks (any due date).
 * @param unconfirmedDocCount - Number of documents awaiting confirmation.
 * @param referenceDate - "Today" (defaults to now, injectable for tests).
 */
export function deriveBriefingFacts(
  tasks: HomeTask[],
  unconfirmedDocCount: number,
  referenceDate: Date = new Date(),
): BriefingFacts {
  const today = toLocalDateStr(referenceDate);
  const tomorrow = toLocalDateStr(
    new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate() + 1,
    ),
  );

  const dated = tasks
    .filter((t) => t.status === "open" && t.confirmed && t.due_date !== null)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));

  return {
    overdueTasks: dated.filter((t) => t.due_date! < today),
    dueTodayTasks: dated.filter((t) => t.due_date! === today),
    dueTomorrowTasks: dated.filter((t) => t.due_date! === tomorrow),
    unconfirmedDocCount,
  };
}

// ---------------------------------------------------------------------------
// Briefing sentence
// ---------------------------------------------------------------------------

/** German plural helper for the document clause. */
function documentClause(count: number): string {
  return count === 1
    ? "1 Dokument wartet auf dein OK"
    : `${count} Dokumente warten auf dein OK`;
}

/**
 * Compose the one-sentence daily briefing.
 *
 * Priority: overdue > due today > due tomorrow > unconfirmed documents >
 * calm. A task-based main clause picks up the document clause as a
 * secondary sentence when documents are also waiting.
 *
 * @param facts - The derived briefing facts.
 * @returns One or two short German sentences.
 */
export function composeBriefing(facts: BriefingFacts): string {
  const { overdueTasks, dueTodayTasks, dueTomorrowTasks, unconfirmedDocCount } =
    facts;

  // Verb-second word order after "Außerdem" ("Außerdem warten 2 Dokumente
  // auf dein OK.") — documentClause keeps subject-first order for the
  // standalone, docs-first sentence below.
  const docsSuffix =
    unconfirmedDocCount > 0
      ? unconfirmedDocCount === 1
        ? " Außerdem wartet 1 Dokument auf dein OK."
        : ` Außerdem warten ${unconfirmedDocCount} Dokumente auf dein OK.`
      : "";

  if (overdueTasks.length === 1) {
    return `„${overdueTasks[0].title}" ist überfällig — am besten heute erledigen.${docsSuffix}`;
  }
  if (overdueTasks.length > 1) {
    return `${overdueTasks.length} Aufgaben sind überfällig — „${overdueTasks[0].title}" zuerst.${docsSuffix}`;
  }
  if (dueTodayTasks.length === 1) {
    return `Heute ist „${dueTodayTasks[0].title}" fällig.${docsSuffix}`;
  }
  if (dueTodayTasks.length > 1) {
    return `Heute sind ${dueTodayTasks.length} Aufgaben fällig — „${dueTodayTasks[0].title}" zuerst.${docsSuffix}`;
  }
  if (dueTomorrowTasks.length === 1) {
    return `Morgen ist „${dueTomorrowTasks[0].title}" fällig — heute ist noch alles ruhig.${docsSuffix}`;
  }
  if (dueTomorrowTasks.length > 1) {
    return `Morgen sind ${dueTomorrowTasks.length} Aufgaben fällig — heute ist noch alles ruhig.${docsSuffix}`;
  }
  if (unconfirmedDocCount > 0) {
    return `${documentClause(unconfirmedDocCount)} — sonst ist alles ruhig.`;
  }
  return "Alles erledigt — die Woche sieht ruhig aus.";
}

// ---------------------------------------------------------------------------
// Hero selection
// ---------------------------------------------------------------------------

/**
 * Select the hero state for the "Heute" card.
 *
 * Priority chain: overdue task > task due today > task due tomorrow >
 * first urgent insight > calm. Tasks due later than tomorrow stay in the
 * "Als Nächstes" list — the hero only speaks up when something is close.
 *
 * @param facts - The derived briefing facts.
 * @param insights - The proactive insights (already urgency-sorted).
 */
export function selectHomeHero(
  facts: BriefingFacts,
  insights: HomeInsight[],
): HomeHeroState {
  if (facts.overdueTasks.length > 0) {
    return { kind: "task", urgency: "overdue", task: facts.overdueTasks[0] };
  }
  if (facts.dueTodayTasks.length > 0) {
    return { kind: "task", urgency: "today", task: facts.dueTodayTasks[0] };
  }
  if (facts.dueTomorrowTasks.length > 0) {
    return { kind: "task", urgency: "tomorrow", task: facts.dueTomorrowTasks[0] };
  }
  const urgent = insights.find((i) => i.tone === "urgent");
  if (urgent) {
    return { kind: "insight", insight: urgent };
  }
  return { kind: "calm" };
}

// ---------------------------------------------------------------------------
// Suggestion chips
// ---------------------------------------------------------------------------

/**
 * Derive contextual chat suggestion chips from the briefing facts.
 *
 * The chips teach the assistant by suggesting the questions a family
 * actually has in the current situation — always at most three, always
 * phrased as a ready-to-send question.
 */
export function deriveSuggestionChips(facts: BriefingFacts): string[] {
  const chips: string[] = [];

  if (facts.overdueTasks.length > 0) {
    chips.push("Was ist überfällig?");
  } else if (facts.dueTodayTasks.length > 0) {
    chips.push("Was ist heute fällig?");
  } else {
    chips.push("Was steht diese Woche an?");
  }

  if (facts.unconfirmedDocCount > 0) {
    chips.push("Welche Dokumente muss ich bestätigen?");
  }

  chips.push("Was wurde zuletzt gescannt?");

  return chips.slice(0, 3);
}
