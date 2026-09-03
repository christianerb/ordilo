/**
 * Realistic German family data for the visual preview harness. Nothing here
 * is real; the names and numbers exist so screens render with the density,
 * lengths and states a family sees after a few months of use.
 */

const today = new Date();
today.setHours(12, 0, 0, 0);

function isoDate(offsetDays: number): string {
  const date = new Date(today);
  date.setDate(date.getDate() + offsetDays);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isoTimestamp(offsetDays: number, hour = 9): string {
  const date = new Date(today);
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, 15, 0, 0);
  return date.toISOString();
}

export const FAMILY_ID = "fam-mueller";
export const USER_ID = "user-christian";

export const session = {
  access_token: "preview-token",
  refresh_token: "preview-refresh",
  expires_in: 3600,
  token_type: "bearer",
  user: { id: USER_ID, email: "christian@example.de" },
};

const members = [
  { id: "m-christian", family_id: FAMILY_ID, name: "Christian", role: "Vater", birthdate: "1986-04-12", avatar_color: "#305460", linked_user_id: USER_ID, created_at: isoTimestamp(-120) },
  { id: "m-karina", family_id: FAMILY_ID, name: "Karina", role: "Mutter", birthdate: "1988-09-30", avatar_color: "#8E44AD", linked_user_id: null, created_at: isoTimestamp(-120, 10) },
  { id: "m-emma", family_id: FAMILY_ID, name: "Emma", role: "Tochter", birthdate: "2017-03-12", avatar_color: "#27AE60", linked_user_id: null, created_at: isoTimestamp(-120, 11) },
  { id: "m-leon", family_id: FAMILY_ID, name: "Leon", role: "Sohn", birthdate: "2020-11-02", avatar_color: "#E46018", linked_user_id: null, created_at: isoTimestamp(-120, 12) },
];

const documents = [
  {
    id: "doc-sportfest",
    family_id: FAMILY_ID,
    uploaded_by: USER_ID,
    title: "Elternbrief Sportfest Grundschule Am Lindenhof",
    document_type: "school",
    category: "Schule",
    status: "analyzed",
    source: "scan",
    original_filename: "Scan-2026-09-01.pdf",
    mime_type: "application/pdf",
    page_count: 2,
    summary: "Das Sportfest ist am Dienstag um 8:15 Uhr auf dem Sportplatz. Emma braucht Sportkleidung, ein Frühstück und die unterschriebene Rückmeldung bis Freitag.",
    ocr_text: "Liebe Eltern, am Dienstag findet unser Sportfest statt …",
    tags: ["Schule", "Sportfest", "Emma"],
    created_at: isoTimestamp(-1, 18),
    confirmed_at: null,
  },
  {
    id: "doc-strom",
    family_id: FAMILY_ID,
    uploaded_by: USER_ID,
    title: "Stromrechnung Stadtwerke Juli 2026",
    document_type: "invoice",
    category: "Rechnungen",
    status: "confirmed",
    source: "scan",
    original_filename: "stadtwerke-juli.pdf",
    mime_type: "application/pdf",
    page_count: 3,
    summary: "84,20 € werden am 12. September vom Konto abgebucht. Der Verbrauch lag 6 % über dem Vorjahr.",
    ocr_text: "Stadtwerke Musterstadt, Rechnung Nr. 4711-2026 …",
    tags: ["Strom", "Rechnung"],
    created_at: isoTimestamp(-3, 20),
    confirmed_at: isoTimestamp(-3, 20),
  },
  {
    id: "doc-u9",
    family_id: FAMILY_ID,
    uploaded_by: USER_ID,
    title: "Einladung U9-Untersuchung Leon",
    document_type: "medical",
    category: "Gesundheit",
    status: "confirmed",
    source: "scan",
    original_filename: "u9.jpg",
    mime_type: "image/jpeg",
    page_count: 1,
    summary: "Die Kinderarztpraxis Dr. Weber lädt Leon zur U9 ein. Bitte Impfpass und das gelbe Heft mitbringen.",
    ocr_text: "Kinderarztpraxis Dr. Weber …",
    tags: ["Leon", "Kinderarzt"],
    created_at: isoTimestamp(-6, 9),
    confirmed_at: isoTimestamp(-6, 9),
  },
  {
    id: "doc-kfz",
    family_id: FAMILY_ID,
    uploaded_by: USER_ID,
    title: "Kfz-Versicherung Beitragsanpassung 2027",
    document_type: "insurance",
    category: "Versicherungen",
    status: "confirmed",
    source: "upload",
    original_filename: "kfz-2027.pdf",
    mime_type: "application/pdf",
    page_count: 4,
    summary: "Der Jahresbeitrag steigt ab Januar auf 612,40 €. Kündigung ist bis 30. November möglich.",
    ocr_text: "HUK …",
    tags: ["Auto", "Versicherung"],
    created_at: isoTimestamp(-12, 14),
    confirmed_at: isoTimestamp(-12, 14),
  },
  {
    id: "doc-kita",
    family_id: FAMILY_ID,
    uploaded_by: USER_ID,
    title: "Kita-Beitragsbescheid Stadt Musterstadt",
    document_type: "letter",
    category: "Kita",
    status: "confirmed",
    source: "scan",
    original_filename: "kita-bescheid.pdf",
    mime_type: "application/pdf",
    page_count: 2,
    summary: "Der monatliche Beitrag für Leon beträgt ab Oktober 186 €. Die Einkommensnachweise fehlen noch.",
    ocr_text: "…",
    tags: ["Kita", "Leon"],
    created_at: isoTimestamp(-25, 16),
    confirmed_at: isoTimestamp(-25, 16),
  },
  {
    id: "doc-miet",
    family_id: FAMILY_ID,
    uploaded_by: USER_ID,
    title: "Mietvertrag Lindenstraße 14",
    document_type: "contract",
    category: "Wohnen",
    status: "confirmed",
    source: "upload",
    original_filename: "mietvertrag.pdf",
    mime_type: "application/pdf",
    page_count: 12,
    summary: "Unbefristeter Mietvertrag ab 1. August 2022, Kaltmiete 1.240 €, Kaution 3.720 €.",
    ocr_text: "…",
    tags: ["Wohnung"],
    created_at: isoTimestamp(-48, 11),
    confirmed_at: isoTimestamp(-48, 11),
  },
  {
    id: "doc-steuer",
    family_id: FAMILY_ID,
    uploaded_by: USER_ID,
    title: "Einkommensteuerbescheid 2025",
    document_type: "tax",
    category: "Steuer",
    status: "confirmed",
    source: "upload",
    original_filename: "steuer-2025.pdf",
    mime_type: "application/pdf",
    page_count: 6,
    summary: "Erstattung von 1.412,00 € wurde am 14. Juli überwiesen.",
    ocr_text: "…",
    tags: ["Steuer"],
    created_at: isoTimestamp(-50, 11),
    confirmed_at: isoTimestamp(-50, 11),
  },
  {
    id: "doc-processing",
    family_id: FAMILY_ID,
    uploaded_by: USER_ID,
    title: null,
    document_type: null,
    category: null,
    status: "ocr_processing",
    source: "scan",
    original_filename: "Scan-2026-09-02.pdf",
    mime_type: "application/pdf",
    page_count: 1,
    summary: null,
    ocr_text: null,
    tags: [],
    created_at: isoTimestamp(0, 8),
    confirmed_at: null,
  },
];

const tasks = [
  { id: "task-kita", family_id: FAMILY_ID, document_id: "doc-kita", title: "Einkommensnachweise an die Kita schicken", description: "Gehaltsabrechnungen Juni bis August", due_date: isoDate(-2), status: "open", confidence: 1, confirmed: true, created_at: isoTimestamp(-25), tags: [], assigned_to: "m-christian", completed_at: null },
  { id: "task-sportfest", family_id: FAMILY_ID, document_id: "doc-sportfest", title: "Rückmeldung Sportfest unterschreiben und abgeben", description: null, due_date: isoDate(0), status: "open", confidence: 0.9, confirmed: true, created_at: isoTimestamp(-1), tags: [], assigned_to: "m-karina", completed_at: null },
  { id: "task-strom", family_id: FAMILY_ID, document_id: "doc-strom", title: "Abbuchung Stromrechnung prüfen", description: "84,20 € am 12. September", due_date: isoDate(1), status: "open", confidence: 1, confirmed: true, created_at: isoTimestamp(-3), tags: [], assigned_to: "m-christian", completed_at: null },
  { id: "task-impfpass", family_id: FAMILY_ID, document_id: "doc-u9", title: "Impfpass und gelbes Heft für die U9 heraussuchen", description: null, due_date: isoDate(3), status: "open", confidence: 1, confirmed: true, created_at: isoTimestamp(-6), tags: [], assigned_to: "m-karina", completed_at: null },
  { id: "task-kfz", family_id: FAMILY_ID, document_id: "doc-kfz", title: "Kfz-Versicherung vergleichen", description: "Kündigung bis 30. November möglich", due_date: isoDate(40), status: "open", confidence: 1, confirmed: true, created_at: isoTimestamp(-12), tags: [], assigned_to: null, completed_at: null },
  { id: "task-brotdose", family_id: FAMILY_ID, document_id: null, title: "Neue Brotdose für Leon besorgen", description: null, due_date: null, status: "open", confidence: 1, confirmed: true, created_at: isoTimestamp(-4), tags: [], assigned_to: "m-christian", completed_at: null },
  { id: "task-done-1", family_id: FAMILY_ID, document_id: null, title: "Schulranzen packen", description: null, due_date: isoDate(-1), status: "done", confidence: 1, confirmed: true, created_at: isoTimestamp(-2), tags: [], assigned_to: "m-karina", completed_at: isoTimestamp(-1, 19) },
];

const calendar_events = [
  { id: "ev-elternabend", family_id: FAMILY_ID, title: "Elternabend Klasse 3b", note: null, starts_on: isoDate(0), ends_on: isoDate(0), all_day: false, starts_time: "19:00:00", ends_time: "20:30:00", recurrence: "none", recurrence_until: null, recurrence_exceptions: [], location: "Grundschule Am Lindenhof, Raum 12", responsible_member_id: "m-christian" },
  { id: "ev-sportfest", family_id: FAMILY_ID, title: "Sportfest Grundschule", note: null, starts_on: isoDate(1), ends_on: isoDate(1), all_day: false, starts_time: "08:15:00", ends_time: "12:00:00", recurrence: "none", recurrence_until: null, recurrence_exceptions: [], location: "Sportplatz Lindenhof", responsible_member_id: null },
  { id: "ev-zahnarzt", family_id: FAMILY_ID, title: "Zahnarzt Kontrolle", note: null, starts_on: isoDate(3), ends_on: isoDate(3), all_day: false, starts_time: "14:30:00", ends_time: "15:00:00", recurrence: "none", recurrence_until: null, recurrence_exceptions: [], location: "Praxis Dr. Sommer", responsible_member_id: "m-karina" },
  { id: "ev-u9", family_id: FAMILY_ID, title: "U9-Untersuchung Leon", note: null, starts_on: isoDate(5), ends_on: isoDate(5), all_day: false, starts_time: "10:00:00", ends_time: "10:45:00", recurrence: "none", recurrence_until: null, recurrence_exceptions: [], location: "Kinderarztpraxis Dr. Weber", responsible_member_id: "m-christian" },
  { id: "ev-schwimmen", family_id: FAMILY_ID, title: "Schwimmkurs", note: null, starts_on: isoDate(-20), ends_on: isoDate(-20), all_day: false, starts_time: "16:00:00", ends_time: "16:45:00", recurrence: "weekly", recurrence_until: null, recurrence_exceptions: [], location: "Hallenbad Nord", responsible_member_id: null },
];

const calendar_event_attendees = [
  { event_id: "ev-sportfest", family_member_id: "m-emma" },
  { event_id: "ev-zahnarzt", family_member_id: "m-emma" },
  { event_id: "ev-zahnarzt", family_member_id: "m-leon" },
  { event_id: "ev-u9", family_member_id: "m-leon" },
  { event_id: "ev-schwimmen", family_member_id: "m-emma" },
];

const extracted_entities = [
  { id: "e1", document_id: "doc-sportfest", family_id: FAMILY_ID, entity_type: "person", entity_value: "Emma", normalized_value: null, confidence: 0.96, confirmed: false, linked_object_id: "m-emma", label: null },
  { id: "e2", document_id: "doc-sportfest", family_id: FAMILY_ID, entity_type: "organization", entity_value: "Grundschule Am Lindenhof", normalized_value: "school", confidence: 0.9, confirmed: false, linked_object_id: null, label: null },
  { id: "e3", document_id: "doc-sportfest", family_id: FAMILY_ID, entity_type: "date", entity_value: isoDate(1), normalized_value: null, confidence: 0.95, confirmed: false, linked_object_id: null, label: "Sportfest, 8:15 Uhr" },
  { id: "e4", document_id: "doc-sportfest", family_id: FAMILY_ID, entity_type: "date", entity_value: isoDate(3), normalized_value: null, confidence: 0.62, confirmed: false, linked_object_id: null, label: "Rückgabe der Rückmeldung" },
  { id: "e5", document_id: "doc-sportfest", family_id: FAMILY_ID, entity_type: "amount", entity_value: "3,50 EUR", normalized_value: "3.50", confidence: 0.8, confirmed: false, linked_object_id: null, label: "Unkostenbeitrag Getränke", currency: "EUR", amount_kind: "total", value_date: null },
  { id: "e6", document_id: "doc-sportfest", family_id: FAMILY_ID, entity_type: "category", entity_value: "Schule", normalized_value: null, confidence: 0.9, confirmed: false, linked_object_id: null, label: null },
  { id: "e7", document_id: "doc-strom", family_id: FAMILY_ID, entity_type: "person", entity_value: "Christian Müller", normalized_value: null, confidence: 0.9, confirmed: true, linked_object_id: "m-christian", label: null },
  { id: "e8", document_id: "doc-strom", family_id: FAMILY_ID, entity_type: "amount", entity_value: "84,20 EUR", normalized_value: "84.20", confidence: 0.98, confirmed: true, linked_object_id: null, label: "Abschlag", currency: "EUR", amount_kind: "total", value_date: isoDate(10) },
  { id: "e9", document_id: "doc-strom", family_id: FAMILY_ID, entity_type: "date", entity_value: isoDate(10), normalized_value: null, confidence: 0.98, confirmed: true, linked_object_id: null, label: "Abbuchung" },
  { id: "e10", document_id: "doc-u9", family_id: FAMILY_ID, entity_type: "person", entity_value: "Leon", normalized_value: null, confidence: 0.97, confirmed: true, linked_object_id: "m-leon", label: null },
  { id: "e11", document_id: "doc-u9", family_id: FAMILY_ID, entity_type: "date", entity_value: isoDate(5), normalized_value: null, confidence: 0.9, confirmed: true, linked_object_id: null, label: "U9-Untersuchung" },
  { id: "e12", document_id: "doc-kita", family_id: FAMILY_ID, entity_type: "person", entity_value: "Leon", normalized_value: null, confidence: 0.9, confirmed: true, linked_object_id: "m-leon", label: null },
  { id: "e13", document_id: "doc-kfz", family_id: FAMILY_ID, entity_type: "person", entity_value: "Christian Müller", normalized_value: null, confidence: 0.9, confirmed: true, linked_object_id: "m-christian", label: null },
  { id: "e14", document_id: "doc-miet", family_id: FAMILY_ID, entity_type: "person", entity_value: "Christian Müller", normalized_value: null, confidence: 0.9, confirmed: true, linked_object_id: "m-christian", label: null },
  { id: "e15", document_id: "doc-miet", family_id: FAMILY_ID, entity_type: "person", entity_value: "Karina Müller", normalized_value: null, confidence: 0.9, confirmed: true, linked_object_id: "m-karina", label: null },
];

const document_facts = [
  { id: "f1", document_id: "doc-strom", family_id: FAMILY_ID, fact_type: "customer_number", label: "Kundennummer", value: "4711 0815 22", confidence: 0.97 },
  { id: "f2", document_id: "doc-kfz", family_id: FAMILY_ID, fact_type: "policy_number", label: "Versicherungsnummer", value: "KFZ-88 341 902", confidence: 0.95 },
];

const chat_conversations = [
  { id: "conv-1", family_id: FAMILY_ID, title: "Zahnarzttermin der Kinder", created_at: isoTimestamp(-1, 7), updated_at: isoTimestamp(-1, 7) },
  { id: "conv-2", family_id: FAMILY_ID, title: "Stromrechnung Juli", created_at: isoTimestamp(-4, 21), updated_at: isoTimestamp(-4, 21) },
  { id: "conv-3", family_id: FAMILY_ID, title: "Kündigungsfrist Kfz-Versicherung", created_at: isoTimestamp(-11, 12), updated_at: isoTimestamp(-11, 12) },
];

const chat_messages = [
  { id: "msg-1", conversation_id: "conv-1", family_id: FAMILY_ID, role: "user", content: "Wann ist der nächste Zahnarzttermin der Kinder?", sources: null, card: null, actions: null, feedback: null, created_at: isoTimestamp(-1, 7) },
  { id: "msg-2", conversation_id: "conv-1", family_id: FAMILY_ID, role: "assistant", content: `Der nächste Zahnarzttermin ist am ${isoDate(3)} um 14:30 Uhr bei Praxis Dr. Sommer. Emma und Leon gehen zusammen hin, Karina kümmert sich.`, sources: [{ document_id: "doc-u9", title: "Einladung U9-Untersuchung Leon", excerpt: "Bitte Impfpass und das gelbe Heft mitbringen.", score: 0.71 }], card: { type: "termin", title: "Zahnarzt Kontrolle", subtitle: "Praxis Dr. Sommer", fields: [{ label: "Wann", value: `${isoDate(3)}, 14:30 Uhr` }, { label: "Für", value: "Emma & Leon" }], actionDocumentId: null, hasSecret: false }, actions: null, feedback: "positive", created_at: isoTimestamp(-1, 7) },
];

const families = [
  { id: FAMILY_ID, name: "Müller", created_by: USER_ID, onboarding_completed_at: isoTimestamp(-120), created_at: isoTimestamp(-120) },
];

const contacts = [
  { id: "c-weber", family_id: FAMILY_ID, source_document_id: "doc-u9", name: "Dr. Anja Weber", organization: "Kinderarztpraxis Dr. Weber", role: "Kinderärztin", phone: "+49 30 1234567", email: "praxis@dr-weber.de", status: "confirmed", created_at: isoTimestamp(-6), updated_at: isoTimestamp(-6) },
  { id: "c-schule", family_id: FAMILY_ID, source_document_id: "doc-sportfest", name: "Sekretariat Grundschule Am Lindenhof", organization: "Grundschule Am Lindenhof", role: "Sekretariat", phone: "+49 30 7654321", email: "sekretariat@lindenhof.de", status: "suggested", created_at: isoTimestamp(-1), updated_at: isoTimestamp(-1) },
  { id: "c-hausmeister", family_id: FAMILY_ID, source_document_id: null, name: "Herr Brandt", organization: "Hausverwaltung Lindenstraße", role: "Hausmeister", phone: "+49 170 9988776", email: null, status: "confirmed", created_at: isoTimestamp(-40), updated_at: isoTimestamp(-40) },
];

export const tables: Record<string, Record<string, unknown>[]> = {
  families,
  family_members: members,
  family_memberships: [{ id: "mem-1", family_id: FAMILY_ID, user_id: USER_ID, role: "owner", intro_seen_at: null, created_at: isoTimestamp(-120), families: families[0] }],
  documents,
  tasks,
  calendar_events,
  calendar_event_attendees,
  extracted_entities,
  document_facts,
  chat_conversations,
  chat_messages,
  contacts,
  collections: [],
  inbound_suggestions: [],
  inbound_emails: [],
  family_invites: [],
};
