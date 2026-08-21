import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { ReviewCard } from "@/components/ordilo/review-card";
import {
  buildConfirmPayload,
  emptyEditState,
} from "@/components/ordilo/review-card/helpers";
import type { DocumentAnalysis } from "@/lib/schemas/extraction";
import { toCalendarDate } from "@/lib/calendar";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/analysis", () => ({
  fetchDocumentAnalysis: vi.fn(),
  fetchFamilyMembers: vi.fn(),
  fetchExistingCategories: vi.fn(),
}));

import {
  fetchDocumentAnalysis,
  fetchFamilyMembers,
  fetchExistingCategories,
} from "@/lib/analysis";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({})),
}));

vi.mock("@/app/(app)/familie/actions", () => ({
  addFamilyMember: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures — dates are computed relative to today so they never go stale.
// ---------------------------------------------------------------------------

function futureDate(daysFromNow: number): string {
  return toCalendarDate(new Date(Date.now() + daysFromNow * 86_400_000));
}

function pastDate(daysAgo: number): string {
  return toCalendarDate(new Date(Date.now() - daysAgo * 86_400_000));
}

const APPOINTMENT_DATE = futureDate(14);
const DEADLINE_DATE = futureDate(30);
const PAST_DATE = pastDate(10);

function analysisWithDates(): DocumentAnalysis {
  return {
    document_type: "school",
    title: "Kita-Brief für Emma",
    summary: "Ein Brief der Kita mit Terminen.",
    family_members: [
      { person_id: "member-1", name: "Emma", confidence: 0.95 },
    ],
    organizations: [],
    dates: [
      {
        date: APPOINTMENT_DATE,
        type: "event",
        label: "Elternabend",
        confidence: 0.9,
      },
      {
        date: DEADLINE_DATE,
        type: "deadline",
        label: "Zahlungsfrist",
        confidence: 0.9,
      },
      {
        date: PAST_DATE,
        type: "date",
        label: "Gezahlt am",
        confidence: 0.9,
      },
    ],
    amounts: [],
    tasks: [],
    facts: [],
    suggested_category: "Kita",
    tags: [],
    needs_user_review: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchFamilyMembers).mockResolvedValue([
    { id: "member-1", name: "Emma", role: "Kind" },
  ]);
  vi.mocked(fetchExistingCategories).mockResolvedValue(["Kita"]);
});

// ---------------------------------------------------------------------------
// buildConfirmPayload — the planner selection in the confirm contract
// ---------------------------------------------------------------------------

describe("buildConfirmPayload calendar events", () => {
  it("sends default-selected appointments and skips deadlines and past dates", () => {
    const payload = buildConfirmPayload(analysisWithDates(), emptyEditState());
    expect(payload.calendar_events).toEqual([
      { date: APPOINTMENT_DATE, label: "Elternabend" },
    ]);
  });

  it("honours toggle overrides in both directions", () => {
    const edits = emptyEditState();
    edits.calendarDates.set(0, false); // Elternabend abgewählt
    edits.calendarDates.set(1, true); // Zahlungsfrist doch übernehmen
    const payload = buildConfirmPayload(analysisWithDates(), edits);
    expect(payload.calendar_events).toEqual([
      { date: DEADLINE_DATE, label: "Zahlungsfrist" },
    ]);
  });

  it("uses the edited date for the planner event", () => {
    const edits = emptyEditState();
    const corrected = futureDate(21);
    edits.dates.set(0, corrected);
    const payload = buildConfirmPayload(analysisWithDates(), edits);
    expect(payload.calendar_events).toEqual([
      { date: corrected, label: "Elternabend" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// ReviewCard — the planner offer in the review step
// ---------------------------------------------------------------------------

describe("ReviewCard planner offer", () => {
  it("offers future dates with appointments checked and deadlines unchecked", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(analysisWithDates());
    render(<ReviewCard documentId="doc-1" status="analyzed" />);

    await screen.findByTestId("review-calendar-offer");
    expect(screen.getByText("Da stehen 2 Termine drin.")).toBeDefined();
    expect(
      screen.getByText("Soll ich sie direkt in euren Familienplaner legen?"),
    ).toBeDefined();

    const appointment = screen.getByTestId("calendar-toggle-0");
    const deadline = screen.getByTestId("calendar-toggle-1");
    expect(appointment.getAttribute("aria-checked")).toBe("true");
    expect(deadline.getAttribute("aria-checked")).toBe("false");

    // The past date stays plain information in "Wichtige Termine".
    expect(screen.getByTestId("review-dates")).toBeDefined();
  });

  it("uses singular copy for a single date", async () => {
    const analysis = analysisWithDates();
    analysis.dates = [analysis.dates[0]];
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(analysis);
    render(<ReviewCard documentId="doc-1" status="analyzed" />);

    await screen.findByTestId("review-calendar-offer");
    expect(screen.getByText("Da steht ein Termin drin.")).toBeDefined();
    expect(
      screen.getByText("Soll ich ihn direkt in euren Familienplaner legen?"),
    ).toBeDefined();
  });

  it("shows no offer when every date lies in the past", async () => {
    const analysis = analysisWithDates();
    analysis.dates = [analysis.dates[2]];
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(analysis);
    render(<ReviewCard documentId="doc-1" status="analyzed" />);

    await screen.findByTestId("review-dates");
    expect(screen.queryByTestId("review-calendar-offer")).toBeNull();
  });

  it("confirms with the default planner selection and celebrates the created events", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(analysisWithDates());
    // A fresh Response per call — the shared instance's body would already
    // be consumed by the original-file prefetch before confirm reads it.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            String(input).endsWith("/confirm")
              ? {
                  status: "confirmed",
                  document_id: "doc-1",
                  events_created: 1,
                }
              : {},
          ),
          { status: 200 },
        ),
    );

    render(<ReviewCard documentId="doc-1" status="analyzed" />);
    await screen.findByTestId("review-calendar-offer");

    fireEvent.click(screen.getByTestId("confirm-button"));

    const confirmCall = await waitFor(() => {
      const call = fetchSpy.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/confirm") &&
          (init as RequestInit | undefined)?.method === "POST",
      );
      expect(call).toBeDefined();
      return call as [string, RequestInit];
    });

    const body = JSON.parse(confirmCall[1].body as string);
    expect(body.calendar_events).toEqual([
      { date: APPOINTMENT_DATE, label: "Elternabend" },
    ]);

    // The success state names what Ordilo took care of.
    expect(
      await screen.findByTestId("confirmed-calendar-events"),
    ).toHaveTextContent("Erledigt — 1 Termin liegt jetzt im Planer.");

    fetchSpy.mockRestore();
  });

  it("sends no planner events when the user unchecks the appointment", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(analysisWithDates());
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            String(input).endsWith("/confirm")
              ? {
                  status: "confirmed",
                  document_id: "doc-1",
                  events_created: 0,
                }
              : {},
          ),
          { status: 200 },
        ),
    );

    render(<ReviewCard documentId="doc-1" status="analyzed" />);
    await screen.findByTestId("review-calendar-offer");

    fireEvent.click(screen.getByTestId("calendar-toggle-0"));
    fireEvent.click(screen.getByTestId("confirm-button"));

    const confirmCall = await waitFor(() => {
      const call = fetchSpy.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/confirm") &&
          (init as RequestInit | undefined)?.method === "POST",
      );
      expect(call).toBeDefined();
      return call as [string, RequestInit];
    });

    const body = JSON.parse(confirmCall[1].body as string);
    expect(body.calendar_events).toEqual([]);

    await screen.findByTestId("review-card-confirmed");
    expect(screen.queryByTestId("confirmed-calendar-events")).toBeNull();

    fetchSpy.mockRestore();
  });
});
