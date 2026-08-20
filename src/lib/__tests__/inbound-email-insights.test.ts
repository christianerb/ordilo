import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/inbound-email-insights", () => ({
  extractEmailSuggestions: vi.fn(),
}));

const { berlinToday, toSuggestionRow } = await import(
  "@/lib/inbound-email-insights"
);

describe("inbound email insight boundary", () => {
  it("receives the service-role client from the API route", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/inbound-email-insights.ts"),
      "utf8",
    );
    expect(source).not.toContain("@/lib/supabase/admin");
    expect(source).toContain("admin: SupabaseClient<Database>");
  });

  it("keeps attachment-free insight work inside the webhook response", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/api/email/inbound/route.ts"),
      "utf8",
    );
    expect(source).toContain("await recordInboundEmailInsights({");
    expect(source).not.toContain(
      "after(async () => {\n        await recordInboundEmailInsights({",
    );
  });
});

describe("berlinToday", () => {
  it("anchors relative dates on the family's day, not on UTC", () => {
    // 00:30 Berlin time on 2 March is still 23:30 UTC on 1 March.
    expect(berlinToday(new Date("2026-03-01T23:30:00Z"))).toBe("2026-03-02");
  });
});

describe("toSuggestionRow", () => {
  const context = { familyId: "fam-1", inboundEmailId: "mail-1" };

  it("carries an appointment's time and place onto the row", () => {
    expect(
      toSuggestionRow(
        {
          kind: "calendar_event",
          title: "U7 für Emma",
          date: "2026-03-04",
          start_time: "10:30",
          end_time: "11:00",
          location: "Praxis Dr. Weber",
          note: "Impfpass mitbringen",
          confidence: 0.9,
        },
        context,
      ),
    ).toEqual({
      family_id: "fam-1",
      inbound_email_id: "mail-1",
      kind: "calendar_event",
      title: "U7 für Emma",
      starts_on: "2026-03-04",
      starts_time: "10:30",
      ends_time: "11:00",
      location: "Praxis Dr. Weber",
      note: "Impfpass mitbringen",
      confidence: 0.9,
    });
  });

  it("strips times and place from a task — a task has a due date, not a slot", () => {
    const row = toSuggestionRow(
      {
        kind: "task",
        title: "Zettel unterschreiben",
        date: "2026-03-06",
        start_time: "10:30",
        end_time: "11:00",
        location: "Schule",
        note: null,
        confidence: 0.7,
      },
      context,
    );
    expect(row).toMatchObject({
      kind: "task",
      starts_on: "2026-03-06",
      starts_time: null,
      ends_time: null,
      location: null,
    });
  });
});
