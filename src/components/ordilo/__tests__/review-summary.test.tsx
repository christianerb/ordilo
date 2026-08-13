import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { ReviewSummary } from "@/components/ordilo/review-summary";
import type { DocumentAnalysis } from "@/lib/schemas/extraction";

const familyMembers = [
  { id: "member-1", name: "Emma", role: "Kind" },
  { id: "member-2", name: "Hanna", role: "Kind" },
];

const analysis: DocumentAnalysis = {
  document_type: "school",
  title: "Kita-Brief für Emma",
  summary: "Ein Brief der Kita bezüglich der Anmeldung von Emma.",
  family_members: [{ person_id: "member-1", name: "Emma", confidence: 0.95 }],
  organizations: [
    { name: "Kita Sonnenschein", type: "Kita", confidence: 0.9 },
  ],
  dates: [
    { date: "2026-08-15", type: "deadline", label: "Anmeldefrist", confidence: 0.88 },
  ],
  amounts: [],
  tasks: [
    {
      title: "Anmeldung abschicken",
      due_date: "2026-08-15",
      confidence: 0.91,
    },
  ],
  facts: [],
  suggested_category: "Kita",
  tags: ["Anmeldung"],
  needs_user_review: false,
};

describe("ReviewSummary", () => {
  it("renders the headline and type label", () => {
    render(
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Schule für Emma/i),
    ).toBeDefined();
  });

  it("shows highlight rows with the person's role", () => {
    render(
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText("Emma")).toBeDefined();
    expect(screen.getByText("Kind")).toBeDefined();
    expect(screen.getByText("Kita Sonnenschein")).toBeDefined();
    expect(screen.getByText("Anmeldung abschicken")).toBeDefined();
  });

  it("does not fabricate highlights when the analysis is empty", () => {
    const emptyAnalysis: DocumentAnalysis = {
      document_type: "other",
      title: "Dokument",
      summary: "",
      family_members: [],
      organizations: [],
      dates: [],
      amounts: [],
      tasks: [],
      facts: [],
      suggested_category: "",
      tags: [],
      needs_user_review: false,
    };

    render(
      <ReviewSummary
        analysis={emptyAnalysis}
        familyMembers={[]}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.queryByText("Ordilo hat erkannt")).toBeNull();
  });

  it("shows the uncertainty notice only when needs_user_review is true", () => {
    render(
      <ReviewSummary
        analysis={{ ...analysis, needs_user_review: true }}
        familyMembers={familyMembers}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("review-summary-uncertain-notice"),
    ).toBeDefined();
  });

  it("calls onConfirm when 'Alles bestätigen' is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        onConfirm={onConfirm}
        onEdit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("review-summary-confirm-button"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onEdit when 'Bearbeiten' is clicked", () => {
    const onEdit = vi.fn();
    render(
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        onConfirm={vi.fn()}
        onEdit={onEdit}
      />,
    );

    fireEvent.click(screen.getByTestId("review-summary-edit-button"));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("routes the confirm button to onEdit instead of onConfirm when disambiguation is unresolved", () => {
    const onConfirm = vi.fn();
    const onEdit = vi.fn();
    render(
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        hasUnresolvedDisambiguation
        onConfirm={onConfirm}
        onEdit={onEdit}
      />,
    );

    const confirmButton = screen.getByTestId("review-summary-confirm-button");
    expect(confirmButton).toHaveTextContent(/bitte person wählen/i);
    fireEvent.click(confirmButton);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("assigns a person with a single chip tap", () => {
    const onEditPerson = vi.fn();
    render(
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onEditPerson={onEditPerson}
      />,
    );

    // The recognized person's chip is marked as selected …
    expect(
      screen.getByTestId("review-summary-person-chip-member-1"),
    ).toHaveAttribute("aria-pressed", "true");

    // … tapping it again is a no-op …
    fireEvent.click(screen.getByTestId("review-summary-person-chip-member-1"));
    expect(onEditPerson).not.toHaveBeenCalled();

    // … and one tap on another chip reassigns.
    fireEvent.click(screen.getByTestId("review-summary-person-chip-member-2"));
    expect(onEditPerson).toHaveBeenCalledWith("member-2");
  });

  it("offers an explicit 'Ohne Person' chip", () => {
    const onEditPerson = vi.fn();
    render(
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onEditPerson={onEditPerson}
      />,
    );

    fireEvent.click(screen.getByTestId("review-summary-person-chip-none"));
    expect(onEditPerson).toHaveBeenCalledWith(null);
  });

  it("marks the 'Ohne Person' chip as selected when explicitly resolved", () => {
    render(
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onEditPerson={vi.fn()}
        editedPersonId={null}
      />,
    );

    expect(
      screen.getByTestId("review-summary-person-chip-none"),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByTestId("review-summary-person-chip-member-1"),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("offers to create an extracted person unknown to the family", async () => {
    const onCreatePerson = vi.fn().mockResolvedValue(true);
    render(
      <ReviewSummary
        analysis={{
          ...analysis,
          family_members: [
            { person_id: null, name: "Oma Ute", confidence: 0.6 },
          ],
        }}
        familyMembers={familyMembers}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onEditPerson={vi.fn()}
        onCreatePerson={onCreatePerson}
      />,
    );

    const createChip = screen.getByTestId("review-summary-person-chip-create");
    expect(createChip).toHaveTextContent("Oma Ute anlegen");
    fireEvent.click(createChip);
    expect(onCreatePerson).toHaveBeenCalledWith("Oma Ute");
  });

  it("hides the create chip when the extracted person matches a member", () => {
    render(
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onEditPerson={vi.fn()}
        onCreatePerson={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("review-summary-person-chip-create"),
    ).toBeNull();
  });

  it("offers the create chip even when the family has no members yet", () => {
    // The empty family is exactly the case where creating is the only way
    // forward, so the picker must still mount.
    render(
      <ReviewSummary
        analysis={{
          ...analysis,
          family_members: [
            { person_id: null, name: "Michelle", confidence: 0.5 },
          ],
        }}
        familyMembers={[]}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onEditPerson={vi.fn()}
        onCreatePerson={vi.fn()}
      />,
    );

    expect(screen.getByTestId("review-summary-person-chip-create")).toBeDefined();
    expect(screen.getByTestId("review-summary-person-chip-none")).toBeDefined();
  });

  it("stops naming a person in the headline once assigned to nobody", () => {
    const { rerender } = render(
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onEditPerson={vi.fn()}
      />,
    );
    expect(screen.getByText(/Schule für Emma/i)).toBeDefined();

    rerender(
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onEditPerson={vi.fn()}
        editedPersonId={null}
      />,
    );
    // No longer the "assigned to" form; falls back to the document's title.
    expect(screen.queryByText("Schule für Emma")).toBeNull();
    expect(screen.getByText("Schule: Kita-Brief für Emma")).toBeDefined();
  });

  it("names the newly assigned person in the headline", () => {
    render(
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onEditPerson={vi.fn()}
        editedPersonId="member-2"
      />,
    );
    expect(screen.getByText(/Schule für Hanna/i)).toBeDefined();
  });

  it("displays a confirm error message when provided", () => {
    render(
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        confirmError="Bestätigen hat nicht geklappt."
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Bestätigen hat nicht geklappt."),
    ).toBeDefined();
  });

  it("gives the person assignment its own section, not a highlight row", () => {
    render(
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onEditPerson={vi.fn()}
      />,
    );

    const section = screen.getByTestId("review-summary-person-section");
    // The picker lives in the dedicated section…
    expect(
      within(section).getByTestId("review-summary-person-chip-member-1"),
    ).toBeDefined();
    // …and the highlights list does not repeat the person (their role
    // caption "Kind" would be the only place it could show up).
    expect(screen.queryByText("Kind")).toBeNull();
  });

  it("shows the person section even when no person was extracted", () => {
    render(
      <ReviewSummary
        analysis={{ ...analysis, family_members: [] }}
        familyMembers={familyMembers}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onEditPerson={vi.fn()}
      />,
    );

    const section = screen.getByTestId("review-summary-person-section");
    expect(
      within(section).getByTestId("review-summary-person-chip-member-2"),
    ).toBeDefined();
  });

  it("offers free-text create from the person section", () => {
    render(
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onEditPerson={vi.fn()}
        onCreatePerson={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("review-summary-person-chip-new"),
    ).toBeDefined();
  });

  it("shows the person section for an empty family when creating is possible", () => {
    render(
      <ReviewSummary
        analysis={{ ...analysis, family_members: [] }}
        familyMembers={[]}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onEditPerson={vi.fn()}
        onCreatePerson={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("review-summary-person-chip-new"),
    ).toBeDefined();
  });

  it("hides the person section entirely without edit handlers", () => {
    render(
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("review-summary-person-section")).toBeNull();
    // The person then shows up as a plain highlight row instead.
    expect(screen.getByText("Emma")).toBeDefined();
    expect(screen.getByText("Kind")).toBeDefined();
  });
});
