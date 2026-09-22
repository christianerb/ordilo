import { getSupabase } from "./supabase";

/**
 * "Neuigkeiten" on Start: the newest things that happened in the family —
 * documents, tasks, events, mail, members — read from the
 * security_invoker view public.family_activity (migration 0084), so RLS
 * of the underlying tables decides what a member sees.
 *
 * The feed is deliberately quiet: Start renders nothing while it loads
 * and nothing when it fails, so the screen only ever gets richer.
 */

export const ACTIVITY_FEED_LIMIT = 15;

const FRIENDLY_ERROR =
  "Das hat gerade nicht geklappt. Bitte versuch es nochmal.";

export type FamilyActivityKind =
  | "document"
  | "task"
  | "event"
  | "email"
  | "member";

export interface FamilyActivityItem {
  /** Stable row key from the view, e.g. "task:created:<uuid>". */
  id: string;
  kind: FamilyActivityKind;
  title: string;
  detail: string | null;
  occurredAt: string;
  refId: string | null;
  /** The document a row is about — set for documents and document-born tasks. */
  documentId: string | null;
}

interface FamilyActivityRow {
  activity_id: string;
  family_id: string;
  kind: string;
  title: string | null;
  detail: string | null;
  occurred_at: string;
  ref_id: string | null;
  document_id: string | null;
}

const ACTIVITY_KINDS: readonly string[] = [
  "document",
  "task",
  "event",
  "email",
  "member",
];

export async function loadFamilyActivity(
  familyId: string,
  limit = ACTIVITY_FEED_LIMIT,
): Promise<FamilyActivityItem[]> {
  const { data, error } = await getSupabase()
    .from("family_activity")
    .select(
      "activity_id, family_id, kind, title, detail, occurred_at, ref_id, document_id",
    )
    .eq("family_id", familyId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(FRIENDLY_ERROR);
  return ((data ?? []) as FamilyActivityRow[])
    .filter((row): row is FamilyActivityRow & { kind: FamilyActivityKind } =>
      ACTIVITY_KINDS.includes(row.kind),
    )
    .map((row) => ({
      id: row.activity_id,
      kind: row.kind,
      title: row.title?.trim() || "Ohne Titel",
      detail: row.detail,
      occurredAt: row.occurred_at,
      refId: row.ref_id,
      documentId: row.document_id,
    }));
}

export type ActivityDestination =
  | { pathname: "/document/[id]"; params: { id: string } }
  | { pathname: "/(tabs)/plan"; params: { task: string } }
  | { pathname: "/(tabs)/plan"; params: { event: string } }
  | { pathname: "/posteingang" }
  | { pathname: "/familie" };

/**
 * Where a Neuigkeiten row leads. A row opens the thing the news is about:
 * a task born from a document opens that document (which is also where a
 * not-yet-confirmed document gets reviewed), not a management screen.
 * A document, task, or event without a usable reference stays read-only —
 * a row that promises a place it cannot open is worse than a row that
 * opens nothing.
 */
export function activityDestination(
  item: Pick<FamilyActivityItem, "kind" | "refId" | "documentId">,
): ActivityDestination | null {
  switch (item.kind) {
    case "document":
      return item.refId
        ? { pathname: "/document/[id]", params: { id: item.refId } }
        : null;
    case "task":
      if (item.documentId) {
        return { pathname: "/document/[id]", params: { id: item.documentId } };
      }
      return item.refId
        ? { pathname: "/(tabs)/plan", params: { task: item.refId } }
        : null;
    case "event":
      return item.refId
        ? { pathname: "/(tabs)/plan", params: { event: item.refId } }
        : null;
    case "email":
      return { pathname: "/posteingang" };
    case "member":
      return { pathname: "/familie" };
  }
}

/**
 * The view stores a document's raw status as its detail; the feed speaks
 * plain German instead — and a status the map does not know still never
 * leaks as a raw enum value. Event dates, sender addresses, and the
 * member line pass through untouched.
 */
const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  uploaded: "Hochgeladen",
  ocr_processing: "Wird gelesen",
  ocr_done: "Wird gelesen",
  analyzing: "Wird einsortiert",
  analyzed: "Gelesen",
  confirmed: "Abgelegt",
  failed: "Nicht lesbar",
};

export function activityDetailLabel(
  item: Pick<FamilyActivityItem, "kind" | "detail">,
): string | null {
  if (!item.detail) return null;
  if (item.kind === "document") {
    return DOCUMENT_STATUS_LABELS[item.detail] ?? "In Arbeit";
  }
  return item.detail;
}

/**
 * Short relative timestamp for the feed: "vor 5 Min.", "vor 3 Std.",
 * "Gestern", then a short date. Times in the future (clock drift) read as
 * "Gerade eben" rather than a negative duration.
 */
export function formatActivityWhen(iso: string, now = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMinutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (diffMinutes < 1) return "Gerade eben";
  if (diffMinutes < 60) return `vor ${diffMinutes} Min.`;
  if (then.toDateString() === now.toDateString()) {
    return `vor ${Math.floor(diffMinutes / 60)} Std.`;
  }
  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  );
  if (then.toDateString() === yesterday.toDateString()) return "Gestern";
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
  }).format(then);
}
