import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { ReviewCard } from "@/components/ordilo/review-card";
import type { DocumentAnalysis } from "@/lib/schemas/extraction";

/**
 * The "Nummern & Kennungen" section of a confirmed document.
 *
 * A number Ordilo could not name ("Unklare Kennnummer") is a number nobody
 * finds again — type and label are exactly what the fact search matches
 * questions against, so both have to be correctable without a re-scan.
 */

vi.mock("@/lib/analysis", () => ({
  fetchDocumentAnalysis: vi.fn(),
  fetchFamilyMembers: vi.fn(),
  fetchExistingCategories: vi.fn(),
}));

import {
  fetchDocumentAnalysis,
  fetchFamilyMembers,
  fetchExistingCategories,
} from "@/lib/analysis";

const UNCLEAR_FACT = {
  id: "fact-1",
  fact_type: "other",
  label: "Unklare Kennnummer",
  value: "74 031 832 353",
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [UNCLEAR_FACT], error: null })),
        })),
      })),
    })),
  })),
}));

vi.mock("@/app/(app)/familie/actions", () => ({
  addFamilyMember: vi.fn(),
}));

const analysis: DocumentAnalysis = {
  document_type: "other",
  title: "Unklare Nummer",
  summary: "Das Dokument enthält nur eine Zahlenfolge.",
  family_members: [],
  organizations: [],
  dates: [],
  amounts: [],
  tasks: [],
  facts: [],
  suggested_category: "Unterlagen",
  tags: [],
  needs_user_review: false,
};

/**
 * The card also fetches the document file — pick the /facts write out of
 * the calls rather than assuming it came first.
 */
function factsCall(
  spy: ReturnType<typeof vi.spyOn<typeof globalThis, "fetch">>,
): RequestInit {
  const call = spy.mock.calls.find(
    ([url]) => String(url) === "/api/documents/doc-1/facts",
  );
  if (!call) throw new Error("kein /facts-Request");
  return call[1] as RequestInit;
}

describe("confirmed document — Nummern & Kennungen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(analysis);
    vi.mocked(fetchFamilyMembers).mockResolvedValue([]);
    vi.mocked(fetchExistingCategories).mockResolvedValue([]);
  });

  it("lets the family give an unclear number a type and a name", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
      );

    render(<ReviewCard documentId="doc-1" status="confirmed" />);

    await screen.findByText("Unklare Kennnummer");
    fireEvent.click(screen.getByTestId("confirmed-fact-edit-button"));

    fireEvent.change(screen.getByTestId("confirmed-fact-edit-type"), {
      target: { value: "tax_id" },
    });
    fireEvent.change(screen.getByTestId("confirmed-fact-edit-label"), {
      target: { value: "Steuer-ID Hanna" },
    });
    fireEvent.click(screen.getByTestId("confirmed-fact-save-button"));

    const init = await waitFor(() => factsCall(fetchSpy));
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      fact_id: "fact-1",
      value: "74 031 832 353",
      label: "Steuer-ID Hanna",
      fact_type: "tax_id",
    });

    // The corrected label is what the row shows from now on.
    expect(await screen.findByText("Steuer-ID Hanna")).toBeDefined();
    fetchSpy.mockRestore();
  });

  it("carries the default label along when only the type changes", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
      );

    render(<ReviewCard documentId="doc-1" status="confirmed" />);

    await screen.findByText("Unklare Kennnummer");
    fireEvent.click(screen.getByTestId("confirmed-fact-edit-button"));
    // "Unklare Kennnummer" is not a default label, so it survives …
    fireEvent.change(screen.getByTestId("confirmed-fact-edit-type"), {
      target: { value: "tax_id" },
    });
    expect(
      (screen.getByTestId("confirmed-fact-edit-label") as HTMLInputElement)
        .value,
    ).toBe("Unklare Kennnummer");

    // … but a default one is replaced by the new type's default.
    fireEvent.change(screen.getByTestId("confirmed-fact-edit-label"), {
      target: { value: "Kennung" },
    });
    fireEvent.change(screen.getByTestId("confirmed-fact-edit-type"), {
      target: { value: "tax_number" },
    });
    expect(
      (screen.getByTestId("confirmed-fact-edit-label") as HTMLInputElement)
        .value,
    ).toBe("Steuernummer");

    fetchSpy.mockRestore();
  });

  it("sends a user-written label when a number is added", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          fact: {
            id: "fact-2",
            fact_type: "tax_id",
            label: "Steuer-ID Hanna",
            value: "74 031 832 353",
          },
        }),
        { status: 200 },
      ),
    );

    render(<ReviewCard documentId="doc-1" status="confirmed" />);

    await screen.findByText("Unklare Kennnummer");
    fireEvent.click(screen.getByTestId("confirmed-fact-add-button"));
    fireEvent.change(screen.getByTestId("confirmed-fact-add-input"), {
      target: { value: "74 031 832 353" },
    });
    fireEvent.change(screen.getByTestId("confirmed-fact-add-label"), {
      target: { value: "Steuer-ID Hanna" },
    });
    fireEvent.click(screen.getByTestId("confirmed-fact-add-save"));

    const init = await waitFor(() => factsCall(fetchSpy));
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      fact_type: "serial_number",
      value: "74 031 832 353",
      label: "Steuer-ID Hanna",
    });

    fetchSpy.mockRestore();
  });
});
