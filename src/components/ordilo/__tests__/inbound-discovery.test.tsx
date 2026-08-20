import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  InboundEmailDiscovery,
  InboundSuggestion,
} from "@/lib/inbound-suggestions";

const acceptInboundSuggestion = vi.fn();
const dismissInboundSuggestion = vi.fn();
const decideInboundEmailRetention = vi.fn();

vi.mock("@/app/(app)/home/inbox-actions", () => ({
  acceptInboundSuggestion: (...args: unknown[]) =>
    acceptInboundSuggestion(...args),
  dismissInboundSuggestion: (...args: unknown[]) =>
    dismissInboundSuggestion(...args),
  decideInboundEmailRetention: (...args: unknown[]) =>
    decideInboundEmailRetention(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { InboundDiscovery } from "@/components/ordilo/inbound-discovery";

function suggestion(overrides: Partial<InboundSuggestion> = {}): InboundSuggestion {
  return {
    id: "s-1",
    kind: "calendar_event",
    title: "U7-Untersuchung für Emma",
    starts_on: "2026-03-04",
    starts_time: "10:30:00",
    ends_time: null,
    location: "Praxis Dr. Weber",
    note: "Impfpass mitbringen",
    ...overrides,
  };
}

function discovery(
  overrides: Partial<InboundEmailDiscovery> = {},
): InboundEmailDiscovery {
  return {
    id: "e-1",
    subject: "Terminerinnerung U7",
    fromAddress: "Praxis Weber <praxis@example.com>",
    receivedAt: "2026-02-20T09:00:00Z",
    retentionPending: true,
    suggestions: [suggestion()],
    ...overrides,
  };
}

describe("InboundDiscovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acceptInboundSuggestion.mockResolvedValue({ success: true });
    dismissInboundSuggestion.mockResolvedValue({ success: true });
    decideInboundEmailRetention.mockResolvedValue({ success: true });
  });

  it("renders nothing when there is nothing to ask about", () => {
    render(<InboundDiscovery discoveries={[]} />);
    expect(screen.queryByTestId("home-inbound-discovery")).toBeNull();
  });

  it("names what was found and who it came from", () => {
    render(<InboundDiscovery discoveries={[discovery()]} />);
    expect(screen.getByTestId("home-inbound-discovery")).toHaveTextContent(
      "Ich habe einen Termin in einer E-Mail gefunden.",
    );
    expect(screen.getByTestId("home-inbound-discovery")).toHaveTextContent(
      "Praxis Weber",
    );
  });

  it("shows the proposal with its date, place and note when opened", () => {
    render(<InboundDiscovery discoveries={[discovery()]} />);
    fireEvent.click(screen.getByTestId("home-inbound-discovery"));

    const card = screen.getByTestId("inbound-suggestion-card");
    expect(card).toHaveTextContent("U7-Untersuchung für Emma");
    expect(card).toHaveTextContent("Mittwoch, 4. März, 10:30 Uhr");
    expect(card).toHaveTextContent("Praxis Dr. Weber");
    expect(card).toHaveTextContent("Impfpass mitbringen");
  });

  it("creates the calendar entry only after the tap, then asks about the email", async () => {
    render(<InboundDiscovery discoveries={[discovery()]} />);
    fireEvent.click(screen.getByTestId("home-inbound-discovery"));
    expect(acceptInboundSuggestion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "In den Kalender" }));

    await waitFor(() =>
      expect(acceptInboundSuggestion).toHaveBeenCalledWith("s-1"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("inbound-retention-card")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("inbound-suggestion-card")).toBeNull();
  });

  it("declining creates nothing", async () => {
    render(<InboundDiscovery discoveries={[discovery()]} />);
    fireEvent.click(screen.getByTestId("home-inbound-discovery"));
    fireEvent.click(screen.getByRole("button", { name: "Nein, danke" }));

    await waitFor(() =>
      expect(dismissInboundSuggestion).toHaveBeenCalledWith("s-1"),
    );
    expect(acceptInboundSuggestion).not.toHaveBeenCalled();
  });

  it("passes the keep-or-delete answer through and then goes quiet", async () => {
    render(
      <InboundDiscovery
        discoveries={[discovery({ suggestions: [], retentionPending: true })]}
      />,
    );
    fireEvent.click(screen.getByTestId("home-inbound-discovery"));
    fireEvent.click(screen.getByRole("button", { name: "Bitte löschen" }));

    await waitFor(() =>
      expect(decideInboundEmailRetention).toHaveBeenCalledWith("e-1", false),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("home-inbound-discovery")).toBeNull(),
    );
  });

  it("names every email before offering a retention choice", () => {
    render(
      <InboundDiscovery
        discoveries={[
          discovery({ id: "e-1", suggestions: [], subject: "U7-Termin" }),
          discovery({
            id: "e-2",
            fromAddress: "Kita Sonnenschein <kita@example.com>",
            suggestions: [],
            subject: "Elternabend",
          }),
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("home-inbound-discovery"));

    expect(screen.getByTestId("inbound-discovery-group-e-1")).toHaveTextContent(
      "E-Mail von Praxis Weber",
    );
    expect(screen.getByTestId("inbound-discovery-group-e-1")).toHaveTextContent(
      "Betreff: U7-Termin",
    );
    expect(screen.getByTestId("inbound-discovery-group-e-2")).toHaveTextContent(
      "E-Mail von Kita Sonnenschein",
    );
    expect(screen.getByTestId("inbound-discovery-group-e-2")).toHaveTextContent(
      "Betreff: Elternabend",
    );
  });

  it("locks every retention decision while one is saving", () => {
    decideInboundEmailRetention.mockReturnValueOnce(
      new Promise(() => {}),
    );
    render(
      <InboundDiscovery
        discoveries={[
          discovery({ id: "e-1", suggestions: [] }),
          discovery({ id: "e-2", suggestions: [] }),
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("home-inbound-discovery"));
    fireEvent.click(screen.getAllByRole("button", { name: "Bitte löschen" })[0]);

    for (const button of screen.getAllByRole("button", {
      name: "Bitte löschen",
    })) {
      expect(button).toBeDisabled();
    }
    for (const button of screen.getAllByRole("button", { name: "Behalten" })) {
      expect(button).toBeDisabled();
    }
  });

  it("picks up the next discovery when revalidation delivers fresh props", async () => {
    const { rerender } = render(
      <InboundDiscovery discoveries={[discovery({ id: "e-1", suggestions: [] })]} />,
    );
    fireEvent.click(screen.getByTestId("home-inbound-discovery"));
    fireEvent.click(screen.getByRole("button", { name: "Behalten" }));
    await waitFor(() =>
      expect(decideInboundEmailRetention).toHaveBeenCalledWith("e-1", true),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("home-inbound-discovery")).toBeNull(),
    );

    // The server answered the decision and revalidated /home: the next
    // pending email arrives as new props while this component stays mounted.
    rerender(
      <InboundDiscovery
        discoveries={[
          discovery({
            id: "e-2",
            subject: "Elternabend",
            suggestions: [],
          }),
        ]}
      />,
    );
    expect(screen.getByTestId("home-inbound-discovery")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("home-inbound-discovery"));
    expect(screen.getByTestId("inbound-discovery-group-e-2")).toHaveTextContent(
      "Betreff: Elternabend",
    );
  });

  it("never revives an email the family already answered", async () => {
    const { rerender } = render(
      <InboundDiscovery discoveries={[discovery({ id: "e-1", suggestions: [] })]} />,
    );
    fireEvent.click(screen.getByTestId("home-inbound-discovery"));
    fireEvent.click(screen.getByRole("button", { name: "Bitte löschen" }));
    await waitFor(() =>
      expect(decideInboundEmailRetention).toHaveBeenCalledWith("e-1", false),
    );

    // A stale revalidation payload still carrying the deleted email must not
    // bring it back.
    rerender(
      <InboundDiscovery
        discoveries={[discovery({ id: "e-1", suggestions: [] })]}
      />,
    );
    expect(screen.queryByTestId("home-inbound-discovery")).toBeNull();
  });

  it("keeps the proposal on screen when saving fails", async () => {
    acceptInboundSuggestion.mockResolvedValue({
      success: false,
      error: "Etwas ist schiefgelaufen.",
    });
    render(<InboundDiscovery discoveries={[discovery()]} />);
    fireEvent.click(screen.getByTestId("home-inbound-discovery"));
    fireEvent.click(screen.getByRole("button", { name: "In den Kalender" }));

    await waitFor(() => expect(acceptInboundSuggestion).toHaveBeenCalled());
    expect(screen.getByTestId("inbound-suggestion-card")).toBeInTheDocument();
  });
});
