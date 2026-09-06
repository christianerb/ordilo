import { describe, expect, it } from "vitest";
import {
  FIRST_VALUE_EXAMPLE,
  firstValueEventProperties,
  getDocumentNextStep,
} from "@ordilo/document-contract";

describe("first value contract", () => {
  it("grounds the prepared answer in the visible example, without dated promises", () => {
    expect(FIRST_VALUE_EXAMPLE.letter).toContain(FIRST_VALUE_EXAMPLE.quote);
    expect(FIRST_VALUE_EXAMPLE.quote).toContain("Trinkflasche und eine Regenjacke");
    expect(FIRST_VALUE_EXAMPLE.notice).toContain("Es wird nichts gespeichert");
  });

  it.each([
    [{ eventsCreated: 1, tasksKept: 1 }, "calendar"],
    [{ eventsCreated: 0, tasksKept: 2 }, "tasks"],
    [{ eventsCreated: 0, tasksKept: 0 }, "question"],
  ] as const)("chooses a useful next step for %j", (outcome, kind) => {
    expect(getDocumentNextStep(outcome).kind).toBe(kind);
  });

  it("copies only allow-listed telemetry properties", () => {
    const event = {
      name: "document_next_step_selected" as const,
      documentId: "document-id",
      destination: "question" as const,
      title: "Private title",
      question: "Private question",
      filename: "private.pdf",
    };
    expect(firstValueEventProperties(event)).toEqual({
      document_id: "document-id",
      destination: "question",
    });
    expect(firstValueEventProperties({ name: "document_result_viewed", documentId: "id" }))
      .toEqual({ document_id: "id" });
    expect(firstValueEventProperties({ name: "onboarding_entry_selected", entry: "scan" }))
      .toEqual({ entry: "scan" });
  });
});
