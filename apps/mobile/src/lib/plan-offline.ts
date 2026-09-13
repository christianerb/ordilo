import { Directory, File, Paths } from "expo-file-system";

/**
 * The family's plan as a snapshot for the offline screen. The plan tab
 * rewrites it whenever fresh data arrives; the offline screen only reads
 * it. The file lives next to the sealed offline documents in "offline-v1"
 * so sign-out (clearOfflineDocuments) wipes it together with them.
 *
 * Plain JSON is enough: titles and dates are far less sensitive than the
 * sealed document originals, and the directory already sits behind the
 * app's sandbox.
 */
export interface PlanSnapshotRow {
  id: string;
  kind: "task" | "event";
  title: string;
  when: string | null;
  person: string | null;
}

export interface PlanSnapshot {
  savedAt: string;
  rows: PlanSnapshotRow[];
}

function snapshotDirectory(): Directory {
  return new Directory(Paths.document, "offline-v1");
}

function snapshotFile(familyId: string): File {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(familyId)) {
    throw new Error("Invalid family id.");
  }
  return new File(snapshotDirectory(), `plan.${familyId}.json`);
}

function isSnapshotRow(value: unknown): value is PlanSnapshotRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    (row.kind === "task" || row.kind === "event") &&
    typeof row.title === "string" &&
    (row.when === null || typeof row.when === "string") &&
    (row.person === null || typeof row.person === "string")
  );
}

/**
 * Fire-and-forget safe: a failed write simply keeps the older snapshot,
 * which is exactly what an offline fallback should fall back to.
 */
export async function cachePlanSnapshot(
  familyId: string,
  rows: PlanSnapshotRow[],
): Promise<void> {
  try {
    const snapshot: PlanSnapshot = {
      savedAt: new Date().toISOString(),
      rows,
    };
    snapshotDirectory().create({ intermediates: true, idempotent: true });
    snapshotFile(familyId).write(JSON.stringify(snapshot));
  } catch (error) {
    console.warn("cachePlanSnapshot failed", error);
  }
}

/** Null when nothing is cached or the snapshot can no longer be read. */
export async function readPlanSnapshot(
  familyId: string,
): Promise<PlanSnapshot | null> {
  try {
    const file = snapshotFile(familyId);
    if (!file.exists) return null;
    const parsed = JSON.parse(await file.text()) as Partial<PlanSnapshot> | null;
    if (
      !parsed ||
      typeof parsed.savedAt !== "string" ||
      !Array.isArray(parsed.rows)
    ) {
      return null;
    }
    return {
      savedAt: parsed.savedAt,
      rows: parsed.rows.filter(isSnapshotRow),
    };
  } catch {
    return null;
  }
}
