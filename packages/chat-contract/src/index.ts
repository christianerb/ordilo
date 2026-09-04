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
  search_web: "Prüft aktuelle Informationen",
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

/**
 * Additive source shape shared by Web and iOS.
 *
 * Older persisted rows contain only document_id/title/excerpt/score/origin.
 * Web sources use a stable synthetic document_id for backwards compatibility
 * and carry a Web origin plus URL so clients can open them externally.
 */
export interface ChatSource {
  document_id: string;
  title: string | null;
  excerpt: string;
  score: number;
  origin?: "semantic" | "graph" | "web";
  url?: string;
}

export function isChatSource(value: unknown): value is ChatSource {
  if (!isRecord(value)) return false;
  return (
    typeof value.document_id === "string" &&
    (typeof value.title === "string" || value.title === null) &&
    typeof value.excerpt === "string" &&
    typeof value.score === "number" &&
    Number.isFinite(value.score) &&
    (value.origin === undefined ||
      value.origin === "semantic" ||
      value.origin === "graph" ||
      value.origin === "web") &&
    (value.url === undefined || typeof value.url === "string")
  );
}

export function isSafePublicSourceUrl(value: string | undefined): value is string {
  if (!value || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;

    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host === "::" ||
      host === "::1" ||
      host.startsWith("fe80:") ||
      (host.includes(":") &&
        (host.startsWith("fc") || host.startsWith("fd")))
    ) {
      return false;
    }

    const ipv4 = host.split(".").map(Number);
    if (
      ipv4.length === 4 &&
      ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ) {
      const [first, second] = ipv4;
      if (
        first === 0 ||
        first === 10 ||
        first === 127 ||
        first >= 224 ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168)
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

export const CHAT_RESPONSE_STATES = [
  "answered",
  "partial",
  "conflict",
  "not_found",
] as const;
export const FORBIDDEN_HEDGING_PHRASES = [
  "Ich glaube",
  "Vermutlich",
  "Wahrscheinlich",
  "Könnte sein",
] as const;
export type ChatResponseState = (typeof CHAT_RESPONSE_STATES)[number];

export function isChatResponseState(value: unknown): value is ChatResponseState {
  return (
    typeof value === "string" &&
    (CHAT_RESPONSE_STATES as readonly string[]).includes(value)
  );
}

export const CHAT_RESPONSE_STATE_LABELS: Record<ChatResponseState, string> = {
  answered: "Beantwortet",
  partial: "Teilweise beantwortet",
  conflict: "Angaben widersprechen sich",
  not_found: "Nicht gefunden",
};

export function isWebChatSource(source: ChatSource): boolean {
  return source.origin === "web";
}

export function splitChatSources(sources: ChatSource[]): {
  best: ChatSource | null;
  rest: ChatSource[];
} {
  const sorted = [...sources].sort((a, b) => b.score - a.score);
  return { best: sorted[0] ?? null, rest: sorted.slice(1) };
}

export const MAX_CLIENT_CHAT_HISTORY_MESSAGES = 30;
export const MAX_CLIENT_CHAT_HISTORY_CONTENT = 10_000;
export const MAX_CHAT_CONVERSATIONS = 30;

/** One safe follow-up the user can deliberately send as a new chat turn. */
export interface ChatSuggestion {
  label: string;
  prompt: string;
}

export function isChatSuggestion(value: unknown): value is ChatSuggestion {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    typeof value.prompt === "string"
  );
}

export const CHAT_FEEDBACK_REASONS = [
  "falsche_antwort",
  "falsches_dokument",
  "unvollstaendig",
] as const;
export type ChatFeedbackReason = (typeof CHAT_FEEDBACK_REASONS)[number];
export const CHAT_FEEDBACK_REASON_OPTIONS: ReadonlyArray<{
  value: ChatFeedbackReason;
  label: string;
}> = [
  { value: CHAT_FEEDBACK_REASONS[0], label: "Falsche Antwort" },
  { value: CHAT_FEEDBACK_REASONS[1], label: "Falsches Dokument" },
  { value: CHAT_FEEDBACK_REASONS[2], label: "Unvollständig" },
];

export type ChatToolCallState = "start" | "done" | "error";

export type ChatWireEvent =
  | { type: "conversation"; conversationId: string }
  | { type: "tool"; toolName: string; state: ChatToolCallState }
  | { type: "text"; content: string }
  | { type: "replace"; content: string }
  | { type: "card"; card: Record<string, unknown> }
  | { type: "sources"; sources: ChatSource[] }
  | { type: "suggestion"; suggestion: ChatSuggestion }
  | { type: "response_state"; state: ChatResponseState }
  | {
      type: "confirmation";
      action: {
        id: string;
        toolName: ChatActionToolName;
        args: Record<string, unknown>;
      };
    }
  | { type: "message_saved"; messageId: string }
  | { type: "done" }
  | { type: "error"; error: string; code: string | null };

export function splitChatNdjsonChunk(
  buffered: string,
  chunk: string,
): { lines: string[]; rest: string } {
  const parts = (buffered + chunk).split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts.filter((line) => line.trim().length > 0), rest };
}

const CONFIRMATION_EVENT_META_KEYS = new Set([
  "type",
  "tool_name",
  "action_args",
  "action_id",
  "needs_confirmation",
  "message",
]);

export function mergeConfirmationProposal(
  event: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    event.action_args &&
    typeof event.action_args === "object" &&
    !Array.isArray(event.action_args)
      ? (event.action_args as Record<string, unknown>)
      : {};
  const preview = Object.fromEntries(
    Object.entries(event).filter(
      ([key]) => !CONFIRMATION_EVENT_META_KEYS.has(key),
    ),
  );
  return { ...base, ...preview };
}

export function isChatActionToolName(
  value: unknown,
): value is ChatActionToolName {
  return (
    typeof value === "string" &&
    (CHAT_ACTION_TOOL_NAMES as readonly string[]).includes(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const CHAT_ANSWER_CARD_TYPES = new Set([
  "termin",
  "aufgabe",
  "dokument",
  "zugangsdaten",
  "kontakt",
  "allgemein",
]);

function isChatAnswerCard(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return (
    typeof value.type === "string" &&
    CHAT_ANSWER_CARD_TYPES.has(value.type) &&
    typeof value.title === "string" &&
    (typeof value.subtitle === "string" || value.subtitle === null) &&
    Array.isArray(value.fields) &&
    value.fields.every(
      (field) =>
        isRecord(field) &&
        typeof field.label === "string" &&
        typeof field.value === "string",
    ) &&
    (typeof value.actionDocumentId === "string" ||
      value.actionDocumentId === null) &&
    typeof value.hasSecret === "boolean"
  );
}

/**
 * Parses the shared NDJSON wire protocol once for Web, iOS, and the
 * persistence wrapper. Unknown or malformed lines return null.
 */
export function parseChatWireEvent(raw: unknown): ChatWireEvent | null {
  if (!isRecord(raw)) return null;

  switch (raw.type) {
    case "conversation":
      return typeof raw.conversation_id === "string"
        ? { type: "conversation", conversationId: raw.conversation_id }
        : null;
    case "tool":
      return typeof raw.tool === "string" &&
        (raw.state === "start" ||
          raw.state === "done" ||
          raw.state === "error")
        ? { type: "tool", toolName: raw.tool, state: raw.state }
        : null;
    case "text":
    case "replace":
      return typeof raw.content === "string"
        ? { type: raw.type, content: raw.content }
        : null;
    case "card":
      return isChatAnswerCard(raw.card)
        ? { type: "card", card: raw.card }
        : null;
    case "sources":
      return Array.isArray(raw.sources) && raw.sources.every(isChatSource)
        ? { type: "sources", sources: raw.sources }
        : null;
    case "suggestion":
      return isChatSuggestion(raw.suggestion)
        ? {
            type: "suggestion",
            suggestion: raw.suggestion,
          }
        : null;
    case "response_state":
      return isChatResponseState(raw.state)
        ? { type: "response_state", state: raw.state }
        : null;
    case "confirmation_request":
      return isChatActionToolName(raw.tool_name) &&
        typeof raw.action_id === "string" &&
        raw.action_id.length > 0
        ? {
            type: "confirmation",
            action: {
              id: raw.action_id,
              toolName: raw.tool_name,
              args: mergeConfirmationProposal(raw),
            },
          }
        : null;
    case "message_saved":
      return typeof raw.message_id === "string"
        ? { type: "message_saved", messageId: raw.message_id }
        : null;
    case "done":
      return { type: "done" };
    case "error":
      return {
        type: "error",
        error:
          typeof raw.error === "string"
            ? raw.error
            : "Da ist was schiefgegangen. Bitte frag nochmal.",
        code: typeof raw.code === "string" ? raw.code : null,
      };
    default:
      return null;
  }
}

export type ChatActionContent = {
  eyebrow: string;
  title: string;
  details: Array<{ label: string; value: string }>;
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/**
 * Exactly three useful chat starters derived from real family context.
 * The fallback deliberately spans family, general and current knowledge.
 */
export function buildPersonalChatPrompts(input: {
  members: Array<{ name: string; role?: string | null }>;
  recentDocumentTitle?: string | null;
  upcomingTaskTitle?: string | null;
}): string[] {
  const prompts: string[] = [];
  const title = input.recentDocumentTitle?.trim();
  const task = input.upcomingTaskTitle?.trim();
  const child =
    input.members.find((member) =>
      /kind|tochter|sohn/i.test(member.role ?? ""),
    ) ?? input.members.find((member) => firstName(member.name));
  const name = child ? firstName(child.name) : "";

  if (title) prompts.push(`Was muss ich bei „${title}“ beachten?`);
  if (task) prompts.push(`Was brauche ich für „${task}“?`);
  if (name) prompts.push(`Was steht für ${name} als Nächstes an?`);

  for (const fallback of [
    "Was ist diese Woche für uns wichtig?",
    "Erkläre mir den Unterschied zwischen Garantie und Gewährleistung.",
    "Welche Änderungen gibt es aktuell beim Deutschlandticket?",
  ]) {
    if (prompts.length >= 3) break;
    prompts.push(fallback);
  }

  return prompts.slice(0, 3);
}

// ---------------------------------------------------------------------------
// PII redaction for model-bound history
// ---------------------------------------------------------------------------

/**
 * IBAN: 2-letter country code + 2 check digits + 11–28 alphanumeric BBAN
 * characters, optional single spaces between them. The BBAN itself may
 * contain letters (e.g. GB, CH), so a digits-only match would mask just the
 * prefix and leak the account body into the next model turn.
 */
const IBAN_PATTERN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,28}\b/g;

/** German tax ID: 11 digits, often formatted as XX.XXX.XXX.XXX. */
const TAX_ID_PATTERN = /\b\d{2}\.?\d{3}\.?\d{3}\.?\d{3}\b/g;

/** German health/social insurance number: one letter plus 8-9 digits. */
const INSURANCE_NUMBER_PATTERN = /\b[A-Z]\d{8}\d?\b/g;

/**
 * Masks structured identifiers (IBAN, tax ID, insurance number) before a
 * persisted source excerpt is fed back into a model turn. Tool results are
 * redacted the same way, so follow-up history must not reintroduce the raw
 * values the tool boundary deliberately removed.
 */
export function redactPII(text: string): string {
  return text
    .replace(IBAN_PATTERN, "[IBAN]")
    .replace(TAX_ID_PATTERN, "[Steuer-ID]")
    .replace(INSURANCE_NUMBER_PATTERN, "[Versicherungsnummer]");
}

/** Marks the evidence section inside a client-built assistant history turn. */
const HISTORY_EVIDENCE_MARKER = "[Belege der vorherigen Antwort]";

/** Compact, source-bearing context shared by server, Web and iOS follow-ups. */
export function buildAssistantHistoryContext(input: {
  text: string;
  sources: ChatSource[];
  card?: {
    type: string;
    title: string;
    fields: Array<{ label: string; value: string }>;
  } | null;
}): string {
  const parts = [input.text.trim()].filter(Boolean);

  // Credentials are filled outside the model and must never be fed back into
  // a later model turn.
  if (input.card && input.card.type !== "zugangsdaten") {
    parts.push(
      [
        `[Vorherige Antwortskarte: ${input.card.title}]`,
        ...input.card.fields.map(
          (field) => `${field.label}: ${field.value}`,
        ),
      ].join("\n"),
    );
  }

  if (input.sources.length > 0) {
    const sourceContext = input.sources.map((source, index) => {
      const kind =
        isWebChatSource(source)
          ? "Web-Quelle"
          : "Familien-Unterlage";
      // Redact before slicing so an identifier straddling the 500-char
      // cut is still masked instead of leaking as a partial value.
      const excerpt = redactPII(source.excerpt.trim()).slice(0, 500);
      const webUrl =
        kind === "Web-Quelle" && isSafePublicSourceUrl(source.url)
          ? ` (${source.url})`
          : "";
      return `${index + 1}. ${kind}: ${source.title ?? source.document_id}${webUrl}${
        excerpt ? ` — ${excerpt}` : ""
      }`;
    });
    parts.push(`${HISTORY_EVIDENCE_MARKER}\n${sourceContext.join("\n")}`);
  }

  return parts.join("\n\n");
}

/**
 * Extracts the evidence sections (quoted source excerpts) from client-built
 * assistant history turns. Privacy guards match against these even when
 * persisted conversation rows are unavailable — the client-history fallback
 * or an unpersisted suffix the server accepted carries the same private
 * excerpts.
 */
export function extractHistoryEvidence(
  history: ReadonlyArray<{ role: string; content: string }>,
): string[] {
  const sections: string[] = [];
  for (const message of history) {
    if (message.role !== "assistant") continue;
    const markerIndex = message.content.indexOf(HISTORY_EVIDENCE_MARKER);
    if (markerIndex === -1) continue;
    sections.push(
      message.content.slice(markerIndex + HISTORY_EVIDENCE_MARKER.length),
    );
  }
  return sections;
}

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
