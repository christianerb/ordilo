import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildConfirmPayload, type EditState } from "@/components/ordilo/review-card/helpers";
import { AISearchBar } from "@/components/ordilo/ai-search-bar";
import type { DocumentAnalysis } from "@/lib/schemas/extraction";

function emptyEdits(): EditState {
  return {
    persons: new Map(),
    category: null,
    dates: new Map(),
    taskDueDates: new Map(),
    deletedTasks: new Set(),
    factValues: new Map(),
  };
}

function analysisWithFact(): DocumentAnalysis {
  return {
    document_type: "invoice",
    title: "Waschmaschinen-Rechnung",
    summary: "Kauf einer Waschmaschine.",
    family_members: [],
    organizations: [],
    dates: [],
    amounts: [],
    tasks: [],
    facts: [
      {
        fact_type: "serial_number",
        label: "Seriennummer Waschmaschine",
        value: "SN 4823-XK",
        confidence: 0.95,
      },
    ],
    suggested_category: "Rechnungen",
    tags: [],
    needs_user_review: false,
  };
}

describe("buildConfirmPayload facts", () => {
  it("passes facts through unchanged without edits", () => {
    const payload = buildConfirmPayload(analysisWithFact(), emptyEdits());
    expect(payload.facts).toHaveLength(1);
    expect(payload.facts[0].value).toBe("SN 4823-XK");
  });

  it("applies edited fact values (corrected OCR digit)", () => {
    const edits = emptyEdits();
    edits.factValues.set(0, "SN 4823-XL");
    const payload = buildConfirmPayload(analysisWithFact(), edits);
    expect(payload.facts[0].value).toBe("SN 4823-XL");
    // Other fact fields stay intact.
    expect(payload.facts[0].fact_type).toBe("serial_number");
  });
});

describe("AISearchBar voice button", () => {
  it("hides the mic button when the browser lacks SpeechRecognition", () => {
    // jsdom has no (webkit)SpeechRecognition → the button must not render.
    render(<AISearchBar onSubmit={() => {}} />);
    expect(screen.queryByTestId("voice-search-button")).toBeNull();
  });
});
