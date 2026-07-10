import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { ScanReviewStep } from "../review-step";
import type { DocumentAnalysis } from "@/lib/schemas/extraction";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/analysis", () => ({
  fetchDocumentAnalysis: vi.fn(),
  fetchFamilyMembers: vi.fn(),
  fetchExistingCategories: vi.fn(),
}));

import { fetchDocumentAnalysis, fetchFamilyMembers, fetchExistingCategories } from "@/lib/analysis";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({})),
}));

const analysis: DocumentAnalysis = {
  document_type: "school",
  title: "Kita-Brief für Emma",
  summary: "Ein Brief der Kita.",
  family_members: [{ person_id: "member-1", name: "Emma", confidence: 0.95 }],
  organizations: [],
  dates: [],
  amounts: [],
  tasks: [],
  suggested_category: "Kita",
  tags: [],
  needs_user_review: false,
};

const familyMembers = [{ id: "member-1", name: "Emma", role: "Kind" }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchDocumentAnalysis).mockResolvedValue(analysis);
  vi.mocked(fetchFamilyMembers).mockResolvedValue(familyMembers);
  vi.mocked(fetchExistingCategories).mockResolvedValue([]);
});

describe("ScanReviewStep", () => {
  it("shows a skeleton while loading", async () => {
    render(<ScanReviewStep documentId="doc-1" onDone={vi.fn()} />);
    expect(screen.getByTestId("review-card-skeleton")).toBeDefined();
    // Let the pending fetch effects settle before the test ends, to
    // avoid an act() warning from the state update landing after this
    // test has already finished.
    await screen.findByTestId("review-summary");
  });

  it("renders the compact ReviewSummary by default once loaded", async () => {
    render(<ScanReviewStep documentId="doc-1" onDone={vi.fn()} />);
    expect(await screen.findByTestId("review-summary")).toBeDefined();
  });

  it("switches to the full Review Card when 'Bearbeiten' is clicked", async () => {
    render(<ScanReviewStep documentId="doc-1" onDone={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("review-summary-edit-button"));
    expect(await screen.findByTestId("review-card")).toBeDefined();
  });

  it("confirms with no edits and shows the celebration on success", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    render(<ScanReviewStep documentId="doc-1" onDone={vi.fn()} />);

    fireEvent.click(
      await screen.findByTestId("review-summary-confirm-button"),
    );

    await waitFor(() =>
      expect(screen.getByTestId("review-step-confirmed")).toBeDefined(),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/documents/doc-1/confirm",
      expect.objectContaining({ method: "POST" }),
    );

    fetchSpy.mockRestore();
  });

  it("calls onDone when 'Fertig' is clicked after confirming", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const onDone = vi.fn();

    render(<ScanReviewStep documentId="doc-1" onDone={onDone} />);
    fireEvent.click(
      await screen.findByTestId("review-summary-confirm-button"),
    );
    fireEvent.click(await screen.findByTestId("review-step-done-button"));

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("shows a confirm error message when the confirm request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Serverfehler." }), {
        status: 500,
      }),
    );

    render(<ScanReviewStep documentId="doc-1" onDone={vi.fn()} />);
    fireEvent.click(
      await screen.findByTestId("review-summary-confirm-button"),
    );

    expect(await screen.findByText("Serverfehler.")).toBeDefined();
  });
});
