import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mockRefresh, mockUpdateFamilyName } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockUpdateFamilyName: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: mockRefresh,
  }),
}));

vi.mock("@/app/(app)/familie/actions", () => ({
  updateFamilyName: mockUpdateFamilyName,
}));

import { FamilySettingsClient } from "@/app/(app)/familie/einstellungen/settings-client";

describe("FamilySettingsClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the family name, member count, and creation date", () => {
    render(
      <FamilySettingsClient
        familyId="fam-1"
        familyName="Familie Müller"
        createdAt="2026-01-15T10:00:00Z"
        memberCount={2}
      />,
    );

    expect(screen.getByDisplayValue("Familie Müller")).toBeInTheDocument();
    expect(screen.getByText("2 Personen")).toBeInTheDocument();
    expect(screen.getByText("15.01.2026")).toBeInTheDocument();
  });

  it("uses singular '1 Person' for a single member", () => {
    render(
      <FamilySettingsClient
        familyName="Familie Müller"
        createdAt="2026-01-15T10:00:00Z"
        memberCount={1}
      />,
    );
    expect(screen.getByText("1 Person")).toBeInTheDocument();
  });

  it("disables the save button until the name actually changes", () => {
    render(
      <FamilySettingsClient familyName="Familie Müller" memberCount={2} />,
    );

    const saveButton = screen.getByRole("button", { name: "Speichern" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByDisplayValue("Familie Müller"), {
      target: { value: "Familie Schmidt" },
    });
    expect(saveButton).not.toBeDisabled();
  });

  it("disables the save button when the name is cleared", () => {
    render(
      <FamilySettingsClient familyName="Familie Müller" memberCount={2} />,
    );

    fireEvent.change(screen.getByDisplayValue("Familie Müller"), {
      target: { value: "   " },
    });
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
  });

  it("saves the new name and shows a confirmation", async () => {
    mockUpdateFamilyName.mockResolvedValue({
      success: true,
      data: { name: "Familie Schmidt" },
    });

    render(
      <FamilySettingsClient familyName="Familie Müller" memberCount={2} />,
    );

    fireEvent.change(screen.getByDisplayValue("Familie Müller"), {
      target: { value: "Familie Schmidt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => {
      expect(mockUpdateFamilyName).toHaveBeenCalledWith("Familie Schmidt");
    });
    expect(await screen.findByText("Gespeichert")).toBeInTheDocument();
  });

  it("shows a German server error and does not show the confirmation", async () => {
    mockUpdateFamilyName.mockResolvedValue({
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    });

    render(
      <FamilySettingsClient familyName="Familie Müller" memberCount={2} />,
    );

    fireEvent.change(screen.getByDisplayValue("Familie Müller"), {
      target: { value: "Familie Schmidt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(
      await screen.findByText("Etwas ist schiefgelaufen. Bitte versuche es erneut."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Gespeichert")).not.toBeInTheDocument();
  });

  it("renders a distinct error state when fetchError is true", () => {
    render(<FamilySettingsClient fetchError={true} />);

    expect(
      screen.getByText("Daten konnten nicht geladen werden"),
    ).toBeInTheDocument();
    expect(
      screen.queryByDisplayValue("Familie Müller"),
    ).not.toBeInTheDocument();
  });

  it("calls router.refresh() when the retry button is clicked in the error state", () => {
    render(<FamilySettingsClient fetchError={true} />);
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("links back to /familie", () => {
    render(
      <FamilySettingsClient familyName="Familie Müller" memberCount={2} />,
    );
    expect(screen.getByRole("link", { name: /zurück zur familie/i })).toHaveAttribute(
      "href",
      "/familie",
    );
  });
});
