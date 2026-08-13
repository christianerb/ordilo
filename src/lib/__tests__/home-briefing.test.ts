import { describe, it, expect } from "vitest";
import {
  deriveBriefingFacts,
  selectHomeHero,
  deriveSuggestionChips,
  type BriefingFacts,
} from "@/lib/home-briefing";
import type { HomeTask } from "@/lib/home-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<HomeTask> = {}): HomeTask {
  return {
    id: "task-1",
    family_id: "fam-1",
    title: "Rechnung bezahlen",
    description: null,
    due_date: "2026-07-10",
    status: "open",
    confidence: 0.9,
    confirmed: true,
    created_at: "2026-07-01T00:00:00Z",
    tags: [],
    document_id: "doc-1",
    document_title: "Stromrechnung",
    ...overrides,
  };
}

function makeFacts(overrides: Partial<BriefingFacts> = {}): BriefingFacts {
  return {
    overdueTasks: [],
    dueTodayTasks: [],
    dueTomorrowTasks: [],
    unconfirmedDocCount: 0,
    ...overrides,
  };
}

// Reference date: 2026-07-06 (today), tomorrow = 2026-07-07
const TODAY = new Date(2026, 6, 6);

// ---------------------------------------------------------------------------
// deriveBriefingFacts
// ---------------------------------------------------------------------------

describe("deriveBriefingFacts", () => {
  it("splits tasks into overdue / today / tomorrow buckets, sorted", () => {
    const tasks = [
      makeTask({ id: "t-today", due_date: "2026-07-06" }),
      makeTask({ id: "t-overdue-2", due_date: "2026-07-01" }),
      makeTask({ id: "t-tomorrow", due_date: "2026-07-07" }),
      makeTask({ id: "t-overdue-1", due_date: "2026-06-20" }),
      makeTask({ id: "t-later", due_date: "2026-07-20" }),
    ];
    const facts = deriveBriefingFacts(tasks, 0, TODAY);
    expect(facts.overdueTasks.map((t) => t.id)).toEqual([
      "t-overdue-1",
      "t-overdue-2",
    ]);
    expect(facts.dueTodayTasks.map((t) => t.id)).toEqual(["t-today"]);
    expect(facts.dueTomorrowTasks.map((t) => t.id)).toEqual(["t-tomorrow"]);
  });

  it("ignores unconfirmed, done, and undated tasks", () => {
    const tasks = [
      makeTask({ id: "unconfirmed", due_date: "2026-07-01", confirmed: false }),
      makeTask({ id: "done", due_date: "2026-07-01", status: "done" }),
      makeTask({ id: "undated", due_date: null }),
    ];
    const facts = deriveBriefingFacts(tasks, 2, TODAY);
    expect(facts.overdueTasks).toHaveLength(0);
    expect(facts.unconfirmedDocCount).toBe(2);
  });
});
// ---------------------------------------------------------------------------
// selectHomeHero
// ---------------------------------------------------------------------------

describe("selectHomeHero", () => {
  it("prefers the most overdue task over everything", () => {
    const hero = selectHomeHero(
      makeFacts({
        overdueTasks: [makeTask({ id: "late" })],
        dueTodayTasks: [makeTask({ id: "today" })],
      }),
    );
    expect(hero).toEqual({
      kind: "task",
      urgency: "overdue",
      task: expect.objectContaining({ id: "late" }),
    });
  });

  it("prefers due today over due tomorrow", () => {
    const hero = selectHomeHero(
      makeFacts({
        dueTodayTasks: [makeTask({ id: "today" })],
        dueTomorrowTasks: [makeTask({ id: "tomorrow" })],
      }),
    );
    expect(hero).toMatchObject({ kind: "task", urgency: "today" });
  });

  it("shows a task due tomorrow", () => {
    const hero = selectHomeHero(
      makeFacts({ dueTomorrowTasks: [makeTask({ id: "tomorrow" })] }),
    );
    expect(hero).toMatchObject({ kind: "task", urgency: "tomorrow" });
  });

  it("is calm when nothing is close", () => {
    expect(selectHomeHero(makeFacts())).toEqual({ kind: "calm" });
  });
});

// ---------------------------------------------------------------------------
// deriveSuggestionChips
// ---------------------------------------------------------------------------

describe("deriveSuggestionChips", () => {
  it("asks about overdue tasks when some exist", () => {
    const chips = deriveSuggestionChips(
      makeFacts({ overdueTasks: [makeTask()] }),
    );
    expect(chips[0]).toBe("Was ist überfällig?");
  });

  it("asks about today when something is due today", () => {
    const chips = deriveSuggestionChips(
      makeFacts({ dueTodayTasks: [makeTask()] }),
    );
    expect(chips[0]).toBe("Was ist heute fällig?");
  });

  it("asks about the week in the calm state", () => {
    const chips = deriveSuggestionChips(makeFacts());
    expect(chips[0]).toBe("Was steht diese Woche an?");
  });

  it("includes the review question when documents wait", () => {
    const chips = deriveSuggestionChips(makeFacts({ unconfirmedDocCount: 2 }));
    expect(chips).toContain("Welche Dokumente muss ich bestätigen?");
  });

  it("never returns more than three chips", () => {
    const chips = deriveSuggestionChips(
      makeFacts({ overdueTasks: [makeTask()], unconfirmedDocCount: 2 }),
    );
    expect(chips.length).toBeLessThanOrEqual(3);
  });
});
