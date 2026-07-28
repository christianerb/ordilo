import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InviteLanding } from "../[token]/invite-landing";

const { acceptInvite, requestInviteSignIn } = vi.hoisted(() => ({
  acceptInvite: vi.fn(),
  requestInviteSignIn: vi.fn(),
}));

vi.mock("../actions", () => ({
  acceptInvite,
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
