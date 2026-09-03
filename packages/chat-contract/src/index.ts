export const CHAT_ACTION_TOOL_NAMES = [
  "add_calendar_event",
  "add_task",
  "add_contact",
  "update_task",
  "mark_task_done",
  "add_family_member",
  "create_collection",
  "create_note",
  "update_note",
  "move_document_to_collection",
  "add_document_tags",
  "save_document_fact",
] as const;

export type ChatActionToolName = (typeof CHAT_ACTION_TOOL_NAMES)[number];

export const CHAT_TOOL_STEP_LABELS: Record<string, string> = {
  search_documents: "Durchsucht deine Dokumente",
  list_documents: "Sieht die Dokumentenliste durch",
  list_tasks: "Prüft Aufgaben und Fristen",
  add_task: "Legt die Aufgabe an",
  add_contact: "Bereitet den Kontakt vor",
  update_task: "Aktualisiert die Aufgabe",
  create_collection: "Legt die Sammlung an",
  create_note: "Speichert die Notiz",
  update_note: "Bereitet die Notizänderung vor",
  list_family_members: "Schaut, wer zur Familie gehört",
  graph_query: "Verfolgt Zusammenhänge",
  mark_task_done: "Erledigt die Aufgabe",
  save_document_fact: "Speichert die Nummer",
  move_document_to_collection: "Sortiert das Dokument ein",
  add_document_tags: "Ergänzt Schlagworte",
  add_family_member: "Legt das Familienmitglied an",
};

export type ChatActionContent = {
  eyebrow: string;
  title: string;
  details: Array<{ label: string; value: string }>;
};

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Formats the ISO date shape used by chat actions as DD.MM.YYYY. */
export function formatChatActionDate(
  iso: string | null | undefined,
): string | null {
  if (!iso) return null;
  const dateOnly = iso.split(/[T ]/)[0];
  const parts = dateOnly.split("-");
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (
    !/^\d{4}$/.test(year) ||
    !/^\d{2}$/.test(month) ||
    !/^\d{2}$/.test(day)
  ) {
    return null;
  }
  return `${day}.${month}.${year}`;
}

/** Platform-neutral copy and details for every confirmed chat action card. */
export function getChatActionContent(action: {
  toolName: ChatActionToolName;
  args: Record<string, unknown>;
}): ChatActionContent {
  const args = action.args;

  switch (action.toolName) {
    case "add_task": {
      const dueDate = asText(args.due_date);
      const assignee = asText(args.assignee_name);
      return {
        eyebrow: "Aufgabe vorbereiten",
        title: asText(args.title) ?? "Neue Aufgabe",
        details: [
          ...(dueDate
            ? [
                {
                  label: "Frist",
                  value: formatChatActionDate(dueDate) || dueDate,
                },
              ]
            : []),
          ...(assignee ? [{ label: "Für", value: assignee }] : []),
        ],
      };
    }
    case "add_contact": {
      const organization = asText(args.organization);
      const role = asText(args.role);
      const phone = asText(args.phone);
      const email = asText(args.email);
      return {
        eyebrow: "Kontakt vorbereiten",
        title:
          asText(args.name) ?? asText(args.contact_name) ?? "Neuer Kontakt",
        details: [
          ...(organization
            ? [{ label: "Organisation", value: organization }]
            : []),
          ...(role ? [{ label: "Rolle", value: role }] : []),
          ...(phone ? [{ label: "Telefon", value: phone }] : []),
          ...(email ? [{ label: "E-Mail", value: email }] : []),
        ],
      };
    }
    case "add_calendar_event": {
      const start = asText(args.starts_on);
      const end = asText(args.ends_on);
      const time = asText(args.starts_time);
      const date =
        start && end && end !== start
          ? `${formatChatActionDate(start) || start} bis ${formatChatActionDate(end) || end}`
          : start
            ? formatChatActionDate(start) || start
            : null;
      return {
        eyebrow: "Termin vorbereiten",
        title: asText(args.title) ?? "Neuer Termin",
        details: [
          ...(date ? [{ label: "Wann", value: date }] : []),
          ...(time ? [{ label: "Uhrzeit", value: time }] : []),
        ],
      };
    }
    case "mark_task_done":
      return {
        eyebrow: "Aufgabe abschließen",
        title: asText(args.task_title) ?? "Aufgabe erledigen",
        details: [],
      };
    case "add_family_member":
      return {
        eyebrow: "Familie ergänzen",
        title: `${asText(args.name) ?? asText(args.member_name) ?? "Neue Person"} hinzufügen`,
        details: [],
      };
    case "create_collection":
      return {
        eyebrow: "Sammlung anlegen",
        title:
          asText(args.name) ??
          asText(args.collection_name) ??
          "Neue Sammlung",
        details: [],
      };
    case "create_note": {
      const isCredentials = asText(args.document_type) === "credentials";
      const note = asText(args.content);
      const details: Array<{ label: string; value: string }> = [];
      if (isCredentials) {
        const url = asText(args.url);
        const username = asText(args.username);
        if (url) details.push({ label: "URL", value: url });
        if (username) details.push({ label: "Benutzername", value: username });
      }
      if (note) {
        details.push({
          label: isCredentials ? "Beschreibung" : "Notiz",
          value: note,
        });
      }
      return {
        eyebrow: isCredentials ? "Zugangsdaten anlegen" : "Notiz anlegen",
        title:
          asText(args.title) ??
          (isCredentials ? "Neue Zugangsdaten" : "Neue Notiz"),
        details,
      };
    }
    case "update_note": {
      const addition = asText(args.append_content);
      return {
        eyebrow: "Notiz ändern",
        title:
          asText(args.note_title) ??
          asText(args.document_title) ??
          "Notiz ergänzen",
        details: addition
          ? [{ label: "Ergänzung", value: addition }]
          : [],
      };
    }
    case "move_document_to_collection": {
      const collectionName = asText(args.collection_name);
      return {
        eyebrow: "Dokument einsortieren",
        title: asText(args.document_title) ?? "Dokument verschieben",
        details: collectionName
          ? [{ label: "Sammlung", value: collectionName }]
          : [],
      };
    }
    case "add_document_tags": {
      const tags = Array.isArray(args.tags)
        ? args.tags.filter((tag): tag is string => typeof tag === "string")
        : [];
      return {
        eyebrow: "Schlagworte ergänzen",
        title: asText(args.document_title) ?? "Dokument ergänzen",
        details: tags.length
          ? [{ label: "Schlagworte", value: tags.join(", ") }]
          : [],
      };
    }
    case "save_document_fact": {
      const value = asText(args.value);
      return {
        eyebrow: "Angabe merken",
        title: asText(args.document_title) ?? "Angabe speichern",
        details: value
          ? [
              {
                label: asText(args.label) ?? "Angabe",
                value,
              },
            ]
          : [],
      };
    }
    case "update_task":
      return {
        eyebrow: "Aufgabe ändern",
        title: asText(args.task_title) ?? "Aufgabe anpassen",
        details: [],
      };
  }
}
