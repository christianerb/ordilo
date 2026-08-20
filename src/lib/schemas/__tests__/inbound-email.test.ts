import { describe, expect, it } from "vitest";
import {
  MAX_EMAIL_SUGGESTIONS,
  selectEmailSuggestions,
} from "@/lib/schemas/inbound-email";

function raw(overrides: Record<string, unknown> = {}) {
  return {
    kind: "calendar_event",
    title: "U7-Untersuchung für Emma",
    date: "2026-03-04",
    start_time: "10:30",
    end_time: null,
    location: "Praxis Dr. Weber",
    note: null,
    confidence: 0.9,
    ...overrides,
  };
}

describe("selectEmailSuggestions", () => {
  it("keeps a confident, dated appointment", () => {
    const [suggestion] = selectEmailSuggestions({ suggestions: [raw()] });
    expect(suggestion).toMatchObject({
      kind: "calendar_event",
      date: "2026-03-04",
      start_time: "10:30",
      location: "Praxis Dr. Weber",
    });
  });

  it("normalizes blank strings to null so the row stays empty", () => {
    const [suggestion] = selectEmailSuggestions({
      suggestions: [raw({ location: "  ", note: "" })],
    });
    expect(suggestion.location).toBeNull();
    expect(suggestion.note).toBeNull();
  });

  it("drops an unsure proposal rather than asking about a guess", () => {
    expect(
      selectEmailSuggestions({ suggestions: [raw({ confidence: 0.3 })] }),
    ).toEqual([]);
  });

  it("drops an appointment without a date, but keeps an undated task", () => {
    expect(selectEmailSuggestions({ suggestions: [raw({ date: null })] })).toEqual(
      [],
    );
    expect(
      selectEmailSuggestions({
        suggestions: [raw({ kind: "task", date: null, start_time: null })],
      }),
    ).toHaveLength(1);
  });

  it("rejects malformed or impossible dates and times before storing them", () => {
    expect(
      selectEmailSuggestions({ suggestions: [raw({ date: "04.03.2026" })] }),
    ).toEqual([]);
    expect(
      selectEmailSuggestions({ suggestions: [raw({ date: "2026-02-31" })] }),
    ).toEqual([]);
    expect(
      selectEmailSuggestions({ suggestions: [raw({ date: "2025-02-29" })] }),
    ).toEqual([]);
    expect(
      selectEmailSuggestions({ suggestions: [raw({ date: "2028-02-29" })] }),
    ).toHaveLength(1);
    expect(
      selectEmailSuggestions({ suggestions: [raw({ start_time: "10 Uhr" })] }),
    ).toEqual([]);
    expect(
      selectEmailSuggestions({ suggestions: [raw({ start_time: "29:00" })] }),
    ).toEqual([]);
    expect(
      selectEmailSuggestions({ suggestions: [raw({ end_time: "10:60" })] }),
    ).toEqual([]);
  });

  it("keeps the valid items when one entry is broken", () => {
    const suggestions = selectEmailSuggestions({
      suggestions: [raw(), { kind: "sonstiges" }, raw({ title: "Elternabend" })],
    });
    expect(suggestions.map((item) => item.title)).toEqual([
      "U7-Untersuchung für Emma",
      "Elternabend",
    ]);
  });

  it("never asks more than three questions about one email", () => {
    const suggestions = selectEmailSuggestions({
      suggestions: Array.from({ length: 6 }, (_, index) =>
        raw({ title: `Termin ${index}` }),
      ),
    });
    expect(suggestions).toHaveLength(MAX_EMAIL_SUGGESTIONS);
  });

  it("returns nothing for a response that is not a suggestion list", () => {
    expect(selectEmailSuggestions(null)).toEqual([]);
    expect(selectEmailSuggestions({ suggestions: "keine" })).toEqual([]);
  });
});
