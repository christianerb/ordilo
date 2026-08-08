import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toCalendarDate, type CalendarEvent } from "@/lib/calendar";

// Chainable Supabase browser-client mock covering every path the calendar
// uses: insert → select → single (create), update → eq (edit + exception),
// delete → eq (series delete), attendees insert / delete → eq → in.
const mockSingle = vi.fn();
const mockSelect = vi.fn(() => ({ single: mockSingle }));
const mockInsert = vi.fn(() => ({ select: mockSelect }));
const mockUpdateEq = vi.fn();
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
const mockDeleteEq = vi.fn();
const mockDelete = vi.fn(() => ({ eq: mockDeleteEq }));
const mockAttendeeInsert = vi.fn();
const mockAttendeeDeleteIn = vi.fn();
const mockAttendeeDeleteEq = vi.fn(() => ({ in: mockAttendeeDeleteIn }));
const mockAttendeeDelete = vi.fn(() => ({ eq: mockAttendeeDeleteEq }));

const mockFrom = vi.fn((table: string) =>
  table === "calendar_event_attendees"
    ? { insert: mockAttendeeInsert, delete: mockAttendeeDelete }
    : { insert: mockInsert, update: mockUpdate, delete: mockDelete },
);

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mockFrom }),
}));

import { CalendarClient } from "@/app/(app)/aufgaben/calendar-client";
import {
  PlannerActionsProvider,
  usePlannerActions,
} from "@/app/(app)/aufgaben/planner-actions-context";

/**
 * The create button lives in the page header (PlannerTabs), which talks to
 * the calendar through PlannerActionsContext. This harness stands in for
 * the header so the registration wiring is covered too.
 */
function HeaderHarness() {
  const { openCreate } = usePlannerActions();
  return (
    <button type="button" onClick={openCreate}>
      Termin
    </button>
  );
}

const MEMBERS = [
  { id: "m-1", name: "Emma", role: "Kind" },
  { id: "m-2", name: "Jonas", role: "Kind" },
];

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const today = toCalendarDate(new Date());
  return {
    id: "event-1",
    title: "Kita geschlossen",
    note: "Fortbildung",
    starts_on: today,
    ends_on: today,
    all_day: true,
    starts_time: null,
    ends_time: null,
    recurrence: "none",
    recurrence_until: null,
    recurrence_exceptions: [],
    attendees: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSingle.mockResolvedValue({ data: null, error: null });
  mockUpdateEq.mockResolvedValue({ error: null });
  mockDeleteEq.mockResolvedValue({ error: null });
  mockAttendeeInsert.mockResolvedValue({ error: null });
  mockAttendeeDeleteIn.mockResolvedValue({ error: null });
});

describe("CalendarClient", () => {
  it("shows a shared event on its selected day", () => {
    render(
      <CalendarClient
        familyId="family-1"
        members={MEMBERS}
        initialEvents={[makeEvent()]}
      />,
    );

    expect(screen.getByTestId("family-calendar")).toBeInTheDocument();
    const dayEvents = within(screen.getByTestId("calendar-day-events"));
    expect(dayEvents.getByText("Kita geschlossen")).toBeInTheDocument();
    expect(dayEvents.getByText("Fortbildung")).toBeInTheDocument();
  });

  it("saves a new shared event", async () => {
    const today = toCalendarDate(new Date());
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "event-2",
        title: "Herbstferien",
        note: null,
        starts_on: today,
        ends_on: today,
        all_day: true,
        starts_time: null,
        ends_time: null,
        recurrence: "none",
        recurrence_until: null,
        recurrence_exceptions: [],
      },
      error: null,
    });

    render(
      <PlannerActionsProvider>
        <HeaderHarness />
        <CalendarClient
          familyId="family-1"
          members={MEMBERS}
          initialEvents={[]}
        />
      </PlannerActionsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Termin" }));
    fireEvent.change(screen.getByLabelText("Was ist geplant?"), {
      target: { value: "Herbstferien" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Termin speichern" }));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith({
        family_id: "family-1",
        title: "Herbstferien",
        note: null,
        starts_on: today,
        ends_on: today,
        all_day: true,
        starts_time: null,
        ends_time: null,
        recurrence: "none",
        recurrence_until: null,
        recurrence_exceptions: [],
      });
    });
    await waitFor(() => {
      expect(
        within(screen.getByTestId("calendar-day-events")).getByText(
          "Herbstferien",
        ),
      ).toBeInTheDocument();
    });
  });

  it("opens an event for editing and saves the changes", async () => {
    render(
      <CalendarClient
        familyId="family-1"
        members={MEMBERS}
        initialEvents={[makeEvent()]}
      />,
    );

    fireEvent.click(screen.getByTestId("calendar-event-event-1"));

    // Edit mode pre-fills the form.
    const titleInput = screen.getByLabelText("Was ist geplant?");
    expect(titleInput).toHaveValue("Kita geschlossen");

    fireEvent.change(titleInput, { target: { value: "Kita zu (Fortbildung)" } });
    fireEvent.click(screen.getByRole("button", { name: "Termin speichern" }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Kita zu (Fortbildung)" }),
      );
      expect(mockUpdateEq).toHaveBeenCalledWith("id", "event-1");
    });
    await waitFor(() => {
      expect(
        within(screen.getByTestId("calendar-day-events")).getByText(
          "Kita zu (Fortbildung)",
        ),
      ).toBeInTheDocument();
    });
  });

  it("stores newly checked attendees on save", async () => {
    render(
      <CalendarClient
        familyId="family-1"
        members={MEMBERS}
        initialEvents={[makeEvent()]}
      />,
    );

    fireEvent.click(screen.getByTestId("calendar-event-event-1"));
    fireEvent.click(screen.getByTestId("event-attendee-chip-m-1"));
    fireEvent.click(screen.getByRole("button", { name: "Termin speichern" }));

    await waitFor(() => {
      expect(mockAttendeeInsert).toHaveBeenCalledWith([
        { event_id: "event-1", family_member_id: "m-1" },
      ]);
    });
  });

  it("deletes a one-off event after confirmation", async () => {
    render(
      <CalendarClient
        familyId="family-1"
        members={MEMBERS}
        initialEvents={[makeEvent()]}
      />,
    );

    fireEvent.click(screen.getByTestId("calendar-event-event-1"));
    fireEvent.click(screen.getByRole("button", { name: "Termin löschen" }));

    const confirmSheet = await screen.findByTestId(
      "event-delete-confirm-sheet",
    );
    fireEvent.click(
      within(confirmSheet).getByTestId("confirm-delete-event-button"),
    );

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled();
      expect(mockDeleteEq).toHaveBeenCalledWith("id", "event-1");
    });
    await waitFor(() => {
      expect(
        within(screen.getByTestId("calendar-day-events")).queryByText(
          "Kita geschlossen",
        ),
      ).not.toBeInTheDocument();
    });
  });

  it("removes only the selected day from a recurring event", async () => {
    const today = toCalendarDate(new Date());
    render(
      <CalendarClient
        familyId="family-1"
        members={MEMBERS}
        initialEvents={[makeEvent({ recurrence: "weekly" })]}
      />,
    );

    fireEvent.click(screen.getByTestId("calendar-event-event-1"));
    fireEvent.click(screen.getByRole("button", { name: "Termin löschen" }));

    const confirmSheet = await screen.findByTestId(
      "event-delete-confirm-sheet",
    );
    fireEvent.click(
      within(confirmSheet).getByTestId("confirm-delete-single-button"),
    );

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        recurrence_exceptions: [today],
      });
      expect(mockUpdateEq).toHaveBeenCalledWith("id", "event-1");
    });
    // The series itself is NOT deleted.
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes the whole series when asked", async () => {
    render(
      <CalendarClient
        familyId="family-1"
        members={MEMBERS}
        initialEvents={[makeEvent({ recurrence: "weekly" })]}
      />,
    );

    fireEvent.click(screen.getByTestId("calendar-event-event-1"));
    fireEvent.click(screen.getByRole("button", { name: "Termin löschen" }));

    const confirmSheet = await screen.findByTestId(
      "event-delete-confirm-sheet",
    );
    fireEvent.click(
      within(confirmSheet).getByTestId("confirm-delete-series-button"),
    );

    await waitFor(() => {
      expect(mockDeleteEq).toHaveBeenCalledWith("id", "event-1");
    });
  });
});
