import { cachePlanSnapshot, readPlanSnapshot, type PlanSnapshotRow } from "../lib/plan-offline";

const mockFiles = new Map<string, string>();
const mockDirectories = new Set<string>();
jest.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(...parts: ({ uri: string } | string)[]) { this.uri = parts.map((p) => typeof p === "string" ? p : p.uri).join("/"); }
    get exists() { return mockDirectories.has(this.uri); }
    create() { mockDirectories.add(this.uri); }
    delete() { mockDirectories.delete(this.uri); for (const path of mockFiles.keys()) if (path.startsWith(this.uri + "/")) mockFiles.delete(path); }
    list() { return [...mockFiles.keys()].filter((p) => p.startsWith(this.uri + "/")); }
  }
  class File {
    uri: string;
    constructor(...parts: ({ uri: string } | string)[]) { this.uri = parts.map((p) => typeof p === "string" ? p : p.uri).join("/"); }
    get name() { return this.uri.split("/").pop()!; }
    get exists() { return mockFiles.has(this.uri); }
    write(value: string) { mockFiles.set(this.uri, value); }
    text() { return Promise.resolve(mockFiles.get(this.uri)); }
    delete() { mockFiles.delete(this.uri); }
  }
  return { Directory, File, Paths: { document: "documents", cache: "cache" } };
});

const rows: PlanSnapshotRow[] = [
  { id: "t1", kind: "task", title: "Schulranzen kaufen", when: "Heute", person: "Karina kümmert sich" },
  { id: "e1", kind: "event", title: "Zahnarzt", when: "Mo · 08:15", person: "Für Ben" },
  { id: "t2", kind: "task", title: "Formular unterschreiben", when: null, person: null },
];

beforeEach(() => {
  mockFiles.clear();
  mockDirectories.clear();
});

test("writes a snapshot and reads it back with its save date", async () => {
  await cachePlanSnapshot("family1", rows);
  const snapshot = await readPlanSnapshot("family1");
  expect(snapshot?.rows).toEqual(rows);
  expect(Number.isNaN(Date.parse(snapshot?.savedAt ?? ""))).toBe(false);
  expect([...mockFiles.keys()].some((path) => path.includes("plan.family1.json"))).toBe(true);
});

test("returns null when nothing is cached", async () => {
  await expect(readPlanSnapshot("family1")).resolves.toBeNull();
  await cachePlanSnapshot("family1", rows);
  await expect(readPlanSnapshot("other-family")).resolves.toBeNull();
});

test("a newer snapshot replaces the older one", async () => {
  await cachePlanSnapshot("family1", rows);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await cachePlanSnapshot("family1", [rows[0]]);
  const snapshot = await readPlanSnapshot("family1");
  expect(snapshot?.rows).toEqual([rows[0]]);
});

test("corrupt or foreign content reads as no snapshot instead of crashing", async () => {
  await cachePlanSnapshot("family1", rows);
  const path = [...mockFiles.keys()].find((key) => key.includes("plan.family1.json"))!;
  mockFiles.set(path, "not json");
  await expect(readPlanSnapshot("family1")).resolves.toBeNull();
  mockFiles.set(path, JSON.stringify({ savedAt: "2026-01-01T00:00:00.000Z", rows: "oops" }));
  await expect(readPlanSnapshot("family1")).resolves.toBeNull();
});

test("rows with the wrong shape are dropped, valid neighbours survive", async () => {
  await cachePlanSnapshot("family1", rows);
  const path = [...mockFiles.keys()].find((key) => key.includes("plan.family1.json"))!;
  mockFiles.set(path, JSON.stringify({
    savedAt: "2026-01-01T00:00:00.000Z",
    rows: [rows[0], { id: "x", kind: "chore", title: "?", when: null, person: null }, null],
  }));
  const snapshot = await readPlanSnapshot("family1");
  expect(snapshot?.rows).toEqual([rows[0]]);
});

test("writing is fire-and-forget safe and never throws", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  await expect(cachePlanSnapshot("not a valid id!", rows)).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
  await expect(readPlanSnapshot("not a valid id!")).resolves.toBeNull();
});
