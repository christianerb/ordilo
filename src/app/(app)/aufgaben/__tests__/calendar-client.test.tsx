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
const mockDismissalInsert = vi.fn();
const mockChannelOn = vi.fn();
const mockChannelSubscribe = vi.fn();
const mockChannel = {
  on: mockChannelOn,
  subscribe: mockChannelSubscribe,
};
const mockRemoveChannel = vi.fn();

const mockFrom = vi.fn((table: string) => {
  if (table === "calendar_event_attendees") {
    return { insert: mockAttendeeInsert, delete: mockAttendeeDelete };
  }
  if (table === "calendar_suggestion_dismissals") {
    return { insert: mockDismissalInsert };
  }
  return { insert: mockInsert, update: mockUpdate, delete: mockDelete };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: mockFrom,
    channel: () => mockChannel,
    removeChannel: mockRemoveChannel,
  }),
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
    location: null,
    responsible_member_id: null,
    document_id: null,
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
  mockDismissalInsert.mockResolvedValue({ error: null });
  mockChannelOn.mockReturnValue(mockChannel);
  mockChannelSubscribe.mockReturnValue(mockChannel);
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

  it("uses a full event border instead of a colored accent stripe", () => {
    render(
      <CalendarClient
        familyId="family-1"
        members={MEMBERS}
        initialEvents={[makeEvent()]}
      />,
    );

    const event = screen.getByTestId("calendar-event-event-1");
    expect(event).toHaveClass("border");
    expect(event).not.toHaveClass("border-l-[3px]");
  });

  it("keeps selected person initials legible on light colors", () => {
    render(
      <CalendarClient
        familyId="family-1"
        members={[
          ...MEMBERS,
          {
            id: "m-light",
            name: "Lina",
            role: "Kind",
            avatar_color: "#b08a3e",
          },
        ]}
        initialEvents={[]}
      />,
    );

    const filter = screen.getByTestId("calendar-filter-m-light");
    fireEvent.click(filter);

    expect(filter).toHaveClass("size-11", "sm:size-9");
    expect(filter).toHaveStyle({
      backgroundColor: "#b08a3e",
      color: "#201E1B",
    });
  });

  it("subscribes to calendar event deletions", () => {
    render(
      <CalendarClient
        familyId="family-1"
        members={MEMBERS}
        initialEvents={[]}
      />,
    );

    expect(mockChannelOn).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        event: "DELETE",
        schema: "public",
        table: "calendar_events",
        filter: "family_id=eq.family-1",
      }),
      expect.any(Function),
    );
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
        location: null,
        responsible_member_id: null,
        document_id: null,
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

  it("filters the day list to the selected member", () => {
    render(
      <CalendarClient
        familyId="family-1"
        members={MEMBERS}
        initialEvents={[
          makeEvent({
            id: "event-emma",
            title: "Schwimmen",
            note: null,
            attendees: [{ id: "m-1", name: "Emma" }],
          }),
          makeEvent({
            id: "event-jonas",
            title: "Judo",
            note: null,
            responsible_member_id: "m-2",
            attendees: [],
          }),
        ]}
      />,
    );

    const dayEvents = () => within(screen.getByTestId("calendar-day-events"));
    expect(dayEvents().getByText("Schwimmen")).toBeInTheDocument();
    expect(dayEvents().getByText("Judo")).toBeInTheDocument();

    // Filtering by Emma keeps her event; Jonas's (via responsible) is hidden.
    fireEvent.click(screen.getByTestId("calendar-filter-m-1"));
    expect(dayEvents().getByText("Schwimmen")).toBeInTheDocument();
    expect(dayEvents().queryByText("Judo")).not.toBeInTheDocument();

    // The responsible member also counts as "their" event.
    fireEvent.click(screen.getByTestId("calendar-filter-m-2"));
    expect(dayEvents().queryByText("Schwimmen")).not.toBeInTheDocument();
    expect(dayEvents().getByText("Judo")).toBeInTheDocument();

    // Tapping the active chip again clears the filter.
    fireEvent.click(screen.getByTestId("calendar-filter-m-2"));
    expect(dayEvents().getByText("Schwimmen")).toBeInTheDocument();
  });

  it("hides a document suggestion when dismissed", async () => {
    render(
      <CalendarClient
        familyId="family-1"
        members={MEMBERS}
        initialEvents={[]}
        initialSuggestions={[
          {
            entityId: "entity-1",
            date: "2026-09-01",
            label: "Elternabend",
            documentId: "doc-1",
            documentTitle: "Elternbrief Klasse 3b",
          },
        ]}
      />,
    );

    expect(screen.getByText("Elternabend")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("suggestion-dismiss-entity-1"));

    await waitFor(() => {
      expect(mockDismissalInsert).toHaveBeenCalledWith({
        family_id: "family-1",
        entity_id: "entity-1",
      });
      expect(screen.queryByText("Elternabend")).not.toBeInTheDocument();
    });
  });

  it("turns a suggestion into a linked event and dismisses it", async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "event-5",
        title: "Elternabend",
        note: null,
        starts_on: "2026-09-01",
        ends_on: "2026-09-01",
        all_day: true,
        starts_time: null,
        ends_time: null,
        recurrence: "none",
        recurrence_until: null,
        recurrence_exceptions: [],
        location: null,
        responsible_member_id: null,
        document_id: "doc-1",
      },
      error: null,
    });

    render(
      <CalendarClient
        familyId="family-1"
        members={MEMBERS}
        initialEvents={[]}
        initialSuggestions={[
          {
            entityId: "entity-1",
            date: "2026-09-01",
            label: "Elternabend",
            documentId: "doc-1",
            documentTitle: "Elternbrief Klasse 3b",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByTestId("suggestion-accept-entity-1"));

    // The sheet opens prefilled from the suggestion.
    const titleInput = screen.getByLabelText(
      "Was ist geplant?",
    ) as HTMLInputElement;
    expect(titleInput.value).toBe("Elternabend");
    fireEvent.click(screen.getByRole("button", { name: "Termin speichern" }));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Elternabend",
          starts_on: "2026-09-01",
          document_id: "doc-1",
        }),
      );
      expect(mockDismissalInsert).toHaveBeenCalledWith({
        family_id: "family-1",
        entity_id: "entity-1",
      });
    });
    expect(screen.queryByTestId("calendar-suggestion-entity-1")).not.toBeInTheDocument();
  });
});
