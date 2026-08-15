import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InviteLanding } from "../[token]/invite-landing";

const { acceptInvite, getInviteMergePreparation, mergeOwnedFamilyIntoInvite, requestInviteSignIn } = vi.hoisted(() => ({
  acceptInvite: vi.fn(),
  getInviteMergePreparation: vi.fn(),
  mergeOwnedFamilyIntoInvite: vi.fn(),
  requestInviteSignIn: vi.fn(),
}));

vi.mock("../actions", () => ({
  acceptInvite,
  getInviteMergePreparation,
  mergeOwnedFamilyIntoInvite,
  requestInviteSignIn,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    auth: { verifyOtp: vi.fn() },
  })),
}));

const TOKEN = "0123456789abcdef";

describe("InviteLanding — confirm state (signed-in user)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks for confirmation and does not accept the invite on render", () => {
    render(
      <InviteLanding token={TOKEN} familyName="Familie Müller" state="confirm" />,
    );

    expect(screen.getByTestId("invite-confirm")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Familie beitreten?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/„Familie Müller“/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /familie beitreten/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abbrechen" })).toHaveAttribute(
      "href",
      "/home",
    );
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it("accepts the invite only after the explicit click", async () => {
    acceptInvite.mockResolvedValue({ success: true });
    // NOTE: on success the component navigates via window.location.assign,
    // so jsdom prints a harmless "Not implemented: navigation" warning for
    // this test (jsdom cannot navigate; the location object is locked).
    render(
      <InviteLanding token={TOKEN} familyName="Familie Müller" state="confirm" />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /familie beitreten/i }),
    );

    await waitFor(() => {
      expect(acceptInvite).toHaveBeenCalledWith(TOKEN);
    });
    expect(await screen.findByTestId("invite-join-complete")).toBeInTheDocument();
    expect(screen.getByTestId("invite-join-celebration")).toBeInTheDocument();
  });

  it("shows the merge decision without reloading when the initial page was stale", async () => {
    acceptInvite.mockResolvedValue({ success: false, reason: "merge_required", error: "Merge nötig" });
    getInviteMergePreparation.mockResolvedValue({
      success: true,
      state: "empty_source",
      preview: {
        sourceFamilyName: "Familie Schmidt", documentCount: 0, taskCount: 0,
        calendarEventCount: 0, memberCount: 0, collectionCount: 0,
        targetAdultCount: 1, fingerprint: "preview-123",
      },
    });
    render(<InviteLanding token={TOKEN} familyName="Familie Müller" state="confirm" />);
    fireEvent.click(screen.getByRole("button", { name: /familie beitreten/i }));

    expect(await screen.findByTestId("invite-empty-source")).toBeInTheDocument();
    expect(getInviteMergePreparation).toHaveBeenCalledWith(TOKEN);
  });

  it("shows the already-in-family screen when the user has another family", async () => {
    acceptInvite.mockResolvedValue({
      success: false,
      reason: "already_in_family",
      error: "Du bist schon in einer Familie.",
    });
    render(
      <InviteLanding token={TOKEN} familyName="Familie Müller" state="confirm" />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /familie beitreten/i }),
    );

    await screen.findByTestId("invite-already-in-family");
    expect(
      screen.getByRole("heading", { name: "Du bist schon in einer Familie" }),
    ).toBeInTheDocument();
  });

  it("shows the invalid screen when the invite expired in the meantime", async () => {
    acceptInvite.mockResolvedValue({
      success: false,
      reason: "invalid",
      error: "Diese Einladung ist nicht mehr gültig.",
    });
    render(
      <InviteLanding token={TOKEN} familyName="Familie Müller" state="confirm" />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /familie beitreten/i }),
    );

    await screen.findByTestId("invite-invalid");
    expect(
      screen.getByRole("heading", {
        name: "Diese Einladung ist nicht mehr gültig",
      }),
    ).toBeInTheDocument();
  });

  it("shows an inline error and re-enables the button on transient failures", async () => {
    acceptInvite.mockResolvedValue({
      success: false,
      error: "Deine Anmeldung ist abgelaufen. Bitte lade die Seite neu.",
    });
    render(
      <InviteLanding token={TOKEN} familyName="Familie Müller" state="confirm" />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /familie beitreten/i }),
    );

    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Deine Anmeldung ist abgelaufen. Bitte lade die Seite neu.",
    );
    // Still on the confirmation screen, ready for another attempt.
    expect(screen.getByTestId("invite-confirm")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /familie beitreten/i }),
    ).toBeEnabled();
  });

  it("does not accept twice on a double click", async () => {
    acceptInvite.mockReturnValue(new Promise(() => {}));
    render(
      <InviteLanding token={TOKEN} familyName="Familie Müller" state="confirm" />,
    );

    const button = screen.getByRole("button", { name: /familie beitreten/i });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => {
      expect(acceptInvite).toHaveBeenCalledTimes(1);
    });
  });
});

describe("InviteLanding — merge state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mergePreview = {
    sourceFamilyName: "Familie Schmidt",
    documentCount: 12,
    taskCount: 4,
    calendarEventCount: 3,
    memberCount: 2,
    collectionCount: 5,
    targetAdultCount: 2,
    fingerprint: "preview-123",
  };

  it("explains the transfer before it is started", () => {
    render(
      <InviteLanding
        token={TOKEN}
        familyName="Familie Müller"
        mergePreview={mergePreview}
        state="merge"
      />,
    );

    expect(screen.getByTestId("invite-merge")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Deine Familie zusammenführen?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/12 Dokumente/)).toBeInTheDocument();
    expect(screen.getByText("Deine bisherige Familie")).toBeInTheDocument();
    expect(screen.getByText("Deine neue Familie")).toBeInTheDocument();
    expect(screen.getByText(/2 erwachsene Personen/)).toBeInTheDocument();
    expect(screen.getByText(/Chat-Verläufe.*nicht übernommen/)).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: /Ich verstehe: Meine bisherige Familie wird übernommen/i,
      }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: /familie zusammenführen/i }),
    ).toBeDisabled();
    expect(mergeOwnedFamilyIntoInvite).not.toHaveBeenCalled();
  });

  it("merges only after an explicit click", async () => {
    mergeOwnedFamilyIntoInvite.mockResolvedValue({ success: true });
    render(
      <InviteLanding
        token={TOKEN}
        familyName="Familie Müller"
        mergePreview={mergePreview}
        state="merge"
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Ich verstehe: Meine bisherige Familie wird übernommen/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /familie zusammenführen/i }),
    );

    await waitFor(() => {
      expect(mergeOwnedFamilyIntoInvite).toHaveBeenCalledWith(TOKEN, "preview-123");
    });

    expect(await screen.findByTestId("invite-join-complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zur Familie" })).toBeEnabled();
  });

  it("offers a simple join when the existing family is empty", () => {
    render(
      <InviteLanding
        token={TOKEN}
        familyName="Familie Müller"
        mergePreview={{
          ...mergePreview,
          documentCount: 0,
          taskCount: 0,
          calendarEventCount: 0,
          memberCount: 0,
          collectionCount: 0,
        }}
        state="empty_source"
      />,
    );

    expect(screen.getByTestId("invite-empty-source")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^familie beitreten$/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole("link", { name: "Bei meiner Familie bleiben" }),
    ).toHaveAttribute("href", "/home");
  });

  it("explains that it will recheck while documents are processing", () => {
    render(
      <InviteLanding token={TOKEN} familyName="Familie Müller" state="source_processing" />,
    );

    expect(screen.getByTestId("invite-source-processing")).toBeInTheDocument();
    expect(
      screen.getByText(/Wir prüfen automatisch in 15 Sekunden erneut/),
    ).toBeInTheDocument();
  });
});
