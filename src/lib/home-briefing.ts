/**
 * "Heute" hero logic — pure, testable functions that turn the data the
 * home page already loads into the hero state for the big "Heute" card:
 * the single most important thing right now (overdue task > due today >
 * due tomorrow > urgent insight > calm). Deterministic by design: no
 * LLM, no hallucination risk, same input → same hero.
 *
 * (The one-sentence daily briefing under the greeting was cut in the
 * distill pass: it repeated exactly what the hero card and the journal
 * header line already show.)
 *
 * All user-facing strings are German (Hauptschul-Niveau, warm, direct).
 */

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
// Hero selection
// ---------------------------------------------------------------------------

/**
 * Select the hero state for the "Heute" card.
 *
 * Priority chain: overdue task > task due today > task due tomorrow >
 * calm. Tasks due later than tomorrow stay in the "Als Nächstes" list —
 * the hero only speaks up when something is close. (The insight variant
 * was cut together with the "Hinweise" section: the count-based insights
 * were trivia, and the deadline ones duplicated this very hero.)
 *
 * @param facts - The derived briefing facts.
 */
export function selectHomeHero(facts: BriefingFacts): HomeHeroState {
  if (facts.overdueTasks.length > 0) {
    return { kind: "task", urgency: "overdue", task: facts.overdueTasks[0] };
  }
  if (facts.dueTodayTasks.length > 0) {
    return { kind: "task", urgency: "today", task: facts.dueTodayTasks[0] };
  }
  if (facts.dueTomorrowTasks.length > 0) {
    return { kind: "task", urgency: "tomorrow", task: facts.dueTomorrowTasks[0] };
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
