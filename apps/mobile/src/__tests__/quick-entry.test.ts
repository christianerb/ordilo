import { parseQuickTaskTitle } from "../lib/tasks";

// The one-line quick entry in the plan list: a title, Enter, and the
// task exists. Everything it accepts or rejects is decided here, so the
// input itself stays dumb.

describe("parseQuickTaskTitle", () => {
  it("trims whitespace and keeps the title", () => {
    expect(parseQuickTaskTitle("  Rechnung bezahlen  ")).toBe(
      "Rechnung bezahlen",
    );
  });

  it("rejects an empty line without creating anything", () => {
    expect(parseQuickTaskTitle("")).toBeNull();
    expect(parseQuickTaskTitle("   ")).toBeNull();
  });

  it("stays inside the task title limit", () => {
    expect(parseQuickTaskTitle("a".repeat(200))).toHaveLength(200);
    expect(parseQuickTaskTitle("a".repeat(201))).toBeNull();
  });
});
