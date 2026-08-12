import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { mockPush } = vi.hoisted(() => ({
  mockPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/app/(app)/onboarding/actions", () => ({
  createFamily: vi.fn(),
  addMember: vi.fn(),
  completeOnboarding: vi.fn(),
}));

import { OnboardingFlow, type OnboardingState } from "@/app/(app)/onboarding/onboarding-flow";
import { completeOnboarding } from "@/app/(app)/onboarding/actions";

describe("OnboardingFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the two-step setup progress for a new family", () => {
    const initialState: OnboardingState = {
      step: "family-name",
      familyId: null,
      familyName: null,
      members: [],
    };

    render(<OnboardingFlow initialState={initialState} />);

    expect(screen.getByText("Schritt 1 von 2")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(document.querySelector(".animate-onboarding-step")).not.toBeNull();
    expect(
      screen.getByText("Das kannst du auch später ergänzen."),
    ).toBeInTheDocument();
  });

  it("records the first-scan intent when starting the scanner", async () => {
    (completeOnboarding as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: null,
    });
    const initialState: OnboardingState = {
      step: "ready",
      familyId: "family-1",
      familyName: "Familie Müller",
      members: [],
    };

    render(<OnboardingFlow initialState={initialState} />);
    fireEvent.click(screen.getByTestId("onboarding-scan-button"));

    await waitFor(() => {
      expect(completeOnboarding).toHaveBeenCalledWith("family-1", true);
    });
    expect(mockPush).toHaveBeenCalledWith("/home?scan=1");
  });
});
