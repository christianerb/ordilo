import { buildPersonalChatStarters } from "@ordilo/chat-contract";
import { getHeuteBriefing, type HeuteEventOccurrence, type HeuteDocument } from "../lib/heute";
import { taskHandoffLabel } from "../lib/task-handoffs";
import { notificationDestination } from "../lib/notifications";

jest.mock("expo-notifications", () => ({ setNotificationHandler: jest.fn() }));

it("never offers a calm day while a today's appointment exists", () => {
  const appointment = { id: "event", title: "Arzttermin", date: "2026-09-06", startsTime: "12:00" } as HeuteEventOccurrence;
  expect(getHeuteBriefing([], [], 0, new Date("2026-09-06T10:00:00"), { todayEvents: [appointment] })).toEqual({ kind: "event", occurrence: appointment });
});
it("shows unfinished imports before offering reassurance", () => {
  const document = { id: "doc", status: "failed" } as HeuteDocument;
  expect(getHeuteBriefing([], [], 0, new Date(), { documents: [document] })).toEqual({ kind: "processing", document });
});
it("distinguishes an assignment from a confirmed acceptance, including reassignment", () => {
  expect(taskHandoffLabel("alex", undefined, "Alex")).toBe("Für Alex vorgesehen");
  expect(taskHandoffLabel("alex", "alex", "Alex")).toBe("Alex hat übernommen");
  expect(taskHandoffLabel("sam", "alex", "Sam")).toBe("Für Sam vorgesehen");
});
it("keeps display labels short while preserving full source identity in the prompt", () => {
  const title = "Schülerticket ".repeat(30);
  const starters = buildPersonalChatStarters({ members: [], recentDocumentTitle: title, upcomingTaskTitle: "Für Fahrten einen Ausweis mitführen" });
  expect(starters[0].label.length).toBeLessThan(60);
  expect(starters[0].prompt).toContain(title.trim());
  expect(starters[1].prompt).toContain("Hilf mir bei dieser Aufgabe:");
});
it("refuses notification destinations from a different family", () => {
  expect(notificationDestination({ familyId: "other", documentId: "00000000-0000-4000-a000-000000000001" }, "ours")).toBeNull();
  expect(notificationDestination({ familyId: "ours", url: "https://example.com" }, "ours")).toBe("/(tabs)/plan");
});
