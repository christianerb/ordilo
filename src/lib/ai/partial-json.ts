/**
 * Best-effort parsing of a possibly-truncated JSON string, produced while
 * an LLM completion is still streaming.
 *
 * Used only to build a non-authoritative "in progress" preview during
 * document extraction — the final, complete response is always re-parsed
 * and Zod-validated in full once the stream ends (see `runExtraction`).
 * If repair fails, callers simply skip that tick's preview; nothing here
 * is ever treated as the final result.
 */
export function repairPartialJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Fast path: the buffer already happens to be valid JSON (e.g. the
  // model emitted a complete top-level object early, or the stream just
  // finished a full token boundary).
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to repair
  }

  const stack: string[] = [];
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (ch === "\\") {
        escapeNext = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      stack.push(ch);
    } else if (ch === "}" || ch === "]") {
      stack.pop();
    }
  }

  let repaired = trimmed;
  // A dangling open string gets closed so the rest of the repair can run.
  if (inString) repaired += '"';
  // Drop a trailing comma/colon with no value yet — both make the closed
  // structure invalid JSON.
  repaired = repaired.replace(/,\s*$/, "");
  repaired = repaired.replace(/:\s*$/, ":null");

  for (let i = stack.length - 1; i >= 0; i--) {
    repaired += stack[i] === "{" ? "}" : "]";
  }

  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

/**
 * The subset of `DocumentAnalysis` shown as a live preview while
 * extraction is still streaming. Deliberately smaller than the full
 * schema — only fields that read sensibly on their own, half-finished.
 */
export interface PartialAnalysisPreview {
  title?: string;
  suggested_category?: string;
  family_members?: { name: string }[];
  dates?: { date: string; label: string }[];
  tasks?: { title: string }[];
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object",
  );
}

/**
 * Pull whatever recognizable, fully-formed fields exist so far out of a
 * repaired (possibly incomplete) parse of the extraction JSON.
 *
 * The array fields intentionally require every relevant sub-field to be
 * present (e.g. a date needs both `date` and `label`) — the LAST element
 * of an in-progress array is usually half-written, and requiring the full
 * shape naturally drops it instead of showing a garbled fragment.
 */
export function extractPartialPreview(raw: unknown): PartialAnalysisPreview {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const preview: PartialAnalysisPreview = {};

  if (typeof obj.title === "string" && obj.title.trim()) {
    preview.title = obj.title.trim();
  }
  if (typeof obj.suggested_category === "string" && obj.suggested_category.trim()) {
    preview.suggested_category = obj.suggested_category.trim();
  }

  const members = asRecordArray(obj.family_members)
    .map((m) => (typeof m.name === "string" ? m.name.trim() : ""))
    .filter((name) => name.length > 0);
  if (members.length > 0) {
    preview.family_members = members.map((name) => ({ name }));
  }

  const dates = asRecordArray(obj.dates)
    .map((d) =>
      typeof d.date === "string" && typeof d.label === "string" && d.label.trim()
        ? { date: d.date, label: d.label.trim() }
        : null,
    )
    .filter((d): d is { date: string; label: string } => Boolean(d));
  if (dates.length > 0) preview.dates = dates;

  const tasks = asRecordArray(obj.tasks)
    .map((t) => (typeof t.title === "string" && t.title.trim() ? t.title.trim() : ""))
    .filter((title) => title.length > 0);
  if (tasks.length > 0) preview.tasks = tasks.map((title) => ({ title }));

  return preview;
}

/** Number of top-level preview fields present — a cheap "did this grow?" signal. */
export function previewFieldCount(preview: PartialAnalysisPreview): number {
  return Object.keys(preview).length;
}
