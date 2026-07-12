import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

import { ScanReviewStep, AUTO_CONFIRM_DELAY_MS } from "../review-step";
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

/** A clean analysis — nothing flagged, high-confidence person match. */
const cleanAnalysis: DocumentAnalysis = {
  document_type: "school",
  title: "Kita-Brief für Emma",
  summary: "Ein Brief der Kita.",
  family_members: [{ person_id: "member-1", name: "Emma", confidence: 0.95 }],
  organizations: [],
  dates: [],
  amounts: [],
  tasks: [],
  facts: [],
  suggested_category: "Kita",
  tags: [],
  needs_user_review: false,
};

/** An unclean analysis — the extraction flagged something as uncertain. */
const uncertainAnalysis: DocumentAnalysis = {
  ...cleanAnalysis,
  needs_user_review: true,
};

const familyMembers = [{ id: "member-1", name: "Emma", role: "Kind" }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchDocumentAnalysis).mockResolvedValue(uncertainAnalysis);
  vi.mocked(fetchFamilyMembers).mockResolvedValue(familyMembers);
  vi.mocked(fetchExistingCategories).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ScanReviewStep — manual review (uncertain analysis)", () => {
  it("shows a skeleton while loading", async () => {
    render(<ScanReviewStep documentId="doc-1" onDone={vi.fn()} />);
    expect(screen.getByTestId("review-card-skeleton")).toBeDefined();
    // Let the pending fetch effects settle before the test ends, to
    // avoid an act() warning from the state update landing after this
    // test has already finished.
    await screen.findByTestId("review-summary");
  });

  it("renders the compact ReviewSummary once loaded", async () => {
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

describe("ScanReviewStep — zero-touch auto-file (clean analysis)", () => {
  beforeEach(() => {
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(cleanAnalysis);
  });

  it("shows the auto-file card instead of the summary for a clean analysis", async () => {
    render(<ScanReviewStep documentId="doc-1" onDone={vi.fn()} />);
    expect(await screen.findByTestId("review-step-autofile")).toBeDefined();
    expect(screen.queryByTestId("review-summary")).toBeNull();
  });

  it("confirms automatically once the countdown elapses", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    // Fake timers BEFORE render so the countdown setTimeout is captured.
    vi.useFakeTimers();
    render(<ScanReviewStep documentId="doc-1" onDone={vi.fn()} />);
    // Let the analysis fetch microtasks settle → auto-file card mounts.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByTestId("review-step-autofile")).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_CONFIRM_DELAY_MS + 50);
    });
    vi.useRealTimers();

    await waitFor(() =>
      expect(screen.getByTestId("review-step-confirmed")).toBeDefined(),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/documents/doc-1/confirm",
      expect.objectContaining({ method: "POST" }),
    );
    fetchSpy.mockRestore();
  });

  it("'Passt so' confirms immediately without waiting for the countdown", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    render(<ScanReviewStep documentId="doc-1" onDone={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("autofile-done-button"));

    await waitFor(() =>
      expect(screen.getByTestId("review-step-confirmed")).toBeDefined(),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it("'Bearbeiten' intercepts the countdown and opens the full Review Card without confirming", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    render(<ScanReviewStep documentId="doc-1" onDone={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("autofile-edit-button"));
    expect(await screen.findByTestId("review-card")).toBeDefined();

    // The countdown was cancelled synchronously on click — no
    // auto-confirm sneaks through.
    const confirmCalls = fetchSpy.mock.calls.filter(
      (args) => String(args[0]).includes("/confirm"),
    );
    expect(confirmCalls).toHaveLength(0);
    fetchSpy.mockRestore();
  });

  it("flushes the confirm when unmounted mid-countdown (wizard closed)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const { unmount } = render(
      <ScanReviewStep documentId="doc-1" onDone={vi.fn()} />,
    );
    await screen.findByTestId("review-step-autofile");
    unmount();

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/documents/doc-1/confirm",
      expect.objectContaining({ method: "POST" }),
    );
    fetchSpy.mockRestore();
  });

  it("falls back to the manual summary when the auto-confirm fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Serverfehler." }), { status: 500 }),
    );

    render(<ScanReviewStep documentId="doc-1" onDone={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("autofile-done-button"));

    expect(await screen.findByTestId("review-summary")).toBeDefined();
    expect(screen.getByText("Serverfehler.")).toBeDefined();
  });
});
