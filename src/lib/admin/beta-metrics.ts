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
