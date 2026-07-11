import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// jsdom does not implement Element.scrollTo — polyfill so the
// OnboardingFlow auto-scroll useEffect doesn't throw during tests.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
}

// Mock next/navigation useRouter (used by OnboardingFlow for the finish
// redirect — safe to no-op here).
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock the server actions so the component test never hits real Supabase.
// addMember is configured per-test to reject (simulate a network/server
// action invocation failure — the bug surface for VAL-ONBOARD-013).
vi.mock("@/app/(app)/onboarding/actions", () => ({
  createFamily: vi.fn(),
  addMember: vi.fn(),
  completeOnboarding: vi.fn(),
}));

import { OnboardingFlow } from "@/app/(app)/onboarding/onboarding-flow";
import type { OnboardingState } from "@/app/(app)/onboarding/onboarding-flow";
import { addMember } from "@/app/(app)/onboarding/actions";

/** Initial state placing the flow at the add-member step (family exists). */
const addMemberState: OnboardingState = {
  step: "add-member",
  familyId: "fam-1",
  familyName: "Testfamilie",
  members: [],
};

/** Friendly German error the UI must surface on a thrown mutation. */
const FRIENDLY_ERROR = "Das hat nicht geklappt. Bitte versuch's nochmal.";

describe("OnboardingFlow — add-member error recovery (VAL-ONBOARD-013)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears the saving state and shows a recoverable German error when addMember throws", async () => {
    // Simulate a network/server-action invocation failure: the action
    // THROWS (not a { success: false } return). Without try/catch/finally
    // the isSubmitting flag stays true and the button is stuck on
    // "Wird gespeichert…" — this is the bug.
    (addMember as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network request failed"),
    );

    render(<OnboardingFlow initialState={addMemberState} />);

    // Enter a member name and submit the add-member form.
    const nameInput = screen.getByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "Emma" } });

    const form = nameInput.closest("form") as HTMLFormElement;
    fireEvent.submit(form);

    // After the rejection settles, the saving state MUST clear.
    await waitFor(() => {
      // No lingering "Wird gespeichert…" loading text.
      expect(screen.queryByText("Wird gespeichert…")).not.toBeInTheDocument();
    });

    // The submit button returns to its actionable label (not stuck).
    const submitButton = screen.getByRole("button", {
      name: /Person hinzufügen/,
    });
    expect(submitButton).not.toBeDisabled();

    // A friendly, recoverable German error is shown inline.
    expect(screen.getByText(FRIENDLY_ERROR)).toBeInTheDocument();

    // The entered name is preserved so the user can retry in place
    // (no reload required, no input lost).
    expect(nameInput).toHaveValue("Emma");
  });

  it("allows retrying the add-member action in place after a failure (no reload)", async () => {
    // First attempt fails (throws), second attempt succeeds.
    (addMember as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValue({
        success: true,
        data: {
          id: "mem-1",
          family_id: "fam-1",
          name: "Hanna",
          role: null,
          birthdate: null,
          avatar_color: null,
          created_at: "2026-07-06T10:00:00Z",
        },
      });

    render(<OnboardingFlow initialState={addMemberState} />);

    const nameInput = screen.getByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "Hanna" } });

    const form = nameInput.closest("form") as HTMLFormElement;
    fireEvent.submit(form);

    // Wait for the first attempt's error to surface.
    await waitFor(() => {
      expect(screen.getByText(FRIENDLY_ERROR)).toBeInTheDocument();
    });
    expect(addMember).toHaveBeenCalledTimes(1);

    // The button is actionable again — retry in place without reloading.
    const retryButton = screen.getByRole("button", {
      name: /Person hinzufügen/,
    });
    expect(retryButton).not.toBeDisabled();
    fireEvent.click(retryButton);

    // The second attempt is dispatched (retry happened in place).
    await waitFor(() => {
      expect(addMember).toHaveBeenCalledTimes(2);
    });

    // On success the member appears in the running list and the input is
    // cleared for the next person — proving the retry actually completed
    // the mutation and the UI recovered (the quick-add card stays open;
    // there is no interstitial step anymore).
    await waitFor(() => {
      expect(screen.getByText("Hanna")).toBeInTheDocument();
    });
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
  });

  it("clears the saving state when addMember returns a failure result (handled error)", async () => {
    // A handled error (DB failure) returns { success: false, error }.
    // This already worked before the fix, but we assert it still does so
    // the try/catch/finally change doesn't regress handled-error behaviour.
    (addMember as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: FRIENDLY_ERROR,
    });

    render(<OnboardingFlow initialState={addMemberState} />);

    const nameInput = screen.getByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "Emma" } });

    const form = nameInput.closest("form") as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(FRIENDLY_ERROR)).toBeInTheDocument();
    });

    // Saving state cleared.
    expect(screen.queryByText("Wird gespeichert…")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Person hinzufügen/ }),
    ).not.toBeDisabled();

    // Input preserved.
    expect(nameInput).toHaveValue("Emma");
  });
});
