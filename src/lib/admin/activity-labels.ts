/**
 * German display labels for product events in the admin activity feed.
 * Pure module so the mapping stays testable without a database.
 */

const EVENT_LABELS: Record<string, string> = {
  onboarding_entry_selected: "Einstieg gewählt",
  onboarding_started: "Anmeldung gestartet",
  onboarding_step_completed: "Onboarding-Schritt abgeschlossen",
  onboarding_completed: "Onboarding abgeschlossen",
  onboarding_scan_started: "Erster Scan gestartet",
  document_upload_succeeded: "Dokument hochgeladen",
  document_upload_failed: "Scan fehlgeschlagen",
  document_result_viewed: "Dokument-Ergebnis angesehen",
  document_next_step_selected: "Nächsten Schritt am Dokument gewählt",
  document_confirmed: "Dokument bestätigt",
  calendar_event_created: "Termin angelegt",
  chat_question_sent: "Frage an Ordilo gesendet",
  chat_answer_repair_started: "Antwort-Korrektur gestartet",
  search_completed: "Suche abgeschlossen",
  task_created: "Aufgabe angelegt",
  task_completed: "Aufgabe erledigt",
};

const ONBOARDING_STEP_LABELS: Record<string, string> = {
  family_name: "Familie angelegt",
  self_member_added: "Eigenes Profil angelegt",
  member_added: "Weiteres Mitglied angelegt",
};

/** Mobile pipeline legs reported on `document_upload_failed`. */
const SCAN_FAILURE_STAGE_LABELS: Record<string, string> = {
  upload: "Upload",
  ocr: "Texterkennung",
  analysis: "Analyse",
};

/**
 * Returns a plain German label for a product event. Unknown event names
 * are returned as-is so new events stay visible until labeled.
 */
export function describeActivityEvent(
  eventName: string,
  properties?: Record<string, unknown> | null,
): string {
  if (eventName === "onboarding_step_completed") {
    const step = properties?.step;
    if (typeof step === "string" && ONBOARDING_STEP_LABELS[step]) {
      return ONBOARDING_STEP_LABELS[step];
    }
  }
  if (eventName === "document_upload_failed") {
    const stage = properties?.stage;
    if (typeof stage === "string" && SCAN_FAILURE_STAGE_LABELS[stage]) {
      return `${EVENT_LABELS.document_upload_failed} (${SCAN_FAILURE_STAGE_LABELS[stage]})`;
    }
  }
  return EVENT_LABELS[eventName] ?? eventName;
}
