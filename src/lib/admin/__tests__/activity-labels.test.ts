import { expect, it } from "vitest";
import { describeActivityEvent } from "../activity-labels";

it("labels known product events in plain German", () => {
  expect(describeActivityEvent("document_upload_succeeded")).toBe("Dokument hochgeladen");
  expect(describeActivityEvent("chat_question_sent")).toBe("Frage an Ordilo gesendet");
  expect(describeActivityEvent("task_completed")).toBe("Aufgabe erledigt");
});

it("names the onboarding step when the property is known", () => {
  expect(describeActivityEvent("onboarding_step_completed", { step: "family_name" })).toBe("Familie angelegt");
  expect(describeActivityEvent("onboarding_step_completed", { step: "member_added" })).toBe("Weiteres Mitglied angelegt");
});

it("falls back to the generic onboarding label for unknown steps", () => {
  expect(describeActivityEvent("onboarding_step_completed", { step: "something_new" })).toBe("Onboarding-Schritt abgeschlossen");
  expect(describeActivityEvent("onboarding_step_completed", null)).toBe("Onboarding-Schritt abgeschlossen");
});

it("keeps unknown event names visible instead of hiding them", () => {
  expect(describeActivityEvent("brand_new_event")).toBe("brand_new_event");
});
