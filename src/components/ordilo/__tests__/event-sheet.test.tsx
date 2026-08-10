import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toCalendarDate, type CalendarEvent } from "@/lib/calendar";

const mockSingle = vi.fn();
const mockSelect = vi.fn(() => ({ single: mockSingle }));
const mockInsert = vi.fn(() => ({ select: mockSelect }));
const mockUpdateEq = vi.fn();
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
const mockAttendeeInsert = vi.fn();
const mockAttendeeDeleteIn = vi.fn();
const mockAttendeeDeleteEq = vi.fn(() => ({ in: mockAttendeeDeleteIn }));
const mockAttendeeDelete = vi.fn(() => ({ eq: mockAttendeeDeleteEq }));
const mockEventDeleteEq = vi.fn();
const mockEventDelete = vi.fn(() => ({ eq: mockEventDeleteEq }));

const mockFrom = vi.fn((table: string) =>
  table === "calendar_event_attendees"
    ? { insert: mockAttendeeInsert, delete: mockAttendeeDelete }
    : { insert: mockInsert, update: mockUpdate, delete: mockEventDelete },
);

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mockFrom }),
}));

import { EventSheet } from "@/components/ordilo/event-sheet";

const MEMBERS = [
  { id: "m-1", name: "Emma", role: "Kind" },
  { id: "m-2", name: "Jonas", role: "Kind" },
];

const TODAY = toCalendarDate(new Date());

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    title: "Zahnarzt",
    note: null,
    starts_on: TODAY,
    ends_on: TODAY,
    all_day: true,
    starts_time: null,
    ends_time: null,
    recurrence: "none",
    recurrence_until: null,
    recurrence_exceptions: [],
    location: null,
    responsible_member_id: null,
    document_id: null,
    attendees: [{ id: "m-1", name: "Emma" }],
    ...overrides,
  };
}

function renderSheet(props: Partial<Parameters<typeof EventSheet>[0]> = {}) {
  const onSaved = vi.fn();
  render(
    <EventSheet
      open
      onOpenChange={vi.fn()}
      familyId="family-1"
      members={MEMBERS}
      event={null}
      defaultDate={TODAY}
      onSaved={onSaved}
      {...props}
    />,
  );
  return { onSaved };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSingle.mockResolvedValue({ data: null, error: null });
  mockUpdateEq.mockResolvedValue({ error: null });
  mockAttendeeInsert.mockResolvedValue({ error: null });
  mockAttendeeDeleteIn.mockResolvedValue({ error: null });
  mockEventDeleteEq.mockResolvedValue({ error: null });
});

describe("EventSheet", () => {
  it("requires a title", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Termin speichern" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bitte gib einen Namen ein.",
    );
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects an end date before the start date", async () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText("Was ist geplant?"), {
      target: { value: "Ferien" },
    });
    fireEvent.change(screen.getByLabelText("Bis"), {
      target: { value: "2020-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Termin speichern" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Das Ende darf nicht vor dem Anfang liegen.",
    );
  });

  it("requires both times when the event is not all-day", async () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText("Was ist geplant?"), {
      target: { value: "Zahnarzt" },
    });
    fireEvent.click(screen.getByLabelText("Ganztägig"));
    fireEvent.click(screen.getByRole("button", { name: "Termin speichern" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bitte gib Beginn und Ende der Uhrzeit an.",
    );
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("creates a timed recurring event with attendees", async () => {
    const { onSaved } = renderSheet();
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "event-9",
        title: "Judo",
        note: null,
        starts_on: TODAY,
        ends_on: TODAY,
        all_day: false,
        starts_time: "16:00",
        ends_time: "17:00",
        recurrence: "weekly",
        recurrence_until: null,
        recurrence_exceptions: [],
      },
      error: null,
    });

    fireEvent.change(screen.getByLabelText("Was ist geplant?"), {
      target: { value: "Judo" },
    });
    fireEvent.click(screen.getByLabelText("Ganztägig"));
    fireEvent.change(screen.getByLabelText("Beginn"), {
      target: { value: "16:00" },
    });
    fireEvent.change(screen.getByLabelText("Ende"), {
      target: { value: "17:00" },
    });
    fireEvent.change(screen.getByLabelText("Wiederholung"), {
      target: { value: "weekly" },
    });
    fireEvent.click(screen.getByTestId("event-attendee-chip-m-2"));
    fireEvent.click(screen.getByRole("button", { name: "Termin speichern" }));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith({
        family_id: "family-1",
        title: "Judo",
        note: null,
        starts_on: TODAY,
        ends_on: TODAY,
        all_day: false,
        starts_time: "16:00",
        ends_time: "17:00",
        recurrence: "weekly",
        recurrence_until: null,
        recurrence_exceptions: [],
        location: null,
        responsible_member_id: null,
        document_id: null,
      });
    });
    expect(mockAttendeeInsert).toHaveBeenCalledWith([
      { event_id: "event-9", family_member_id: "m-2" },
    ]);
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "event-9",
        attendees: [{ id: "m-2", name: "Jonas" }],
      }),
      "created",
    );
  });

  it("pre-fills edit mode and diffs attendees on update", async () => {
    const { onSaved } = renderSheet({ event: makeEvent() });

    expect(screen.getByLabelText("Was ist geplant?")).toHaveValue("Zahnarzt");
    // Emma is already an attendee — uncheck her, check Jonas instead.
    expect(screen.getByTestId("event-attendee-chip-m-1")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByTestId("event-attendee-chip-m-1"));
    fireEvent.click(screen.getByTestId("event-attendee-chip-m-2"));
    fireEvent.click(screen.getByRole("button", { name: "Termin speichern" }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Zahnarzt" }),
      );
      expect(mockUpdateEq).toHaveBeenCalledWith("id", "event-1");
    });
    expect(mockAttendeeDeleteEq).toHaveBeenCalledWith("event_id", "event-1");
    expect(mockAttendeeDeleteIn).toHaveBeenCalledWith("family_member_id", [
      "m-1",
    ]);
    expect(mockAttendeeInsert).toHaveBeenCalledWith([
      { event_id: "event-1", family_member_id: "m-2" },
    ]);
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "event-1",
        attendees: [{ id: "m-2", name: "Jonas" }],
      }),
      "updated",
    );
  });

  it("rolls back the event and shows an error when attendee saving fails on create", async () => {
    const { onSaved } = renderSheet();
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "event-9",
        title: "Judo",
        note: null,
        starts_on: TODAY,
        ends_on: TODAY,
        all_day: true,
        starts_time: null,
        ends_time: null,
        recurrence: "none",
        recurrence_until: null,
        recurrence_exceptions: [],
      },
      error: null,
    });
    mockAttendeeInsert.mockResolvedValueOnce({
      error: { message: "row-level security" },
    });

    fireEvent.change(screen.getByLabelText("Was ist geplant?"), {
      target: { value: "Judo" },
    });
    fireEvent.click(screen.getByTestId("event-attendee-chip-m-2"));
    fireEvent.click(screen.getByRole("button", { name: "Termin speichern" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Speichern hat nicht geklappt.",
    );
    // The just-created event is deleted again so a retry cannot duplicate it.
    expect(mockEventDeleteEq).toHaveBeenCalledWith("id", "event-9");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("shows an error instead of reporting success when the attendee update fails on edit", async () => {
    const { onSaved } = renderSheet({ event: makeEvent() });
    mockAttendeeInsert.mockResolvedValueOnce({
      error: { message: "row-level security" },
    });

    // Keep Emma, additionally check Jonas → one attendee insert, which fails.
    fireEvent.click(screen.getByTestId("event-attendee-chip-m-2"));
    fireEvent.click(screen.getByRole("button", { name: "Termin speichern" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Teilnehmer konnten nicht gespeichert werden.",
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("offers delete only in edit mode", () => {
    const onDeleteRequest = vi.fn();
    const { unmount } = render(
      <EventSheet
        open
        onOpenChange={vi.fn()}
        familyId="family-1"
        members={MEMBERS}
        event={null}
        defaultDate={TODAY}
        onSaved={vi.fn()}
        onDeleteRequest={onDeleteRequest}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Termin löschen" }),
    ).not.toBeInTheDocument();
    unmount();

    const event = makeEvent();
    render(
      <EventSheet
        open
        onOpenChange={vi.fn()}
        familyId="family-1"
        members={MEMBERS}
        event={event}
        defaultDate={TODAY}
        onSaved={vi.fn()}
        onDeleteRequest={onDeleteRequest}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Termin löschen" }));
    expect(onDeleteRequest).toHaveBeenCalledWith(event);
  });

  it("blocks saving while a date field shows an invalid date", () => {
    const { onSaved } = renderSheet();
    fireEvent.change(screen.getByLabelText("Was ist geplant?"), {
      target: { value: "Ausflug" },
    });
    // 31.02. exists on no calendar — the field shows it, state keeps the
    // old date, and saving must refuse instead of writing the stale value.
    fireEvent.change(screen.getByLabelText("Von"), {
      target: { value: "31.02.2027" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Termin speichern" }));

    expect(
      screen.getByText("Bitte prüf das Datum — diesen Tag gibt es so nicht."),
    ).toBeInTheDocument();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();

    // Correcting the date clears the block.
    fireEvent.change(screen.getByLabelText("Von"), {
      target: { value: "28.02.2027" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Termin speichern" }));
    expect(
      screen.queryByText("Bitte prüf das Datum — diesen Tag gibt es so nicht."),
    ).not.toBeInTheDocument();
  });

  it("pulls the end date along when the start moves past it", () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText("Von"), {
      target: { value: "20.12.2027" },
    });
    // The "Bis" field's visible text follows the auto-adjusted value.
    expect(screen.getByLabelText("Bis")).toHaveValue("20.12.2027");
  });

  it("warns about a double-booked person without blocking the save", () => {
    renderSheet({
      existingEvents: [
        makeEvent({
          id: "other-1",
          title: "Judo",
          all_day: false,
          starts_time: "16:00:00",
          ends_time: "17:00:00",
          attendees: [{ id: "m-1", name: "Emma" }],
        }),
      ],
    });

    // No warning while the draft is all-day.
    expect(screen.queryByTestId("event-conflict-warning")).toBeNull();

    fireEvent.click(screen.getByLabelText("Ganztägig"));
    fireEvent.change(screen.getByLabelText("Beginn"), {
      target: { value: "16:30" },
    });
    fireEvent.change(screen.getByLabelText("Ende"), {
      target: { value: "17:30" },
    });
    fireEvent.click(screen.getByTestId("event-attendee-chip-m-1"));

    const warning = screen.getByTestId("event-conflict-warning");
    expect(warning.textContent).toContain("Emma");
    expect(warning.textContent).toContain("Judo");
    // The save button stays enabled — the family decides.
    expect(
      (screen.getByRole("button", { name: "Termin speichern" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
