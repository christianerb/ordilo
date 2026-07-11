import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import { ReviewCard } from "@/components/ordilo/review-card";
import type { DocumentAnalysis } from "@/lib/schemas/extraction";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the analysis fetching module.
vi.mock("@/lib/analysis", () => ({
  fetchDocumentAnalysis: vi.fn(),
  fetchFamilyMembers: vi.fn(),
  fetchExistingCategories: vi.fn(),
}));

// Import the mocked functions for per-test configuration.
import {
  fetchDocumentAnalysis,
  fetchFamilyMembers,
  fetchExistingCategories,
} from "@/lib/analysis";

// Mock the supabase client (used by analysis.ts internally).
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({})),
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockFamilyMembers = [
  { id: "member-1", name: "Emma", role: "Kind" },
  { id: "member-2", name: "Hanna", role: "Kind" },
  { id: "member-3", name: "Papa", role: "Vater" },
];

const mockCategories = ["Kita", "Versicherung", "Arzt"];

const fullAnalysis: DocumentAnalysis = {
  document_type: "school",
  title: "Kita-Brief für Emma",
  summary: "Ein Brief der Kita bezüglich der Anmeldung von Emma.",
  family_members: [
    { person_id: "member-1", name: "Emma", confidence: 0.95 },
  ],
  organizations: [
    { name: "Kita Sonnenschein", type: "Kita", confidence: 0.9 },
  ],
  dates: [
    { date: "2026-08-15", type: "deadline", label: "Anmeldefrist", confidence: 0.88 },
  ],
  amounts: [
    { amount: "150", currency: "EUR", label: "Anmeldegebühr", confidence: 0.82 },
  ],
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
  tags: ["Anmeldung", "Kita", "Emma"],
  needs_user_review: false,
};

const lowConfidenceAnalysis: DocumentAnalysis = {
  document_type: "school",
  title: "Kita-Brief",
  summary: "Ein Brief der Kita.",
  family_members: [
    { person_id: null, name: "Emma", confidence: 0.55 },
  ],
  organizations: [],
  dates: [],
  amounts: [],
  tasks: [],
  facts: [],
  suggested_category: "Kita",
  tags: [],
  needs_user_review: true,
};

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
  suggested_category: "Sonstiges",
  tags: [],
  needs_user_review: false,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchFamilyMembers).mockResolvedValue(mockFamilyMembers);
  vi.mocked(fetchExistingCategories).mockResolvedValue(mockCategories);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReviewCard", () => {
  // ---------------------------------------------------------------------------
  // Pre-analysis pipeline states (uploaded / ocr_processing / ocr_done)
  // ---------------------------------------------------------------------------

  it.each(["uploaded", "ocr_processing", "ocr_done"] as const)(
    "renders the honest processing checklist for status '%s' instead of a broken empty state",
    async (status) => {
      render(<ReviewCard documentId="doc-1" status={status} />);
      expect(
        await screen.findByTestId("review-card-processing"),
      ).toBeDefined();
      // Never falls through to the "no analysis data" error copy for
      // these statuses (VAL-SCAN-041) — that copy is reserved for a
      // genuinely broken analyzed-without-data case.
      expect(screen.queryByText(/Keine Analysedaten vorhanden/)).toBeNull();
      expect(screen.queryByTestId("review-card-error")).toBeNull();
    },
  );

  it("marks the upload step done and the OCR step active for status 'uploaded'", async () => {
    render(<ReviewCard documentId="doc-1" status="uploaded" />);
    await screen.findByTestId("review-card-processing");
    expect(
      screen.getByTestId("review-processing-step-upload").dataset.state,
    ).toBe("done");
    expect(
      screen.getByTestId("review-processing-step-ocr").dataset.state,
    ).toBe("active");
    expect(
      screen.getByTestId("review-processing-step-analysis").dataset.state,
    ).toBe("pending");
  });

  it("marks the upload step done and OCR step active for status 'ocr_processing'", async () => {
    render(<ReviewCard documentId="doc-1" status="ocr_processing" />);
    await screen.findByTestId("review-card-processing");
    expect(
      screen.getByTestId("review-processing-step-upload").dataset.state,
    ).toBe("done");
    expect(
      screen.getByTestId("review-processing-step-ocr").dataset.state,
    ).toBe("active");
  });

  it("marks upload and OCR steps done and the analysis step active for status 'ocr_done'", async () => {
    render(<ReviewCard documentId="doc-1" status="ocr_done" />);
    await screen.findByTestId("review-card-processing");
    expect(
      screen.getByTestId("review-processing-step-upload").dataset.state,
    ).toBe("done");
    expect(
      screen.getByTestId("review-processing-step-ocr").dataset.state,
    ).toBe("done");
    expect(
      screen.getByTestId("review-processing-step-analysis").dataset.state,
    ).toBe("active");
  });

  // ---------------------------------------------------------------------------
  // Analyzing / loading state (skeleton)
  // ---------------------------------------------------------------------------

  it("renders a skeleton when status is 'analyzing'", async () => {
    render(
      <ReviewCard documentId="doc-1" status="analyzing" />,
    );
    // findByTestId is async and wraps the lookup in act(...), which flushes
    // the mount effect's async state updates (fetchFamilyMembers /
    // fetchExistingCategories) so no act() warning is emitted.
    expect(
      await screen.findByTestId("review-card-skeleton"),
    ).toBeDefined();
  });

  it("does not render the confirm button during analyzing", async () => {
    render(
      <ReviewCard documentId="doc-1" status="analyzing" />,
    );
    // Flush the mount effect's async state updates within act(...) first.
    await screen.findByTestId("review-card-skeleton");
    expect(screen.queryByTestId("confirm-button")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Failed state
  // ---------------------------------------------------------------------------

  it("renders an error state when status is 'failed'", async () => {
    render(
      <ReviewCard
        documentId="doc-1"
        status="failed"
        errorMessage="OpenAI: API-Fehler"
      />,
    );
    expect(
      await screen.findByTestId("review-card-error"),
    ).toBeDefined();
  });

  it("shows friendly German copy in the failed state, never raw provider text", async () => {
    render(
      <ReviewCard
        documentId="doc-1"
        status="failed"
        errorMessage="OpenAI: API-Fehler"
      />,
    );
    // Friendly copy is shown. findByText flushes the mount effect's async
    // state updates within act(...) so no act() warning is emitted.
    expect(
      await screen.findByText(/Das hat nicht geklappt\. Bitte nochmal versuchen/),
    ).toBeDefined();
    // Raw provider/backend error text must NOT leak into the UI.
    expect(screen.queryByText("OpenAI: API-Fehler")).toBeNull();
    expect(screen.queryByText(/OpenAI/)).toBeNull();
  });

  it("does not leak other raw provider strings (e.g. 'Could not parse PDF')", async () => {
    render(
      <ReviewCard
        documentId="doc-1"
        status="failed"
        errorMessage="Could not parse PDF"
      />,
    );
    // Flush the mount effect's async state updates within act(...) first.
    expect(
      await screen.findByText(/Das hat nicht geklappt\. Bitte nochmal versuchen/),
    ).toBeDefined();
    expect(screen.queryByText("Could not parse PDF")).toBeNull();
    expect(screen.queryByText(/parse PDF/i)).toBeNull();
  });

  it("shows a retry button in the error state", async () => {
    render(
      <ReviewCard documentId="doc-1" status="failed" />,
    );
    expect(
      await screen.findByTestId("review-retry-button"),
    ).toBeDefined();
  });

  it("calls onRetry when the retry button is clicked", async () => {
    const onRetry = vi.fn();
    render(
      <ReviewCard documentId="doc-1" status="failed" onRetry={onRetry} />,
    );
    // Wait for the retry button to appear so the mount effect's async
    // state updates are flushed within act(...) before the interaction.
    const retryButton = await screen.findByTestId("review-retry-button");
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows a default error message when errorMessage is null", async () => {
    render(
      <ReviewCard documentId="doc-1" status="failed" errorMessage={null} />,
    );
    expect(
      await screen.findByText(/Das hat nicht geklappt\. Bitte nochmal versuchen/),
    ).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Confirmed state
  // ---------------------------------------------------------------------------

  it("renders a confirmed state when status is 'confirmed'", async () => {
    render(
      <ReviewCard documentId="doc-1" status="confirmed" />,
    );
    expect(
      await screen.findByTestId("review-card-confirmed"),
    ).toBeDefined();
    expect(screen.queryByTestId("confirm-button")).toBeNull();
  });

  it("shows 'Nochmal lesen' button in confirmed state (VAL-EXTRACT-012)", async () => {
    render(
      <ReviewCard documentId="doc-1" status="confirmed" />,
    );
    // findByTestId flushes the mount effect's async state updates within
    // act(...) so no act() warning is emitted.
    expect(
      await screen.findByTestId("review-card-confirmed"),
    ).toBeDefined();
    // The confirmed state must expose a re-analyze affordance so the user
    // can trigger the confirmed→analyzed re-analyze flow from the UI.
    expect(
      screen.getByTestId("confirmed-reanalyze-button"),
    ).toBeDefined();
  });

  it("shows the document's actual metadata (persons, category, tags) for an already-confirmed document", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    render(<ReviewCard documentId="doc-1" status="confirmed" />);

    const details = await screen.findByTestId("confirmed-details");
    expect(
      within(within(details).getByTestId("confirmed-persons")).getByText("Emma"),
    ).toBeDefined();
    expect(
      within(within(details).getByTestId("confirmed-category")).getByText("Kita"),
    ).toBeDefined();
    expect(
      within(within(details).getByTestId("confirmed-tags")).getByText("Anmeldung"),
    ).toBeDefined();
  });

  it("does not render confirmed-details when the analysis has no data", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(null);

    render(<ReviewCard documentId="doc-1" status="confirmed" />);

    await screen.findByTestId("review-card-confirmed");
    expect(screen.queryByTestId("confirmed-details")).toBeNull();
  });

  it("opens the original file in a new tab via the signed-URL endpoint", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ url: "https://storage.example.com/signed" }), {
        status: 200,
      }),
    );
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<ReviewCard documentId="doc-1" status="confirmed" />);

    const viewFileButton = await screen.findByTestId("view-original-file-button");
    fireEvent.click(viewFileButton);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/api/documents/doc-1/file");
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        "https://storage.example.com/signed",
        "_blank",
        "noopener,noreferrer",
      );
    });

    fetchSpy.mockRestore();
    openSpy.mockRestore();
  });

  it("calls the analyze API when 'Nochmal lesen' is clicked in confirmed state (VAL-EXTRACT-012)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "analyzed" }), { status: 200 }),
    );

    render(
      <ReviewCard documentId="doc-1" status="confirmed" />,
    );

    // The re-analyze button should be present in the confirmed state.
    const reanalyzeButton = screen.getByTestId("confirmed-reanalyze-button");
    fireEvent.click(reanalyzeButton);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/documents/doc-1/analyze",
        expect.objectContaining({ method: "POST" }),
      );
    });

    fetchSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Analyzed state — full content
  // ---------------------------------------------------------------------------

  it("renders the review card with all fields when analyzed", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    // Wait for the analysis to load.
    await waitFor(() => {
      expect(screen.getByTestId("review-card")).toBeDefined();
    });

    // Summary
    expect(screen.getByTestId("review-summary")).toBeDefined();

    // All field sections
    expect(screen.getByTestId("review-persons")).toBeDefined();
    expect(screen.getByTestId("review-organizations")).toBeDefined();
    expect(screen.getByTestId("review-dates")).toBeDefined();
    expect(screen.getByTestId("review-amounts")).toBeDefined();
    expect(screen.getByTestId("review-tasks")).toBeDefined();
    expect(screen.getByTestId("review-category")).toBeDefined();
    expect(screen.getByTestId("review-tags")).toBeDefined();
  });

  it("does not show the redundant review intro sentence", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-card")).toBeDefined();
    });

    expect(screen.queryByText(/Ich glaube, das ist/i)).toBeNull();
  });

  it("shows 'Ins Familienbuch übernehmen' button enabled when analyzed and no unresolved disambiguation", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("confirm-button")).toBeDefined();
    });

    const confirmButton = screen.getByTestId("confirm-button");
    // fullAnalysis has a high-confidence person (0.95) → no unresolved
    // disambiguation → button is enabled.
    expect(confirmButton.getAttribute("disabled")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Disambiguation gating (VAL-REVIEW-009)
  // ---------------------------------------------------------------------------

  it("disables 'Ins Familienbuch übernehmen' while an unresolved low-confidence disambiguation remains", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(lowConfidenceAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("disambiguation-prompt")).toBeDefined();
    });

    const confirmButton = screen.getByTestId("confirm-button");
    expect(confirmButton.getAttribute("disabled")).not.toBeNull();
  });

  it("does not call the confirm API when disambiguation is unresolved", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(lowConfidenceAnalysis);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "confirmed" }), { status: 200 }),
    );

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("confirm-button")).toBeDefined();
    });

    // Button is disabled, but even a forced click should not call confirm.
    fireEvent.click(screen.getByTestId("confirm-button"));

    // Allow any pending microtasks to flush.
    await waitFor(() => {
      // No POST to the confirm endpoint should have been made.
      const confirmCalls = fetchSpy.mock.calls.filter(
        ([url]) =>
          typeof url === "string" && url.includes("/confirm"),
      );
      expect(confirmCalls.length).toBe(0);
    });

    fetchSpy.mockRestore();
  });

  it("enables 'Ins Familienbuch übernehmen' after the user resolves the disambiguation", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(lowConfidenceAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("disambiguation-prompt")).toBeDefined();
    });

    // Initially disabled.
    expect(
      screen.getByTestId("confirm-button").getAttribute("disabled"),
    ).not.toBeNull();

    // Resolve the disambiguation by picking a family member.
    fireEvent.click(screen.getByTestId("disambiguation-option-member-2"));

    // Button should now be enabled.
    await waitFor(() => {
      expect(
        screen.getByTestId("confirm-button").getAttribute("disabled"),
      ).toBeNull();
    });
  });

  it("sends the chosen disambiguation value as the edited person value on confirm", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(lowConfidenceAnalysis);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "confirmed" }), { status: 200 }),
    );

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("disambiguation-prompt")).toBeDefined();
    });

    // Resolve the disambiguation by picking "Hanna" (member-2).
    fireEvent.click(screen.getByTestId("disambiguation-option-member-2"));

    // Wait for the button to become enabled.
    await waitFor(() => {
      expect(
        screen.getByTestId("confirm-button").getAttribute("disabled"),
      ).toBeNull();
    });

    // Confirm.
    fireEvent.click(screen.getByTestId("confirm-button"));

    await waitFor(() => {
      const confirmCall = fetchSpy.mock.calls.find(
        ([url]) =>
          typeof url === "string" && url.includes("/confirm"),
      );
      expect(confirmCall).toBeDefined();
      const body = JSON.parse(
        (confirmCall![1] as RequestInit).body as string,
      );
      // The chosen family member (Hanna) is sent as the edited person.
      expect(body.family_members[0].name).toBe("Hanna");
      expect(body.family_members[0].person_id).toBe("member-2");
    });

    fetchSpy.mockRestore();
  });

  it("shows 'Nochmal lesen' button when analyzed", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("reanalyze-button")).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Confidence badges
  // ---------------------------------------------------------------------------

  it("hides the confidence badge for high-confidence fields", async () => {
    // fullAnalysis: person 0.95, organization 0.9, date 0.88, task 0.91 —
    // all above the high threshold, so none of them need a badge.
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    const persons = await screen.findByTestId("review-persons");
    expect(within(persons).queryByTestId("confidence-badge")).toBeNull();
    expect(
      within(screen.getByTestId("review-organizations")).queryByTestId(
        "confidence-badge",
      ),
    ).toBeNull();
    expect(
      within(screen.getByTestId("review-dates")).queryByTestId(
        "confidence-badge",
      ),
    ).toBeNull();
    expect(
      within(screen.getByTestId("review-tasks")).queryByTestId(
        "confidence-badge",
      ),
    ).toBeNull();
  });

  it("shows the confidence badge only for medium/low-confidence fields", async () => {
    // fullAnalysis's amount is 0.82 (medium) — the one field in this
    // fixture actually worth a second look.
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    const amounts = await screen.findByTestId("review-amounts");
    expect(within(amounts).getByTestId("confidence-badge")).toBeDefined();
  });

  it("shows the confidence badge for a low-confidence person needing disambiguation", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(lowConfidenceAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    const persons = await screen.findByTestId("review-persons");
    expect(within(persons).getByTestId("confidence-badge")).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // needs_user_review visual emphasis
  // ---------------------------------------------------------------------------

  it("shows 'Überprüfung nötig' badge when needs_user_review is true", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(lowConfidenceAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-needed-badge")).toBeDefined();
    });
  });

  it("does not show 'Überprüfung nötig' badge when needs_user_review is false", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-card")).toBeDefined();
    });

    expect(screen.queryByTestId("review-needed-badge")).toBeNull();
  });

  it("applies highlight styling to the card when needs_user_review is true", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(lowConfidenceAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-card")).toBeDefined();
    });

    const card = screen.getByTestId("review-card");
    expect(card.getAttribute("data-needs-review")).toBe("true");
  });

  // ---------------------------------------------------------------------------
  // Disambiguation prompt
  // ---------------------------------------------------------------------------

  it("shows disambiguation prompt for low-confidence person with multiple family members", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(lowConfidenceAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("disambiguation-prompt")).toBeDefined();
    });

    // Should show candidate family member options
    expect(
      screen.getByTestId("disambiguation-option-member-1"),
    ).toBeDefined();
    expect(
      screen.getByTestId("disambiguation-option-member-2"),
    ).toBeDefined();
  });

  it("does not show disambiguation prompt when all persons have high confidence", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-card")).toBeDefined();
    });

    expect(screen.queryByTestId("disambiguation-prompt")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Edit person flow
  // ---------------------------------------------------------------------------

  it("renders a person edit dropdown with family members", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-card")).toBeDefined();
    });

    const select = screen.getByTestId("person-edit-select");
    expect(select).toBeDefined();

    // Should have options for each family member.
    const options = select.querySelectorAll("option");
    const optionTexts = Array.from(options).map((o) => o.textContent);
    expect(optionTexts).toContain("Emma (Kind)");
    expect(optionTexts).toContain("Hanna (Kind)");
  });

  it("marks person as 'bearbeitet' after editing", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-card")).toBeDefined();
    });

    // Initially no edited tag.
    expect(screen.queryAllByTestId("edited-tag").length).toBe(0);

    // Change the person.
    const select = screen.getByTestId(
      "person-edit-select",
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "member-2" } });

    // Should now show the edited tag.
    await waitFor(() => {
      expect(screen.getAllByTestId("edited-tag").length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Edit category flow
  // ---------------------------------------------------------------------------

  it("renders a category edit control with existing categories", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-card")).toBeDefined();
    });

    const select = screen.getByTestId("category-edit-select");
    expect(select).toBeDefined();

    const options = select.querySelectorAll("option");
    const optionTexts = Array.from(options).map((o) => o.textContent);
    expect(optionTexts).toContain("Kita");
    expect(optionTexts).toContain("Versicherung");
    expect(optionTexts).toContain("Arzt");
  });

  it("marks category as 'bearbeitet' after editing", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-card")).toBeDefined();
    });

    // Change the category.
    const select = screen.getByTestId(
      "category-edit-select",
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "Versicherung" } });

    await waitFor(() => {
      expect(screen.getAllByTestId("edited-tag").length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Delete task flow
  // ---------------------------------------------------------------------------

  it("removes a task when the delete button is clicked", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-task-0")).toBeDefined();
    });

    // Click delete.
    fireEvent.click(screen.getByTestId("delete-task-0"));

    // Task should be removed from the UI.
    await waitFor(() => {
      expect(screen.queryByTestId("review-task-0")).toBeNull();
    });
  });

  it("shows empty tasks message when all tasks are deleted", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-task-0")).toBeDefined();
    });

    // Delete the only task.
    fireEvent.click(screen.getByTestId("delete-task-0"));

    await waitFor(() => {
      expect(
        screen.getByText("Alle Aufgaben wurden entfernt."),
      ).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Empty / partial extraction
  // ---------------------------------------------------------------------------

  it("renders gracefully with an empty extraction (no entities)", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(emptyAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-card")).toBeDefined();
    });

    // Should still render the card and confirm button.
    expect(screen.getByTestId("confirm-button")).toBeDefined();
    expect(screen.queryByTestId("review-headline")).toBeNull();

    // Should not render empty field sections.
    expect(screen.queryByTestId("review-persons")).toBeNull();
    expect(screen.queryByTestId("review-organizations")).toBeNull();
    expect(screen.queryByTestId("review-tasks")).toBeNull();
    expect(screen.queryByTestId("review-tags")).toBeNull();

    // Category is always shown.
    expect(screen.getByTestId("review-category")).toBeDefined();
  });

  it("does not render the summary section when summary is empty", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(emptyAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-card")).toBeDefined();
    });

    expect(screen.queryByTestId("review-summary")).toBeNull();
  });

  it("does not render the summary section for generic uncertain filler copy", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue({
      ...lowConfidenceAnalysis,
      summary: "Ein unscharfer Hinweis mit unsicheren Angaben.",
    });

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-card")).toBeDefined();
    });

    expect(screen.queryByTestId("review-summary")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Re-analyze
  // ---------------------------------------------------------------------------

  it("calls the analyze API when 'Nochmal lesen' is clicked", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "analyzed" }), { status: 200 }),
    );

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("reanalyze-button")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("reanalyze-button"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/documents/doc-1/analyze",
        expect.objectContaining({ method: "POST" }),
      );
    });

    fetchSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Confirm
  // ---------------------------------------------------------------------------

  it("calls the confirm API when 'Ins Familienbuch übernehmen' is clicked", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "confirmed" }), { status: 200 }),
    );

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("confirm-button")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("confirm-button"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/documents/doc-1/confirm",
        expect.objectContaining({ method: "POST" }),
      );
    });

    fetchSpy.mockRestore();
  });

  it("shows confirmed state after successful confirm", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "confirmed" }), { status: 200 }),
    );

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("confirm-button")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("confirm-button"));

    await waitFor(() => {
      expect(screen.getByTestId("review-card-confirmed")).toBeDefined();
    });
  });

  it("celebrates with the mascot's success animation right after confirming", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "confirmed" }), { status: 200 }),
    );

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("confirm-button")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("confirm-button"));

    const confirmedCard = await screen.findByTestId("review-card-confirmed");
    expect(
      confirmedCard.querySelector("svg.ordilo-mascot-bounce"),
    ).not.toBeNull();
  });

  it("does not replay the celebration when revisiting an already-confirmed document", async () => {
    render(<ReviewCard documentId="doc-1" status="confirmed" />);

    const confirmedCard = await screen.findByTestId("review-card-confirmed");
    expect(
      confirmedCard.querySelector("svg.ordilo-mascot-bounce"),
    ).toBeNull();
  });

  it("shows an error message when confirm fails", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Bestätigen hat nicht geklappt." }),
        { status: 500 },
      ),
    );

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("confirm-button")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("confirm-button"));

    await waitFor(() => {
      expect(screen.getByText("Bestätigen hat nicht geklappt.")).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Tags
  // ---------------------------------------------------------------------------

  it("renders tags as pills", async () => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(fullAnalysis);

    render(
      <ReviewCard documentId="doc-1" status="analyzed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("review-tags")).toBeDefined();
    });

    const tagsSection = screen.getByTestId("review-tags");
    expect(within(tagsSection).getByText("Anmeldung")).toBeDefined();
    expect(within(tagsSection).getByText("Kita")).toBeDefined();
    expect(within(tagsSection).getByText("Emma")).toBeDefined();
  });
});
