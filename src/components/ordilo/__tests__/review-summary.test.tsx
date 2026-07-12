import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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
      priority: "high",
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
      screen.getByText(/ich glaube, das ist eine schule für emma/i),
    ).toBeDefined();
  });

  it("shows highlight rows derived from real extracted data, with the person's role", () => {
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

  it("lists real auto-actions derived from the analysis", () => {
    render(
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText(/dokument bei emma speichern/i)).toBeDefined();
    expect(
      screen.getByText(/aufgabe "anmeldung abschicken" erstellen/i),
    ).toBeDefined();
    expect(screen.getByText(/In „Kita" einsortieren/)).toBeDefined();
  });

  it("does not fabricate highlights or actions when the analysis is empty", () => {
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
    expect(
      screen.getByText(/dokument im familienbuch speichern/i),
    ).toBeDefined();
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
});
