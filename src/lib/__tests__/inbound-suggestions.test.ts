import { describe, expect, it } from "vitest";
import {
  discoveryHeadline,
  formatSender,
  formatSuggestionWhen,
  suggestionAcceptLabel,
  toDisplayTime,
  type InboundEmailDiscovery,
  type InboundSuggestion,
} from "@/lib/inbound-suggestions";

function suggestion(overrides: Partial<InboundSuggestion> = {}): InboundSuggestion {
  return {
    id: "s1",
    kind: "calendar_event",
    title: "U7-Untersuchung für Emma",
    starts_on: "2026-03-04",
    starts_time: null,
    ends_time: null,
    location: null,
    note: null,
    ...overrides,
  };
}

describe("inbound suggestions", () => {
  it("shortens a Postgres time to what people read", () => {
    expect(toDisplayTime("10:30:00")).toBe("10:30");
    expect(toDisplayTime(null)).toBeNull();
  });

  it("names the weekday so the date does not have to be counted out", () => {
    expect(formatSuggestionWhen(suggestion())).toBe("Mittwoch, 4. März");
  });

  it("adds the time, and the range when an end time differs", () => {
    expect(formatSuggestionWhen(suggestion({ starts_time: "10:30:00" }))).toBe(
      "Mittwoch, 4. März, 10:30 Uhr",
    );
    expect(
      formatSuggestionWhen(
        suggestion({ starts_time: "10:30:00", ends_time: "11:15:00" }),
      ),
    ).toBe("Mittwoch, 4. März, 10:30–11:15 Uhr");
  });

  it("says so plainly when there is no date", () => {
    expect(
      formatSuggestionWhen(suggestion({ kind: "task", starts_on: null })),
    ).toBe("Ohne Frist");
  });

  it("labels the button with what the tap actually does", () => {
    expect(suggestionAcceptLabel("calendar_event")).toBe("In den Kalender");
    expect(suggestionAcceptLabel("task")).toBe("Auf die Liste");
  });

  it("prefers a sender's name over their address", () => {
    expect(formatSender("Kita Sonnenschein <info@kita.example>")).toBe(
      "Kita Sonnenschein",
    );
    expect(formatSender("info@kita.example")).toBe("info@kita.example");
    expect(formatSender("   ")).toBe("einer E-Mail");
  });

  it("counts what was found, not how many rows are pending", () => {
    const discovery = (suggestions: InboundSuggestion[]): InboundEmailDiscovery => ({
      id: "e1",
      subject: "U7",
      fromAddress: "praxis@example.com",
      receivedAt: "2026-02-01T10:00:00Z",
      retentionPending: true,
      suggestions,
    });

    expect(discoveryHeadline([discovery([suggestion()])])).toBe(
      "Ich habe einen Termin in einer E-Mail gefunden.",
    );
    expect(
      discoveryHeadline([
        discovery([suggestion(), suggestion({ id: "s2" })]),
      ]),
    ).toBe("Ich habe 2 Termine in euren E-Mails gefunden.");
    expect(
      discoveryHeadline([
        discovery([suggestion(), suggestion({ id: "s2", kind: "task" })]),
      ]),
    ).toBe("Ich habe 2 Sachen in euren E-Mails gefunden.");
  });
});
