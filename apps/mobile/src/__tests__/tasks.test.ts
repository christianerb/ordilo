import {
  formatOverdueLabel,
  formatTaskDayHint,
  formatTaskDueLabel,
  getTaskSection,
  getTaskStatusLabel,
  RECENT_DONE_DAYS,
  recentDoneCutoff,
  resolveSchedulePreset,
  sortTasksByCompletion,
  sortTasksByDate,
  TASK_SECTIONS,
  validateTaskInput,
} from "../lib/tasks";

// Ported from src/lib/__tests__/task-utils.test.ts (web) — the native
// planner must agree with the web on every one of these behaviors.

describe("task status labels", () => {
  it("labels the three statuses in German with an Offen fallback", () => {
    expect(getTaskStatusLabel("open")).toBe("Offen");
    expect(getTaskStatusLabel("done")).toBe("Erledigt");
    expect(getTaskStatusLabel("dismissed")).toBe("Verworfen");
    expect(getTaskStatusLabel("unknown")).toBe("Offen");
  });
});

describe("getTaskSection", () => {
  const TODAY = "2026-08-10";

  it("puts a done task in 'done' regardless of its date", () => {
    expect(
      getTaskSection({ status: "done", due_date: "2026-08-01" }, TODAY),
    ).toBe("done");
    expect(getTaskSection({ status: "done", due_date: null }, TODAY)).toBe(
      "done",
    );
  });

  it("treats overdue and today alike — both are 'jetzt dran'", () => {
    expect(
      getTaskSection({ status: "open", due_date: "2026-07-01" }, TODAY),
    ).toBe("now");
    expect(getTaskSection({ status: "open", due_date: TODAY }, TODAY)).toBe(
      "now",
    );
  });

  it("puts everything still to come in 'next' and undated in its own section", () => {
    expect(
      getTaskSection({ status: "open", due_date: "2026-09-01" }, TODAY),
    ).toBe("next");
    expect(getTaskSection({ status: "open", due_date: null }, TODAY)).toBe(
      "undated",
    );
  });

  it("keeps the section config in the order a family reads it", () => {
    expect(TASK_SECTIONS.map((section) => section.id)).toEqual([
      "now",
      "next",
      "undated",
      "done",
    ]);
    expect(TASK_SECTIONS.map((section) => section.label)).toEqual([
      "Jetzt dran",
      "Als Nächstes",
      "Ohne Termin",
      "Erledigt",
    ]);
  });
});

describe("resolveSchedulePreset", () => {
  const MONDAY = "2026-08-10";

  it("resolves today and tomorrow", () => {
    expect(resolveSchedulePreset("today", MONDAY)).toBe(MONDAY);
    expect(resolveSchedulePreset("tomorrow", MONDAY)).toBe("2026-08-11");
  });

  it("resolves 'Wochenende' to the coming Saturday, never a no-op", () => {
    expect(resolveSchedulePreset("weekend", MONDAY)).toBe("2026-08-15");
    expect(resolveSchedulePreset("weekend", "2026-08-15")).toBe("2026-08-22");
  });

  it("resolves 'Nächste Woche' to the coming Monday", () => {
    expect(resolveSchedulePreset("next-week", MONDAY)).toBe("2026-08-17");
    expect(resolveSchedulePreset("next-week", "2026-08-13")).toBe("2026-08-17");
  });

  it("clears the date for 'Kein Termin'", () => {
    expect(resolveSchedulePreset("none", MONDAY)).toBeNull();
  });
});

describe("formatTaskDueLabel", () => {
  const TODAY = "2026-08-10"; // a Monday

  it("names the days around today", () => {
    expect(formatTaskDueLabel(TODAY, TODAY)).toBe("Heute");
    expect(formatTaskDueLabel("2026-08-11", TODAY)).toBe("Morgen");
    expect(formatTaskDueLabel("2026-08-09", TODAY)).toBe("Gestern");
  });

  it("uses the weekday inside the coming week, a short date further out", () => {
    expect(formatTaskDueLabel("2026-08-13", TODAY)).toBe("Do");
    expect(formatTaskDueLabel("2026-09-01", TODAY)).toBe("1. Sep.");
    expect(formatTaskDueLabel("2026-08-03", TODAY)).toBe("3. Aug.");
  });

  it("returns null without a due date", () => {
    expect(formatTaskDueLabel(null, TODAY)).toBeNull();
  });
});

describe("formatTaskDayHint", () => {
  it("spells out which day a preset lands on", () => {
    expect(formatTaskDayHint("2026-08-15")).toBe("Sa, 15. Aug.");
    expect(formatTaskDayHint("2026-09-01")).toBe("Di, 1. Sep.");
    expect(formatTaskDayHint(null)).toBeNull();
  });
});

describe("formatOverdueLabel", () => {
  const TODAY = "2026-08-10";

  it("counts the days a task is late", () => {
    expect(formatOverdueLabel("2026-08-09", TODAY)).toBe("seit gestern");
    expect(formatOverdueLabel("2026-08-07", TODAY)).toBe("seit 3 Tagen");
  });

  it("switches to weeks once days stop being useful", () => {
    expect(formatOverdueLabel("2026-07-31", TODAY)).toBe("seit 10 Tagen");
    expect(formatOverdueLabel("2026-07-27", TODAY)).toBe("seit 2 Wochen");
  });

  it("returns null for anything not overdue", () => {
    expect(formatOverdueLabel(TODAY, TODAY)).toBeNull();
    expect(formatOverdueLabel(null, TODAY)).toBeNull();
  });
});

describe("sorting", () => {
  it("reads the Erledigt list backwards from now", () => {
    const sorted = sortTasksByCompletion([
      { id: "a", completed_at: "2026-08-08T10:00:00Z" },
      { id: "b", completed_at: "2026-08-10T09:00:00Z" },
      { id: "c", completed_at: "2026-08-09T18:00:00Z" },
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts open tasks by due date with undated last", () => {
    const sorted = sortTasksByDate([
      { id: "undated", due_date: null },
      { id: "later", due_date: "2026-09-01" },
      { id: "sooner", due_date: "2026-08-12" },
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["sooner", "later", "undated"]);
  });
});

describe("recentDoneCutoff", () => {
  it("looks exactly one window back and is PostgREST-safe", () => {
    const now = new Date("2026-08-16T12:00:00.000Z");
    expect(recentDoneCutoff(now)).toBe("2026-08-09T12:00:00.000Z");
    expect(RECENT_DONE_DAYS).toBe(7);
    // Embedded in an `.or()` string, so it must not contain a comma.
    expect(recentDoneCutoff(now)).not.toContain(",");
  });
});

describe("validateTaskInput", () => {
  const TODAY = "2026-08-22";

  it("trims the title and carries optional fields", () => {
    const result = validateTaskInput(
      {
        title: "  Rechnung bezahlen  ",
        description: "Stadtwerke",
        dueDate: "2026-08-25",
        assignedTo: "member-1",
      },
      TODAY,
    );
    expect(result).toEqual({
      success: true,
      data: {
        title: "Rechnung bezahlen",
        description: "Stadtwerke",
        dueDate: "2026-08-25",
        assignedTo: "member-1",
      },
    });
  });

  it("rejects an empty title with a German message", () => {
    expect(validateTaskInput({ title: "   " }, TODAY)).toEqual({
      success: false,
      error: "Bitte gib einen Titel ein.",
    });
  });

  it("rejects a past due date like the web create sheet", () => {
    expect(
      validateTaskInput({ title: "Test", dueDate: "2026-08-21" }, TODAY),
    ).toEqual({
      success: false,
      error: "Bitte wähle heute oder einen späteren Tag.",
    });
    expect(
      validateTaskInput({ title: "Test", dueDate: TODAY }, TODAY).success,
    ).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(
      validateTaskInput({ title: "Test", dueDate: "22.08.2026" }, TODAY),
    ).toEqual({ success: false, error: "Bitte wähle ein Datum." });
  });

  it("keeps an unchanged past date editable when explicitly allowed", () => {
    // Editing an overdue task without touching its date must not fail.
    expect(
      validateTaskInput({ title: "Test", dueDate: "2026-08-01" }, TODAY, true)
        .success,
    ).toBe(true);
  });
});
