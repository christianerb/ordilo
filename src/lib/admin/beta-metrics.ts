export type BetaEvent = { user_id: string; event_name: string; occurred_at: string; properties?: unknown };
const ACTIONS = new Set(["document_upload_succeeded", "document_result_viewed", "document_confirmed", "document_next_step_selected", "chat_question_sent", "search_completed", "task_created", "task_completed", "calendar_event_created"]);

/** Counts people, not events. Funnel completion must follow cohort entry. */
export function summarizeBetaEvents(events: BetaEvent[], since: string) {
  const entrants = new Map<string, string>();
  for (const event of events) {
    if (event.event_name === "onboarding_started" && event.occurred_at >= since) {
      const previous = entrants.get(event.user_id);
      if (!previous || event.occurred_at < previous) entrants.set(event.user_id, event.occurred_at);
    }
  }
  const completed = new Set<string>();
  const firstUpload = new Set<string>();
  const activeByDay = new Map<string, Set<string>>();
  const activeUsers = new Set<string>();
  const latest = new Map<string, { step: string; at: string }>();
  let searches = 0;
  let questions = 0;
  for (const event of events) {
    if (event.occurred_at < since) continue;
    const entry = entrants.get(event.user_id);
    if (entry && event.occurred_at >= entry) {
      if (event.event_name === "onboarding_completed") completed.add(event.user_id);
      if (event.event_name === "document_upload_succeeded") firstUpload.add(event.user_id);
      let step: string | null = null;
      const labels: Record<string, string> = { onboarding_started: "Einstieg", onboarding_completed: "Onboarding fertig", document_upload_succeeded: "Dokument hochgeladen", document_confirmed: "Dokument bestätigt" };
      step = labels[event.event_name] ?? null;
      if (event.event_name === "onboarding_step_completed" && event.properties && typeof event.properties === "object" && "step" in event.properties) {
        const names: Record<string, string> = { family_name: "Familie angelegt", self_member_added: "Eigenes Profil angelegt", member_added: "Weiteres Mitglied angelegt" };
        if (typeof event.properties.step === "string") step = names[event.properties.step] ?? null;
      }
      if (step && (!latest.has(event.user_id) || latest.get(event.user_id)!.at < event.occurred_at)) latest.set(event.user_id, { step, at: event.occurred_at });
    }
    if (ACTIONS.has(event.event_name)) {
      const day = event.occurred_at.slice(0, 10);
      const people = activeByDay.get(day) ?? new Set<string>();
      people.add(event.user_id);
      activeByDay.set(day, people);
      activeUsers.add(event.user_id);
    }
    if (event.event_name === "search_completed") searches++;
    if (event.event_name === "chat_question_sent") questions++;
  }
  return {
    started: entrants.size, completed: completed.size, firstUpload: firstUpload.size,
    completionRate: entrants.size ? completed.size / entrants.size : null,
    activeUsers: activeUsers.size, searches, questions,
    lastSteps: [...latest].map(([userId, value]) => ({ userId, ...value })),
    daily: [...activeByDay].sort(([a], [b]) => a.localeCompare(b)).map(([day, users]) => ({ day, users: users.size })),
  };
}

export type ScanFailureSummary = {
  /** Failed scan attempts the app reported in the window. */
  total: number;
  /** Successful uploads in the same window — the rate's other half. */
  uploadsSucceeded: number;
  stages: { stage: string; count: number }[];
  reasons: { reason: string; count: number }[];
};

/**
 * The scan-quality signal the documents table cannot carry: a failed
 * upload leaves no row, so the app reports failures itself. Counts are
 * attempts (a retry counts again) — that is what a failure rate needs.
 * Properties carry coarse codes only (stage, reason, source), never
 * content.
 *
 * Both sides of the rate are scoped to the mobile scan client. The
 * success event comes from the shared upload route, which also serves
 * the web uploader, so a success without `source: "mobile_scan"` must
 * not inflate the rate. Failure events predate the source property and
 * only ever came from the mobile scan client, so a missing source still
 * counts there.
 */
export function summarizeScanFailures(events: BetaEvent[]): ScanFailureSummary {
  const stages = new Map<string, number>();
  const reasons = new Map<string, number>();
  let total = 0;
  let uploadsSucceeded = 0;
  for (const event of events) {
    const properties =
      typeof event.properties === "object" && event.properties !== null
        ? (event.properties as Record<string, unknown>)
        : {};
    const source = typeof properties.source === "string" ? properties.source : null;
    if (event.event_name === "document_upload_succeeded") {
      if (source === "mobile_scan") uploadsSucceeded++;
      continue;
    }
    if (event.event_name !== "document_upload_failed") continue;
    if (source !== null && source !== "mobile_scan") continue;
    total++;
    const stage = typeof properties.stage === "string" ? properties.stage : "unbekannt";
    stages.set(stage, (stages.get(stage) ?? 0) + 1);
    const reason = typeof properties.reason === "string" ? properties.reason : "unbekannt";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  const byCount = (a: { count: number }, b: { count: number }) => b.count - a.count;
  return {
    total,
    uploadsSucceeded,
    stages: [...stages].map(([stage, count]) => ({ stage, count })).sort(byCount),
    reasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort(byCount),
  };
}
