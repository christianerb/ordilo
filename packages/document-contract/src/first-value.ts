/** Prepared, fictional content. Never upload or persist this as family data. */
export const FIRST_VALUE_EXAMPLE = {
  title: "Ein Brief zum Klassenausflug",
  notice: "Vorbereitetes Beispiel. Es wird nichts gespeichert.",
  letter:
    "Liebe Familien, für unseren Klassenausflug treffen wir uns um 8 Uhr am Schultor. Bitte geben Sie Ihrem Kind eine Trinkflasche und eine Regenjacke mit. Wir sind um 13 Uhr zurück.",
  question: "Was muss ich mitgeben?",
  answer: "Eine Trinkflasche und eine Regenjacke.",
  quote:
    "Bitte geben Sie Ihrem Kind eine Trinkflasche und eine Regenjacke mit.",
  takeaway: "Nicht den ganzen Brief im Kopf behalten. Nur das, was wichtig ist.",
} as const;

/** Counts must describe a successful save, never the unconfirmed extraction. */
export function getDocumentNextStep(outcome: {
  eventsCreated: number;
  tasksKept: number;
}): { kind: "calendar" | "tasks" | "question"; label: string } {
  if (outcome.eventsCreated > 0) {
    return {
      kind: "calendar",
      label: "Zum Kalender",
    };
  }
  if (outcome.tasksKept > 0) {
    return {
      kind: "tasks",
      label: "Zu den Aufgaben",
    };
  }
  return { kind: "question", label: "Ordilo dazu fragen" };
}

export type FirstValueEvent =
  | { name: "onboarding_entry_selected"; entry: "scan" | "import" | "browse" }
  | { name: "document_result_viewed"; documentId: string }
  | {
      name: "document_next_step_selected";
      documentId: string;
      destination: "calendar" | "tasks" | "question";
    };

/** Explicit allow-list: no titles, questions, filenames or document contents. */
export function firstValueEventProperties(event: FirstValueEvent): Record<string, string> {
  if (event.name === "onboarding_entry_selected") {
    return { entry: event.entry };
  }
  if (event.name === "document_result_viewed") {
    return { document_id: event.documentId };
  }
  return { document_id: event.documentId, destination: event.destination };
}
