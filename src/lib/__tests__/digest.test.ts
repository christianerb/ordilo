import { describe, it, expect } from "vitest";

import {
  buildFamilyDigest,
  digestSubject,
  digestText,
  digestHtml,
  type DigestTask,
} from "@/lib/digest";

const TODAY = "2026-07-12";

function task(overrides: Partial<DigestTask> = {}): DigestTask {
  return {
    id: "task-1",
    title: "Rechnung bezahlen",
    due_date: "2026-07-14",
    priority: "high",
    ...overrides,
  };
}

describe("buildFamilyDigest", () => {
  it("splits tasks into overdue and upcoming, sorted by due date", () => {
    const digest = buildFamilyDigest(
      "fam-1",
      "Erb",
      [
        task({ id: "a", due_date: "2026-07-15" }),
        task({ id: "b", due_date: "2026-07-01", title: "Alte Frist" }),
        task({ id: "c", due_date: "2026-07-13" }),
        task({ id: "d", due_date: "2026-06-20", title: "Uralte Frist" }),
      ],
      TODAY,
    );
    expect(digest).not.toBeNull();
    expect(digest!.overdue.map((t) => t.id)).toEqual(["d", "b"]);
    expect(digest!.upcoming.map((t) => t.id)).toEqual(["c", "a"]);
  });

  it("counts a task due today as upcoming, not overdue", () => {
    const digest = buildFamilyDigest(
      "fam-1",
      "Erb",
      [task({ due_date: TODAY })],
      TODAY,
    );
    expect(digest!.overdue).toHaveLength(0);
    expect(digest!.upcoming).toHaveLength(1);
  });

  it("returns null when there is nothing to say", () => {
    expect(buildFamilyDigest("fam-1", "Erb", [], TODAY)).toBeNull();
  });
});

describe("digestSubject", () => {
  it("leads with overdue when present", () => {
    const digest = buildFamilyDigest(
      "fam-1",
      "Erb",
      [
        task({ due_date: "2026-07-01" }),
        task({ id: "x", due_date: "2026-07-02" }),
      ],
      TODAY,
    )!;
    expect(digestSubject(digest)).toBe(
      "2 Fristen sind überfällig — Ordilo erinnert dich",
    );
  });

  it("uses the singular for a single upcoming deadline", () => {
    const digest = buildFamilyDigest("fam-1", "Erb", [task()], TODAY)!;
    expect(digestSubject(digest)).toBe("Eine Frist steht diese Woche an");
  });
});

describe("digestText / digestHtml", () => {
  const digest = buildFamilyDigest(
    "fam-1",
    "Erb",
    [
      task({ due_date: "2026-07-01", title: "Kita-Anmeldung" }),
      task({ id: "x", due_date: "2026-07-14", title: "Strom <zahlen>" }),
    ],
    TODAY,
  )!;

  it("text body lists both sections with German dates and the tasks link", () => {
    const text = digestText(digest, "https://app.ordilo.de");
    expect(text).toContain("Hallo Familie Erb");
    expect(text).toContain("Überfällig:");
    expect(text).toContain("Kita-Anmeldung — fällig am 01.07.2026");
    expect(text).toContain("https://app.ordilo.de/aufgaben");
  });

  it("html body escapes task titles", () => {
    const html = digestHtml(digest, "https://app.ordilo.de");
    expect(html).toContain("Strom &lt;zahlen&gt;");
    expect(html).not.toContain("Strom <zahlen>");
    expect(html).toContain("https://app.ordilo.de/aufgaben");
  });
});
