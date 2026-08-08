import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks: Supabase writes, the Realtime hook, and the /api/chat stream
// ---------------------------------------------------------------------------

const mockSingle = vi.fn();
const mockSelect = vi.fn(() => ({ single: mockSingle }));
const mockInsert = vi.fn(() => ({ select: mockSelect }));
const mockAttendeeInsert = vi.fn();

const mockFrom = vi.fn((table: string) =>
  table === "calendar_event_attendees"
    ? { insert: mockAttendeeInsert }
    : { insert: mockInsert },
);

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mockFrom }),
}));

const mockStart = vi.fn();
const mockStop = vi.fn();
const mockCancel = vi.fn();
let hookCallbacks: {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
};

vi.mock("@/lib/realtime/use-realtime-transcription", () => ({
  useRealtimeTranscription: vi.fn(
    (callbacks: typeof hookCallbacks) => {
      hookCallbacks = callbacks;
      return {
        status: "listening",
        start: mockStart,
        stop: mockStop,
        cancel: mockCancel,
      };
    },
  ),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { VoicePlannerCard } from "@/app/(app)/aufgaben/voice-planner";

const MEMBERS = [
  { id: "m-1", name: "Emma", role: "Kind" },
  { id: "m-2", name: "Jonas", role: "Kind" },
];

function ndjsonResponse(lines: object[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

const CONFIRMATION_STREAM = [
  { type: "conversation", conversation_id: "conv-1" },
  {
    type: "confirmation_request",
    tool_name: "add_calendar_event",
    needs_confirmation: true,
    event_title: "Zahnarzt Emma",
    starts_on: "2026-08-12",
    ends_on: "2026-08-12",
    all_day: false,
    starts_time: "15:00",
    ends_time: "15:30",
    recurrence: "none",
    attendee_names: ["Emma"],
    message: "Bitte bestätige: Soll ich 'Zahnarzt Emma' am 2026-08-12 eintragen?",
  },
  { type: "text", content: "Soll ich den Termin so eintragen?" },
  { type: "done" },
];

function renderCard(onEventCreated = vi.fn()) {
  render(
    <VoicePlannerCard
      familyId="family-1"
      members={MEMBERS}
      onEventCreated={onEventCreated}
    />,
  );
  return onEventCreated;
}

/** Start recording and push a transcript through the captured hook callback. */
async function speak(text: string) {
  fireEvent.click(screen.getByTestId("voice-start-button"));
  await act(async () => {
    hookCallbacks.onTranscript(text);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSingle.mockResolvedValue({ data: null, error: null });
  mockAttendeeInsert.mockResolvedValue({ error: null });
  mockFetch.mockResolvedValue(ndjsonResponse(CONFIRMATION_STREAM));
});

describe("VoicePlannerCard", () => {
  it("starts recording when the mic button is tapped", () => {
    renderCard();
    fireEvent.click(screen.getByTestId("voice-start-button"));
    expect(mockStart).toHaveBeenCalled();
    expect(screen.getByText("Ich höre zu …")).toBeInTheDocument();
  });

  it("shows the proposal as a confirmation card", async () => {
    renderCard();
    await speak("Zahnarzt für Emma morgen um 15 Uhr");

    const card = await screen.findByTestId("voice-confirm-card");
    expect(card).toHaveTextContent("Zahnarzt Emma");
    expect(card).toHaveTextContent("12.08.2026");
    expect(card).toHaveTextContent("15:00 bis 15:30 Uhr");
    expect(card).toHaveTextContent("mit Emma");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        body: JSON.stringify({
          message: "Zahnarzt für Emma morgen um 15 Uhr",
          family_id: "family-1",
        }),
      }),
    );
  });

  it("writes exactly the shown proposal on confirm", async () => {
    const onEventCreated = renderCard();
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "event-7",
        title: "Zahnarzt Emma",
        note: null,
        starts_on: "2026-08-12",
        ends_on: "2026-08-12",
        all_day: false,
        starts_time: "15:00",
        ends_time: "15:30",
        recurrence: "none",
        recurrence_until: null,
        recurrence_exceptions: [],
      },
      error: null,
    });

    await speak("Zahnarzt für Emma morgen um 15 Uhr");
    fireEvent.click(await screen.findByTestId("voice-confirm-button"));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith({
        family_id: "family-1",
        title: "Zahnarzt Emma",
        note: null,
        starts_on: "2026-08-12",
        ends_on: "2026-08-12",
        all_day: false,
        starts_time: "15:00",
        ends_time: "15:30",
        recurrence: "none",
        recurrence_until: null,
        recurrence_exceptions: [],
      });
    });
    expect(mockAttendeeInsert).toHaveBeenCalledWith([
      { event_id: "event-7", family_member_id: "m-1" },
    ]);
    expect(onEventCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "event-7",
        attendees: [{ id: "m-1", name: "Emma" }],
      }),
    );
    // Back to idle afterwards.
    await waitFor(() => {
      expect(screen.getByTestId("voice-start-button")).toBeInTheDocument();
    });
  });

  it("discards a proposal without writing anything", async () => {
    renderCard();
    await speak("Zahnarzt für Emma morgen um 15 Uhr");
    fireEvent.click(await screen.findByTestId("voice-discard-button"));

    expect(mockInsert).not.toHaveBeenCalled();
    expect(screen.getByTestId("voice-start-button")).toBeInTheDocument();
  });

  it("shows a plain text answer when no event is proposed", async () => {
    mockFetch.mockResolvedValueOnce(
      ndjsonResponse([
        { type: "text", content: "Diese Woche steht nichts an." },
        { type: "done" },
      ]),
    );
    renderCard();
    await speak("Was steht diese Woche an?");

    expect(
      await screen.findByText("Diese Woche steht nichts an."),
    ).toBeInTheDocument();
    expect(mockInsert).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.getByTestId("voice-start-button")).toBeInTheDocument();
  });

  it("returns to idle when the chat request fails", async () => {
    mockFetch.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    renderCard();
    await speak("Zahnarzt morgen");

    await waitFor(() => {
      expect(screen.getByTestId("voice-start-button")).toBeInTheDocument();
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
