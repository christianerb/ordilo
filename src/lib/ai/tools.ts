import type OpenAI from "openai";
import type { Database } from "@/types/database";
import {
  CHAT_ACTION_TOOL_NAMES,
  type ChatSource,
} from "@/lib/schemas/chat";
import { redactPII } from "@/lib/ai/pii-redact";
import {
  hybridSearch,
  graphSearch,
} from "@/lib/ai/search";
import {
  filterByRelevanceThreshold,
  combineSearchResults,
} from "@/lib/ai/chat";
import { matchesPersonName, stripPossessive } from "@/lib/schemas/search";
import {
  AMOUNT_KINDS,
  AMOUNT_KIND_LABELS,
  DEFAULT_FACT_LABEL,
  DOCUMENT_TYPES,
  IDENTIFIER_FACT_TYPE,
  normalizeFactValue,
  type AmountKind,
  type DocumentType,
} from "@/lib/schemas/extraction";
import { buildCredentialsContent } from "@/lib/credentials";
import { formatMinorAsGerman } from "@/lib/analysis-cleanup";
import { formatGermanDate } from "@/lib/format";
import { rerankResults } from "@/lib/ai/reranking";
import { validateCollectionInput } from "@/lib/schemas/collections";
import { validateMember } from "@/lib/schemas/onboarding";
import { formatRelations, nameMap } from "@/lib/family/relations";
import {
  loadFamilyRelations,
  saveMemberRelations,
} from "@/lib/family/relations-db";
import {
  performAnalyzeStep,
  isDestructiveAnalysisFailure,
} from "@/lib/pipeline/analyze-step";
import {
  markDocumentFailed,
  restoreConfirmedAfterAnalysisFailure,
} from "@/lib/supabase/document-helpers";
import { eventOccursOn, type EventOccurrenceSource } from "@/lib/calendar";
import { contactInputSchema } from "@/lib/contacts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ServerClient = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

/**
 * Context passed to every tool executor. Carries the RLS-scoped Supabase
 * client, the family ID, an accumulator for document sources found
 * during search_documents calls (so the API route can include them in
 * the response alongside the answer), and the name of the family member
 * currently talking to the assistant (for speaker-aware tool behavior).
 */
export interface ToolContext {
  client: ServerClient;
  familyId: string;
  sources: ChatSource[];
  /** Authenticated user responsible for writes created through chat. */
  userId?: string;
  /** Name of the family member talking to the assistant, or null if unknown. */
  speakerName: string | null;
}

/**
 * Result of executing a single tool call.
 */
export interface ToolResult {
  /** The tool name (matches the function definition name). */
  name: string;
  /** JSON-serializable result string to feed back to the LLM. */
  content: string;
}

// ---------------------------------------------------------------------------
// Tool definitions (OpenAI function-calling format)
// ---------------------------------------------------------------------------

const CHAT_COMPLETION_TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "add_calendar_event",
      description: "Schlägt einen Familienkalender-Termin vor und legt ihn erst nach eindeutiger Bestätigung an.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          starts_on: { type: "string", description: "YYYY-MM-DD" },
          ends_on: { type: "string", description: "YYYY-MM-DD" },
          all_day: { type: "boolean" },
          starts_time: { type: "string", description: "HH:MM, nur bei Uhrzeit-Terminen" },
          ends_time: { type: "string", description: "HH:MM, nur bei Uhrzeit-Terminen" },
          recurrence: { type: "string", enum: ["none", "weekly", "biweekly", "monthly", "yearly"], description: "biweekly = alle 14 Tage" },
          attendee_names: { type: "array", items: { type: "string" } },
          confirmed: { type: "boolean" },
        },
        required: ["title", "starts_on"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_calendar_events",
      description:
        "Beantwortet Fragen zum Familienkalender — vergangene UND kommende " +
        "Termine. Verwende dies IMMER fuer Fragen wie 'Wann war der letzte " +
        "Zahnarzttermin?', 'Wann hatte Emma das letzte Mal Training?', " +
        "'Was steht naechste Woche an?' oder 'Haben wir im August was vor?'. " +
        "Rate niemals Termine, ohne dieses Tool aufzurufen.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Stichwort, das im Titel oder der Notiz vorkommt, z.B. 'Zahnarzt'. Optional.",
          },
          person: {
            type: "string",
            description:
              "Name eines Familienmitglieds — nur Termine mit diesem Teilnehmer. Optional.",
          },
          direction: {
            type: "string",
            enum: ["past", "upcoming", "all"],
            description:
              "past = vergangene Termine (neueste zuerst, fuer 'wann war der letzte...'), " +
              "upcoming = kommende (naechste zuerst), all = beides. Standard: all.",
          },
          from: {
            type: "string",
            description: "Fruehestes Datum, ISO YYYY-MM-DD. Optional.",
          },
          to: {
            type: "string",
            description: "Spaetestes Datum, ISO YYYY-MM-DD. Optional.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_documents",
      description:
        "Durchsucht alle Familien-Dokumente semantisch und nach Stichworten. " +
        "Verwende dies fuer Fragen nach konkreten Dokumenten, Rechnungen, " +
        "Briefen, Vertraegen oder deren Inhalt.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Suchanfrage in natuerlichem Deutsch",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_payments",
      description:
        "Beantwortet Geld-Fragen exakt: welche Betraege wurden gezahlt, " +
        "was ist noch offen, wie viel insgesamt, in welchem Zeitraum. " +
        "Verwende dies IMMER fuer Fragen wie 'Wann habe ich was gezahlt?', " +
        "'Wie viel habe ich fuer die Kita bezahlt?' oder 'Was ist noch " +
        "offen?'. Beruecksichtigt nur bestaetigte Dokumente. Die Summen " +
        "werden serverseitig berechnet und sind nach Art und Waehrung " +
        "GETRENNT ausgewiesen — uebernimm sie unveraendert, rechne NICHT " +
        "selbst mit Zahlen aus Dokument-Auszuegen und addiere die Summen " +
        "verschiedener Arten NICHT zusammen. Wenn du genau eine Summe " +
        "brauchst, frage mit einem konkreten kind an.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: [...AMOUNT_KINDS],
            description:
              "Art der Betraege: paid (gezahlt), outstanding (offen), " +
              "total (Gesamtbetraege), per_person, recurring, other. " +
              "Weglassen fuer alle.",
          },
          from: {
            type: "string",
            description: "Frueheste Datumsgrenze, ISO YYYY-MM-DD.",
          },
          to: {
            type: "string",
            description: "Spaeteste Datumsgrenze, ISO YYYY-MM-DD.",
          },
          category: {
            type: "string",
            description:
              "Sammlung/Kategorie des Dokuments, z.B. 'Kita'. Weglassen fuer alle.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description:
        "Listet Aufgaben der Familie auf, optional gefiltert nach Status " +
        "oder mit Frist in den naechsten N Tagen. " +
        "Verwende dies fuer 'Was muss ich erledigen?' oder 'Welche Fristen gibt es?'",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["open", "done", "all"],
            description: "Filter nach Status. Standard: 'open'.",
          },
          upcoming_days: {
            type: "number",
            description:
              "Nur Aufgaben mit Frist in den naechsten N Tagen. Optional.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_task",
      description:
        "Legt eine neue Aufgabe oder Erinnerung an. " +
        "Verwende dies, wenn der Nutzer dich bittet, sich etwas zu merken " +
        "oder eine Aufgabe/Erinnerung/Frist einzutragen (z.B. 'Erinnere mich " +
        "an den Kita-Ausflug am 12.9.' oder 'Leg eine Aufgabe an: " +
        "Steuererklaerung einreichen'). " +
        "Setze confirmed erst auf true, wenn der Nutzer die genaue Formulierung " +
        "(Titel, ggf. Frist) klar und eindeutig bestaetigt hat (z.B. 'Ja, leg " +
        "an' oder 'Passt so'). Wenn der Nutzer nur fragt oder unklar ist, setze " +
        "confirmed auf false — nenne dann in deiner Antwort DIREKT den " +
        "vorgeschlagenen Titel (und Frist falls vorhanden) und " +
        "frage kurz, ob das so passt. Erfinde niemals, die Aufgabe sei bereits " +
        "angelegt, bevor du dieses Tool mit confirmed=true aufgerufen hast.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Kurzer, konkreter Titel der Aufgabe.",
          },
          description: {
            type: "string",
            description: "Optionale zusaetzliche Details.",
          },
          due_date: {
            type: "string",
            description: "Optionale Frist im Format YYYY-MM-DD.",
          },
          assignee_name: {
            type: "string",
            description:
              "Optional: Name des Familienmitglieds, dem die Aufgabe " +
              "zugeordnet wird.",
          },
          confirmed: {
            type: "boolean",
            description:
              "true nur wenn der Nutzer die Aktion eindeutig bestaetigt " +
              "hat. false (Standard) fordert eine Bestaetigung an.",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_documents",
      description:
        "Listet Dokumente der Familie VOLLSTAENDIG und deterministisch auf — " +
        "gefiltert nach Typ, Kategorie/Sammlung, Person oder Jahr, chronologisch sortiert. " +
        "Verwende dies fuer Aufzaehlungs-Fragen wie 'Zeig mir alle Rechnungen', " +
        "'Welche Dokumente haben wir von 2026?', 'Alle Dokumente von Emma' oder " +
        "'Dokumente zu Emma' — " +
        "NICHT search_documents (das ist Aehnlichkeitssuche mit Top-10-Limit).",
      parameters: {
        type: "object",
        properties: {
          document_type: {
            type: "string",
            enum: [
              "invoice", "letter", "contract", "medical",
              "school", "insurance", "tax", "credentials", "other",
            ],
            description: "Filter nach Dokumenttyp. Optional.",
          },
          category: {
            type: "string",
            description:
              "Filter nach Kategorie/Sammlung (z.B. 'Rechnungen'). Optional.",
          },
          person_name: {
            type: "string",
            description: "Nur Dokumente dieser Person. Optional.",
          },
          year: {
            type: "number",
            description: "Nur Dokumente aus diesem Jahr. Optional.",
          },
          sort: {
            type: "string",
            enum: ["newest", "oldest"],
            description: "Sortierung. Standard: 'newest'.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_family_members",
      description:
        "Listet alle Familienmitglieder mit Namen und Rollen auf.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_contact",
      description:
        "Findet bestätigte Kontakte der Familie nach Name oder Organisation. " +
        "Verwende dies für Telefonnummern, E-Mail-Adressen und Bitten, jemanden anzurufen oder eine WhatsApp-Nachricht vorzubereiten.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Name oder Organisation des gesuchten Kontakts.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_contact",
      description:
        "Legt einen neuen Kontakt für die Familie an. Verwende dies, wenn " +
        "der Nutzer ausdrücklich einen Kontakt speichern möchte und Name " +
        "sowie mindestens Telefonnummer oder E-Mail-Adresse genannt hat. " +
        "Fehlen diese Angaben, frage zuerst danach. Setze confirmed erst " +
        "auf true, wenn der Nutzer die Aktionskarte bestätigt hat.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name des neuen Kontakts.",
          },
          organization: {
            type: "string",
            description: "Optionale Organisation oder Firma.",
          },
          role: {
            type: "string",
            description: "Optionale Rolle, z.B. Kinderärztin.",
          },
          phone: {
            type: "string",
            description: "Optionale Telefonnummer.",
          },
          email: {
            type: "string",
            description: "Optionale E-Mail-Adresse.",
          },
          confirmed: {
            type: "boolean",
            description:
              "true nur nach Bestätigung in der Aktionskarte. false " +
              "(Standard) fordert die Bestätigung an.",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "present_answer_card",
      description:
        "Zeigt die Antwort als strukturierte Karte statt als Fliesstext an. " +
        "Verwende dies NUR, wenn die Antwort GENAU EIN konkretes Ergebnis " +
        "mit mehreren Detailfeldern beschreibt (z.B. ein Termin, eine Frist, " +
        "eine Rechnung, eine einzelne Aufgabe). Verwende dies NICHT fuer " +
        "Listen mit mehreren Elementen, allgemeine Erklaerungen, " +
        "Begruessungen/Smalltalk oder wenn die Quellen die Frage nicht " +
        "beantworten (dann normal in Text antworten). Die konkret erfragte " +
        "Information MUSS in fields stehen. Eine Karte nur mit Dokumenttitel, " +
        "Person oder Dokumentlink ist keine Antwort und ist ungueltig. " +
        "Bei Fragen nach Zugangsdaten (Login, Passwort, Zugang zu einem " +
        "Portal) IMMER card_type 'zugangsdaten' mit source_document_id " +
        "verwenden: die Karte liest URL, Benutzername und Passwort selbst " +
        "aus dem Dokument, macht die Adresse anklickbar, die Werte " +
        "kopierbar und blendet das Passwort auf Klick ein.",
      parameters: {
        type: "object",
        properties: {
          card_type: {
            type: "string",
            enum: ["termin", "aufgabe", "dokument", "zugangsdaten", "kontakt", "allgemein"],
            description: "Die Art des Ergebnisses.",
          },
          title: {
            type: "string",
            description: "Kurzer, konkreter Titel, z.B. 'Zahnarzttermin'.",
          },
          subtitle: {
            type: "string",
            description:
              "Optionaler Untertitel, z.B. der Name der betroffenen Person.",
          },
          fields: {
            type: "array",
            description:
              "1-6 Detailfelder als Label/Wert-Paare. Bei card_type " +
              "'zugangsdaten' bleibt die Liste leer bzw. wird ignoriert: " +
              "URL, Benutzername und Passwort kennst du nicht, die Karte " +
              "liest sie selbst aus dem Dokument.",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "string" },
              },
              required: ["label", "value"],
            },
          },
          source_document_id: {
            type: "string",
            description:
              "Optional: die ID des Quelldokuments (aus den Suchergebnissen), " +
              "aus dem die Information stammt.",
          },
          contact_id: {
            type: "string",
            description:
              "Bei card_type 'kontakt': die von lookup_contact gelieferte Kontakt-ID.",
          },
          contact_action: {
            type: "string",
            enum: ["phone", "email", "whatsapp"],
            description:
              "Optional: welche Aktion die Karte hervorheben soll.",
          },
          message_draft: {
            type: "string",
            description:
              "Nur bei WhatsApp: der vom Nutzer gewünschte Entwurf. Niemals automatisch senden.",
          },
        },
        required: ["card_type", "title", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_task_done",
      description:
        "Markiert eine Aufgabe als erledigt. " +
        "Verwende dies nur wenn der Nutzer ausdruecklich darum bittet. " +
        "Setze confirmed erst auf true, wenn der Nutzer die Aufgabe klar " +
        "und eindeutig als erledigt bestaetigt hat (z.B. 'Ja, markiere " +
        "das als erledigt' oder 'Erledigt!'). Wenn der Nutzer nur fragt " +
        "('Kannst du das erledigen?') oder unklar ist, setze confirmed " +
        "auf false und frage nach einer Bestaetigung. " +
        "Bestaetige die Aktion kurz in deiner Antwort.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Die ID der Aufgabe",
          },
          confirmed: {
            type: "boolean",
            description:
              "true nur wenn der Nutzer die Aktion eindeutig bestaetigt " +
              "hat. false (Standard) fordert eine Bestaetigung an.",
          },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "graph_query",
      description:
        "Durchsucht den Knowledge Graph nach verwandten Entitaeten. " +
        "Gib eine Person, Organisation oder ein Stichwort an und erhalte " +
        "alle verwandten Dokumente, Aufgaben und Fristen in einer Antwort. " +
        "Verwende dies fuer relationale Fragen wie: " +
        "'Was muss Emma tun?', 'Welche Dokumente von der Kita haben Fristen?', " +
        "'Zeig mir alles von Emmas Arzt'. " +
        "Dies ist effizienter als search_documents + list_tasks getrennt aufzurufen.",
      parameters: {
        type: "object",
        properties: {
          entity: {
            type: "string",
            description:
              "Name einer Person, Organisation oder Stichwort " +
              "(z.B. 'Emma', 'Kita Sonnenblume', 'Stadtwerke')",
          },
          include: {
            type: "array",
            items: {
              type: "string",
              enum: ["documents", "tasks", "deadlines"],
            },
            description:
              "Was zurueckgegeben werden soll. Standard: alles. " +
              "'deadlines' liefert nur Aufgaben mit Frist.",
          },
          upcoming_days: {
            type: "number",
            description:
              "Nur Aufgaben/Fristen in den naechsten N Tagen. Optional.",
          },
        },
        required: ["entity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_family_member",
      description:
        "Fuegt ein neues Familienmitglied hinzu. " +
        "Verwende dies nur wenn der Nutzer ausdruecklich darum bittet " +
        "(z.B. 'Fuege Emma als neues Familienmitglied hinzu'). " +
        "Setze confirmed erst auf true, wenn der Nutzer das Anlegen klar " +
        "und eindeutig bestaetigt hat. Wenn der Nutzer nur fragt oder " +
        "unklar ist, setze confirmed auf false und frage nach einer " +
        "Bestaetigung. Bestaetige die Aktion kurz in deiner Antwort.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name des neuen Familienmitglieds",
          },
          role: {
            type: "string",
            description:
              "Optionale Rolle/Beziehung, z.B. 'Kind', 'Elternteil'.",
          },
          birthdate: {
            type: "string",
            description: "Optionales Geburtsdatum im Format YYYY-MM-DD.",
          },
          confirmed: {
            type: "boolean",
            description:
              "true nur wenn der Nutzer die Aktion eindeutig bestaetigt " +
              "hat. false (Standard) fordert eine Bestaetigung an.",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_document_to_collection",
      description:
        "Verschiebt/ordnet ein Dokument einer bestehenden Sammlung zu. " +
        "Die Dokument-ID muss aus einem vorherigen search_documents- oder " +
        "graph_query-Aufruf stammen. Verwende dies nur wenn der Nutzer " +
        "ausdruecklich darum bittet (z.B. 'Leg die Rechnung in die " +
        "Sammlung Rechnungen ab'). Setze confirmed erst auf true, wenn " +
        "der Nutzer die Aktion klar bestaetigt hat.",
      parameters: {
        type: "object",
        properties: {
          document_id: {
            type: "string",
            description: "Die ID des Dokuments (aus vorherigen Suchergebnissen).",
          },
          collection_name: {
            type: "string",
            description: "Name der Ziel-Sammlung, z.B. 'Rechnungen'.",
          },
          confirmed: {
            type: "boolean",
            description:
              "true nur wenn der Nutzer die Aktion eindeutig bestaetigt " +
              "hat. false (Standard) fordert eine Bestaetigung an.",
          },
        },
        required: ["document_id", "collection_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_document_tags",
      description:
        "Fuegt einem Dokument ein oder mehrere Schlagworte (Tags) hinzu. " +
        "Die Dokument-ID muss aus einem vorherigen search_documents- oder " +
        "graph_query-Aufruf stammen. Verwende dies nur wenn der Nutzer " +
        "ausdruecklich darum bittet. Setze confirmed erst auf true, wenn " +
        "der Nutzer die Aktion klar bestaetigt hat.",
      parameters: {
        type: "object",
        properties: {
          document_id: {
            type: "string",
            description: "Die ID des Dokuments (aus vorherigen Suchergebnissen).",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Ein oder mehrere Schlagworte, z.B. ['Steuer', '2025'].",
          },
          confirmed: {
            type: "boolean",
            description:
              "true nur wenn der Nutzer die Aktion eindeutig bestaetigt " +
              "hat. false (Standard) fordert eine Bestaetigung an.",
          },
        },
        required: ["document_id", "tags"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_document_fact",
      description:
        "Speichert oder korrigiert eine Nummer/Kennung (Steuer-ID, " +
        "Seriennummer, IBAN, Kennzeichen, Zaehlernummer, ...) an einem " +
        "Dokument. Verwende dies, wenn der Nutzer eine Nummer nachtragen " +
        "will ('Merk dir: die Seriennummer der Waschmaschine ist ...') " +
        "oder eine falsch erkannte Nummer korrigiert ('die Seriennummer " +
        "ist falsch, richtig ist ...'). Die Dokument-ID muss aus einem " +
        "vorherigen search_documents-/list_documents-Aufruf stammen — " +
        "suche das Dokument zuerst, wenn du die ID noch nicht hast. " +
        "Existiert am Dokument bereits eine Nummer mit derselben " +
        "Bezeichnung, wird sie korrigiert, sonst neu angelegt. Setze " +
        "confirmed erst auf true, wenn der Nutzer die Aktion klar " +
        "bestaetigt hat.",
      parameters: {
        type: "object",
        properties: {
          document_id: {
            type: "string",
            description: "Die ID des Dokuments (aus vorherigen Suchergebnissen).",
          },
          value: {
            type: "string",
            description: "Der exakte Wert, z.B. 'WM-482-B93816'.",
          },
          label: {
            type: "string",
            description:
              "Wozu die Nummer gehoert — danach wird sie spaeter " +
              "gefunden. Nenne Art und Bezug, z.B. 'Seriennummer " +
              "Waschmaschine' oder 'Steuer-ID Hanna'.",
          },
          confirmed: {
            type: "boolean",
            description:
              "true nur wenn der Nutzer die Aktion eindeutig bestaetigt " +
              "hat. false (Standard) fordert eine Bestaetigung an.",
          },
        },
        required: ["document_id", "value", "label"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description:
        "Aendert eine bestehende Aufgabe: Titel, Beschreibung, Frist, " +
        "zustaendige Person oder Status. " +
        "Verwende dies fuer 'Verschieb die Frist auf naechste Woche' " +
        "oder 'Das war doch noch nicht erledigt' (status 'open' oeffnet wieder). " +
        "Die Aufgaben-ID muss aus einem vorherigen list_tasks- oder " +
        "graph_query-Aufruf stammen — hole sie dort, wenn du sie noch " +
        "nicht hast. " +
        "Setze confirmed erst auf true, wenn der Nutzer die Aenderung " +
        "klar bestaetigt hat. Nenne in der Bestaetigungsfrage die " +
        "konkreten neuen Werte.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Die ID der Aufgabe (aus list_tasks/graph_query).",
          },
          title: {
            type: "string",
            description: "Neuer Titel. Optional.",
          },
          description: {
            type: "string",
            description:
              "Neue Beschreibung. Optional. Leerer String entfernt sie.",
          },
          due_date: {
            type: "string",
            description:
              "Neue Frist im Format YYYY-MM-DD. Optional. " +
              "Leerer String entfernt die Frist.",
          },
          assignee_name: {
            type: "string",
            description:
              "Name des Familienmitglieds, das die Aufgabe uebernehmen " +
              "soll. Optional. Leerer String entfernt die Zuordnung.",
          },
          status: {
            type: "string",
            enum: ["open", "done"],
            description:
              "Neuer Status. Optional. 'open' oeffnet eine erledigte " +
              "Aufgabe wieder, 'done' erledigt sie.",
          },
          confirmed: {
            type: "boolean",
            description:
              "true nur wenn der Nutzer die Aenderung eindeutig " +
              "bestaetigt hat. false (Standard) fordert eine " +
              "Bestaetigung an.",
          },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_collection",
      description:
        "Legt eine neue Sammlung (Ablage-Ordner fuer Dokumente) an. " +
        "Verwende dies, wenn der Nutzer eine neue Sammlung moechte " +
        "(z.B. 'Leg eine Sammlung Steuer 2026 an'). Anschliessend kannst " +
        "du Dokumente mit move_document_to_collection hineinlegen. " +
        "Setze confirmed erst auf true, wenn der Nutzer das Anlegen " +
        "klar bestaetigt hat.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name der Sammlung, z.B. 'Steuer 2026'.",
          },
          icon: {
            type: "string",
            enum: [
              "file-text",
              "receipt",
              "building",
              "shield",
              "heart",
              "graduation-cap",
              "car",
              "home",
              "briefcase",
              "wallet",
            ],
            description:
              "Optionales Icon, passend zum Thema (z.B. 'wallet' fuer " +
              "Finanzen, 'graduation-cap' fuer Schule). " +
              "Standard: 'file-text'.",
          },
          color: {
            type: "string",
            enum: [
              "petrol",
              "apricot",
              "destructive",
              "blue-soft",
              "mist",
              "apricot-light",
            ],
            description: "Optionale Farbe. Standard: 'petrol'.",
          },
          confirmed: {
            type: "boolean",
            description:
              "true nur wenn der Nutzer die Aktion eindeutig bestaetigt " +
              "hat. false (Standard) fordert eine Bestaetigung an.",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description:
        "Speichert eine Notiz als neues Dokument — fuer freien Text, zu " +
        "dem es kein eingescanntes Dokument gibt (z.B. 'Notier dir: das " +
        "WLAN-Passwort haengt am Kuehlschrank' oder 'Merk dir die Nummer " +
        "vom Kita-Traeger'). Die Notiz wird automatisch analysiert und " +
        "liegt danach in den Dokumenten zur Bestaetigung bereit. " +
        "Legt auch Zugangsdaten an ('Leg mir die Zugangsdaten fuer X an'): " +
        "dann document_type='credentials' plus url und username. Das " +
        "PASSWORT gehoert NICHT hierher — es wird verschluesselt gespeichert " +
        "und ausschliesslich in der App gesetzt, niemals ueber den Chat. " +
        "Setze confirmed erst auf true, wenn der Nutzer die Notiz klar " +
        "bestaetigt hat — nenne in der Bestaetigungsfrage Titel und Inhalt.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description:
              "Kurzer Titel der Notiz. Bei Zugangsdaten der Name des " +
              "Zugangs, z.B. 'Netflix' oder 'Stadtwerke-Portal'.",
          },
          content: {
            type: "string",
            description:
              "Der eigentliche Notiztext. Bei Zugangsdaten die " +
              "Beschreibung (optional) — URL und Benutzername gehoeren in " +
              "ihre eigenen Felder, nicht hier hinein.",
          },
          document_type: {
            type: "string",
            enum: [...DOCUMENT_TYPES],
            description:
              "Dokumenttyp. Standard 'other'. 'credentials' fuer " +
              "Zugangsdaten (Login zu einem Portal, WLAN, Konto).",
          },
          url: {
            type: "string",
            description:
              "Nur bei document_type 'credentials': Adresse der " +
              "Login-Seite, z.B. 'https://www.netflix.com'.",
          },
          username: {
            type: "string",
            description:
              "Nur bei document_type 'credentials': Benutzername bzw. " +
              "Login-Name.",
          },
          confirmed: {
            type: "boolean",
            description:
              "true nur wenn der Nutzer die Aktion eindeutig bestaetigt " +
              "hat. false (Standard) fordert eine Bestaetigung an.",
          },
        },
        required: ["title", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_note",
      description:
        "Ergaenzt den Text einer BESTEHENDEN, manuell angelegten Notiz. " +
        "Verwende dies statt create_note, wenn der Nutzer eine vorhandene " +
        "Notiz aendern oder um Angaben aus einem Scan ergaenzen moechte. " +
        "Fuer jede zu aendernde Notiz ist ein eigener Tool-Aufruf noetig. " +
        "Die document_id muss zuvor ueber die Dokumentensuche ermittelt " +
        "werden. Setze confirmed erst auf true, wenn der Nutzer genau diese " +
        "Ergaenzung in der Aktionskarte bestaetigt hat.",
      parameters: {
        type: "object",
        properties: {
          document_id: {
            type: "string",
            description: "ID der bestehenden Notiz.",
          },
          append_content: {
            type: "string",
            description:
              "Text, der unveraendert an die bestehende Notiz angehaengt wird.",
          },
          confirmed: {
            type: "boolean",
            description:
              "true nur nach ausdruecklicher Bestaetigung ueber die Aktionskarte.",
          },
        },
        required: ["document_id", "append_content"],
      },
    },
  }
];

/**
 * Responses API function tools use a flat definition shape. Keep the
 * established schemas above as the source of truth and adapt them once here.
 */
export const TOOL_DEFINITIONS: OpenAI.Responses.FunctionTool[] =
  CHAT_COMPLETION_TOOL_DEFINITIONS.map((tool) => {
    if (tool.type !== "function") {
      throw new Error("Unsupported non-function tool definition.");
    }

    return {
      type: "function" as const,
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters ?? {
        type: "object",
        properties: {},
      },
      // Existing tool schemas have optional fields. The application
      // validates every call server-side, so retain that compatibility
      // instead of falsely declaring an incomplete schema as strict.
      strict: false,
    };
  });

// ---------------------------------------------------------------------------
// Tool executors
// ---------------------------------------------------------------------------

/**
 * Execute a tool call by name, returning the result string for the LLM.
 *
 * Throws on unknown tool names or execution errors. The caller (chat.ts)
 * catches errors and returns a tool error message to the LLM instead of
 * crashing the conversation.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  switch (name) {
    case "add_calendar_event":
      return executeAddCalendarEvent(args, ctx);
    case "query_calendar_events":
      return executeQueryCalendarEvents(args, ctx);
    case "search_documents":
      return executeSearchDocuments(args, ctx);
    case "query_payments":
      return executeQueryPayments(args, ctx);
    case "list_tasks":
      return executeListTasks(args, ctx);
    case "add_task":
      return executeAddTask(args, ctx);
    case "list_documents":
      return executeListDocuments(args, ctx);
    case "list_family_members":
      return executeListFamilyMembers(ctx);
    case "lookup_contact":
      return executeLookupContact(args, ctx);
    case "add_contact":
      return executeAddContact(args, ctx);
    case "mark_task_done":
      return executeMarkTaskDone(args, ctx);
    case "graph_query":
      return executeGraphQuery(args, ctx);
    case "add_family_member":
      return executeAddFamilyMember(args, ctx);
    case "move_document_to_collection":
      return executeMoveDocumentToCollection(args, ctx);
    case "add_document_tags":
      return executeAddDocumentTags(args, ctx);
    case "save_document_fact":
      return executeSaveDocumentFact(args, ctx);
    case "update_task":
      return executeUpdateTask(args, ctx);
    case "create_collection":
      return executeCreateCollection(args, ctx);
    case "create_note":
      return executeCreateNote(args, ctx);
    case "update_note":
      return executeUpdateNote(args, ctx);
    default:
      return JSON.stringify({ error: `Unbekanntes Tool: ${name}` });
  }
}

async function executeLookupContact(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const query = String(args.query ?? "").trim().toLocaleLowerCase("de");
  if (!query) return JSON.stringify({ error: "Kein Name angegeben." });

  const { data, error } = await ctx.client.rpc("search_family_contacts", {
    p_family_id: ctx.familyId,
    p_query: query,
    p_limit: 10,
  });

  if (error) return JSON.stringify({ error: "Kontakte konnten nicht geladen werden." });

  const contacts = data ?? [];

  return JSON.stringify({
    contacts: contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      organisation: contact.organization,
      rolle: contact.role,
      telefon: contact.phone,
      email: contact.email,
    })),
  });
}

async function executeAddContact(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const parsed = contactInputSchema.safeParse({
    name: typeof args.name === "string" ? args.name : "",
    organization:
      typeof args.organization === "string" ? args.organization : "",
    role: typeof args.role === "string" ? args.role : "",
    phone: typeof args.phone === "string" ? args.phone : "",
    email: typeof args.email === "string" ? args.email : "",
  });
  if (!parsed.success) {
    return JSON.stringify({
      error:
        parsed.error.issues[0]?.message ??
        "Die Kontaktdaten sind nicht vollständig.",
    });
  }

  const contact = parsed.data;
  if (args.confirmed !== true) {
    return JSON.stringify({
      needs_confirmation: true,
      contact_name: contact.name,
      organization: contact.organization || null,
      role: contact.role || null,
      phone: contact.phone || null,
      email: contact.email || null,
      message: `Bitte bestaetige: Soll der Kontakt '${contact.name}' angelegt werden?`,
    });
  }

  if (!ctx.userId) {
    return JSON.stringify({ error: "Kontakt konnte nicht angelegt werden." });
  }

  const { error } = await ctx.client
    .from("contacts")
    .insert({
      family_id: ctx.familyId,
      name: contact.name,
      organization: contact.organization || null,
      role: contact.role || null,
      phone: contact.phone || null,
      email: contact.email.toLowerCase() || null,
      status: "confirmed",
      created_by: ctx.userId,
    });

  if (error) {
    return JSON.stringify({ error: "Kontakt konnte nicht angelegt werden." });
  }

  return JSON.stringify({
    success: true,
    name: contact.name,
    message: `Der Kontakt '${contact.name}' wurde angelegt.`,
  });
}

// ---------------------------------------------------------------------------
// search_documents
// ---------------------------------------------------------------------------

async function executeSearchDocuments(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const query = String(args.query ?? "").trim();
  if (!query) return JSON.stringify({ error: "Keine Suchanfrage angegeben." });

  // Hybrid content search (facts + semantic + lexical, RRF-fused) plus
  // graph search (persons, tasks, knowledge-graph traversal).
  const [content, graph] = await Promise.all([
    hybridSearch(ctx.client, query, ctx.familyId),
    graphSearch(ctx.client, query, ctx.familyId),
  ]);

  // The relevance threshold is calibrated for cosine-similarity scores, so
  // apply it only to pure semantic results — fact/lexical/hybrid hits match
  // lexically and carry their own score semantics.
  const relevantContent = [
    ...filterByRelevanceThreshold(content.filter((r) => r.source === "semantic")),
    ...content.filter((r) => r.source !== "semantic"),
  ];

  // Re-rank combined results using LLM-as-judge for better relevance.
  // This catches cases where vector similarity returns high-score but
  // low-relevance results. Re-rank before combining into ChatSource[].
  const contentSources = new Set(["semantic", "lexical", "fact", "hybrid"]);
  const allResults = [...relevantContent, ...graph];
  const reranked = await rerankResults(query, allResults);
  const sources = combineSearchResults(
    reranked.filter((r) => contentSources.has(r.source)),
    reranked.filter((r) => !contentSources.has(r.source)),
  );

  // Accumulate sources for the API response.
  for (const s of sources) {
    if (!ctx.sources.find((x) => x.document_id === s.document_id)) {
      ctx.sources.push(s);
    }
  }

  if (sources.length === 0) {
    return JSON.stringify({ results: [], message: "Keine Dokumente gefunden." });
  }

  // Enrich results with document metadata (type, category, summary, persons).
  const docIds = sources.map((s) => s.document_id);
  const [docMetaResult, entityResult] = await Promise.all([
    ctx.client
      .from("documents")
      .select("id, document_type, category, summary")
      .in("id", docIds),
    ctx.client
      .from("extracted_entities")
      .select("document_id, entity_value")
      .eq("family_id", ctx.familyId)
      .eq("entity_type", "person")
      .eq("confirmed", true)
      .in("document_id", docIds),
  ]);

  const docMetaMap = new Map(
    (docMetaResult.data ?? []).map((d) => [d.id, d]),
  );
  const personMap = new Map<string, string[]>();
  for (const e of entityResult.data ?? []) {
    if (!e.entity_value) continue;
    if (!personMap.has(e.document_id)) personMap.set(e.document_id, []);
    personMap.get(e.document_id)!.push(e.entity_value);
  }

  return JSON.stringify({
    results: sources.map((s, i) => {
      const meta = docMetaMap.get(s.document_id);
      const persons = personMap.get(s.document_id) ?? [];
      return {
        nr: i + 1,
        id: s.document_id,
        titel: s.title,
        typ: meta?.document_type ?? "unknown",
        kategorie: meta?.category ?? null,
        zusammenfassung: meta?.summary ?? null,
        personen: persons.length > 0 ? persons : undefined,
        auszug: redactPII(s.excerpt.slice(0, 500)),
        relevanz: Math.round(s.score * 100) + "%",
      };
    }),
  });
}

// ---------------------------------------------------------------------------
// list_tasks
// ---------------------------------------------------------------------------
// list_documents
// ---------------------------------------------------------------------------
// query_payments
// ---------------------------------------------------------------------------

/**
 * Answer money questions from the typed amount columns instead of letting
 * the model add up numbers it read in an OCR excerpt.
 *
 * Before this existed, "wie viel habe ich fuer die Kita bezahlt?" went
 * through semantic search: the chunk contained both the total and the
 * family's own contribution with nothing to tell them apart, so the model
 * regularly answered with the wrong one. Amounts were also text, so no sum
 * was possible at all.
 *
 * The total is computed here, server-side, and handed to the model as a
 * finished number.
 */
async function executeQueryPayments(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const kind =
    typeof args.kind === "string" &&
    (AMOUNT_KINDS as readonly string[]).includes(args.kind)
      ? (args.kind as AmountKind)
      : null;
  const from = typeof args.from === "string" ? args.from : null;
  const to = typeof args.to === "string" ? args.to : null;
  const category = typeof args.category === "string" ? args.category.trim() : "";

  let query = ctx.client
    .from("extracted_entities")
    .select("document_id, label, amount_minor, currency, amount_kind, value_date")
    .eq("family_id", ctx.familyId)
    .eq("entity_type", "amount")
    .not("amount_minor", "is", null);

  if (kind) query = query.eq("amount_kind", kind);
  if (from) query = query.gte("value_date", from);
  if (to) query = query.lte("value_date", to);

  const { data: rows, error } = await query;
  if (error) {
    return JSON.stringify({
      error: "Betraege konnten nicht geladen werden.",
    });
  }
  if (!rows || rows.length === 0) {
    return JSON.stringify({
      betraege: [],
      hinweis:
        "Keine Betraege gefunden, die dazu passen. Moeglich ist auch, dass " +
        "die betroffenen Dokumente vor der Einfuehrung typisierter Betraege " +
        "gescannt wurden.",
    });
  }

  // Resolve the documents so the answer can name them and filter by
  // collection. Only confirmed documents are part of the family book.
  // Only confirmed documents. The analyze step writes amount rows before
  // the user has reviewed anything, so accepting a row merely because its
  // document exists let unreviewed drafts into money answers.
  //
  // Filter on the DOCUMENT status, not the entity's `confirmed` flag:
  // re-analysing a confirmed document rewrites its entities with
  // confirmed = false while the document goes straight back to status
  // "confirmed", so the flag would hide real, reviewed amounts.
  const documentIds = [...new Set(rows.map((r) => r.document_id))];
  const { data: documents } = await ctx.client
    .from("documents")
    .select("id, title, category, status")
    .eq("status", "confirmed")
    .in("id", documentIds);

  const byId = new Map(
    (documents ?? []).map((d) => [d.id, d]),
  );

  const matching = rows.filter((row) => {
    const doc = byId.get(row.document_id);
    if (!doc) return false;
    if (!category) return true;
    return (doc.category ?? "").toLocaleLowerCase("de").includes(
      category.toLocaleLowerCase("de"),
    );
  });

  if (matching.length === 0) {
    return JSON.stringify({ betraege: [] });
  }

  // Sum per kind AND currency. Adding kinds together produces a number that
  // is none of the real figures: an 88,00 EUR invoice with 10,00 EUR already
  // paid would report 98,00 EUR, and the tool description tells the model to
  // trust this value. Mixing currencies would be wrong for the same reason.
  const totals = new Map<string, number>();
  for (const row of matching) {
    const currency = row.currency ?? "EUR";
    const rowKind = (row.amount_kind as AmountKind) ?? "other";
    totals.set(
      `${rowKind}|${currency}`,
      (totals.get(`${rowKind}|${currency}`) ?? 0) + (row.amount_minor ?? 0),
    );
  }

  return JSON.stringify({
    betraege: matching.map((row) => {
      const doc = byId.get(row.document_id);
      return {
        betrag: `${formatMinorAsGerman(row.amount_minor ?? 0)} ${row.currency ?? "EUR"}`,
        art: AMOUNT_KIND_LABELS[(row.amount_kind as AmountKind) ?? "other"],
        bezeichnung: row.label ?? null,
        datum: row.value_date ? formatGermanDate(row.value_date) : null,
        dokument: doc?.title ?? null,
        sammlung: doc?.category ?? null,
        document_id: row.document_id,
      };
    }),
    // Server-computed, so the model never has to add anything up — but one
    // sum per kind and currency, because a total, an already-paid part and
    // an outstanding balance are not addable.
    summen: [...totals.entries()].map(([key, minor]) => {
      const [rowKind, currency] = key.split("|");
      return {
        art: AMOUNT_KIND_LABELS[rowKind as AmountKind],
        currency,
        wert: `${formatMinorAsGerman(minor)} ${currency}`,
        anzahl: matching.filter(
          (r) =>
            ((r.amount_kind as AmountKind) ?? "other") === rowKind &&
            (r.currency ?? "EUR") === currency,
        ).length,
      };
    }),
    hinweis:
      kind === null && totals.size > 1
        ? "Die Summen sind nach Art getrennt. Addiere sie NICHT: ein " +
          "Gesamtbetrag, ein bereits gezahlter Teil und ein offener Rest " +
          "gehoeren nicht zusammengerechnet."
        : undefined,
    anzahl: matching.length,
  });
}

// ---------------------------------------------------------------------------

/** Cap for complete document listings (a family library, not a data dump). */
const LIST_DOCUMENTS_MAX = 50;

/**
 * Deterministic, COMPLETE document listing — the counterpart to
 * search_documents' similarity-based top-10. "Zeig mir alle Rechnungen"
 * must return every invoice in order, not the ten most similar chunks.
 */
async function executeListDocuments(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const documentType =
    typeof args.document_type === "string" ? args.document_type : null;
  const category = typeof args.category === "string" ? args.category.trim() : "";
  const personName =
    typeof args.person_name === "string" ? args.person_name.trim() : "";
  const year = typeof args.year === "number" ? Math.floor(args.year) : null;
  const ascending = args.sort === "oldest";

  // Person filter resolves to document ids first (via extracted_entities).
  // The name may arrive in the possessive the user spoke it in ("Hannas
  // Zeugnisse"), so look it up stripped and match it back tolerantly.
  const lookupName = stripPossessive(personName);
  let personDocIds: string[] | null = null;
  if (personName) {
    const { data: entities } = await ctx.client
      .from("extracted_entities")
      .select("document_id, normalized_value")
      .eq("family_id", ctx.familyId)
      .eq("entity_type", "person")
      .ilike("normalized_value", `%${lookupName.toLowerCase()}%`);
    personDocIds = [
      ...new Set(
        (entities ?? [])
          .filter((e) =>
            matchesPersonName(e.normalized_value ?? "", lookupName),
          )
          .map((e) => e.document_id),
      ),
    ];
    if (personDocIds.length === 0) {
      return JSON.stringify({
        results: [],
        total: 0,
        message: `Keine Dokumente fuer '${personName}' gefunden.`,
      });
    }
  }

  let query = ctx.client
    .from("documents")
    .select("id, title, document_type, category, created_at, confirmed_at")
    .eq("family_id", ctx.familyId)
    .eq("status", "confirmed");

  if (documentType) query = query.eq("document_type", documentType);
  if (category) query = query.ilike("category", `%${category}%`);
  if (personDocIds) query = query.in("id", personDocIds);
  if (year !== null && year > 1900 && year < 3000) {
    query = query
      .gte("created_at", `${year}-01-01`)
      .lt("created_at", `${year + 1}-01-01`);
  }

  const { data: docs, error } = await query
    .order("created_at", { ascending })
    .limit(LIST_DOCUMENTS_MAX);

  if (error) {
    return JSON.stringify({ error: "Dokumente konnten nicht geladen werden." });
  }

  if (!docs || docs.length === 0) {
    return JSON.stringify({
      results: [],
      total: 0,
      message: "Keine passenden Dokumente gefunden.",
    });
  }

  // Surface every listed document as a tappable source. The mobile source
  // section collapses long lists itself, so capping at ten here would make
  // a result that claims to be complete impossible to open past item ten.
  for (const doc of docs) {
    if (!ctx.sources.find((x) => x.document_id === doc.id)) {
      ctx.sources.push({
        document_id: doc.id,
        title: doc.title,
        excerpt: "",
        score: 1,
      });
    }
  }

  return JSON.stringify({
    total: docs.length,
    truncated: docs.length === LIST_DOCUMENTS_MAX,
    results: docs.map((d) => ({
      document_id: d.id,
      titel: d.title,
      typ: d.document_type,
      kategorie: d.category,
      datum: (d.confirmed_at ?? d.created_at).slice(0, 10),
    })),
  });
}

// ---------------------------------------------------------------------------

async function executeListTasks(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const status = String(args.status ?? "open");
  const upcomingDays = args.upcoming_days as number | undefined;

  let query = ctx.client
    .from("tasks")
    .select("id, title, due_date, status, confirmed, document_id")
    .eq("family_id", ctx.familyId)
    .eq("confirmed", true);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  query = query.order("due_date", { ascending: true, nullsFirst: false });

  const { data, error } = await query;
  if (error) {
    return JSON.stringify({ error: "Aufgaben konnten nicht geladen werden." });
  }

  let tasks = data ?? [];

  // Filter by upcoming days if requested.
  if (upcomingDays !== undefined && upcomingDays > 0) {
    const now = new Date();
    const limit = new Date();
    limit.setDate(now.getDate() + upcomingDays);
    tasks = tasks.filter((t) => {
      if (!t.due_date) return false;
      const due = new Date(t.due_date);
      return due >= now && due <= limit;
    });
  }

  if (tasks.length === 0) {
    return JSON.stringify({ tasks: [], message: "Keine Aufgaben gefunden." });
  }

  // Enrich tasks with document titles and person names.
  const docIds = tasks.map((t) => t.document_id).filter(Boolean) as string[];
  let docTitleMap = new Map<string, string>();
  const taskPersonMap = new Map<string, string[]>();

  if (docIds.length > 0) {
    const [docResult, entityResult] = await Promise.all([
      ctx.client
        .from("documents")
        .select("id, title")
        .in("id", docIds),
      ctx.client
        .from("extracted_entities")
        .select("document_id, entity_value")
        .eq("family_id", ctx.familyId)
        .eq("entity_type", "person")
        .eq("confirmed", true)
        .in("document_id", docIds),
    ]);

    docTitleMap = new Map(
      (docResult.data ?? []).map((d) => [d.id, d.title ?? ""]),
    );
    for (const e of entityResult.data ?? []) {
      if (!e.entity_value) continue;
      if (!taskPersonMap.has(e.document_id)) taskPersonMap.set(e.document_id, []);
      taskPersonMap.get(e.document_id)!.push(e.entity_value);
    }
  }

  return JSON.stringify({
    tasks: tasks.map((t) => ({
      id: t.id,
      titel: t.title,
      frist: t.due_date,
      status: t.status,
      dokument: t.document_id ? (docTitleMap.get(t.document_id) ?? undefined) : undefined,
      personen: t.document_id ? (taskPersonMap.get(t.document_id) ?? undefined) : undefined,
    })),
  });
}

// ---------------------------------------------------------------------------
// list_family_members
// ---------------------------------------------------------------------------

async function executeListFamilyMembers(ctx: ToolContext): Promise<string> {
  const { data, error } = await ctx.client
    .from("family_members")
    .select("id, name, role, birthdate")
    .eq("family_id", ctx.familyId)
    .order("name");

  if (error) {
    return JSON.stringify({ error: "Familienmitglieder konnten nicht geladen werden." });
  }

  if (!data || data.length === 0) {
    return JSON.stringify({ members: [], message: "Keine Familienmitglieder gefunden." });
  }

  // Relationships answer the questions a bare role cannot — "die Steuer-ID
  // meiner Tochter" needs to know WHOSE daughter someone is.
  const { byMember: relationsByMember } = await loadFamilyRelations(
    ctx.client,
    ctx.familyId,
  );
  const names = nameMap(data);

  return JSON.stringify({
    members: data.map((m) => {
      const relations = relationsByMember[m.id] ?? [];
      return {
        id: m.id,
        name: m.name,
        rolle: m.role,
        beziehungen: relations.length > 0
          ? formatRelations(relations, names, "; ")
          : null,
        geburtsdatum: m.birthdate,
      };
    }),
  });
}

// ---------------------------------------------------------------------------
// add_task (with confirmation gate)
// ---------------------------------------------------------------------------

async function executeAddTask(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const title = String(args.title ?? "").trim();
  if (!title) return JSON.stringify({ error: "Kein Titel angegeben." });

  const description =
    typeof args.description === "string" && args.description.trim()
      ? args.description.trim()
      : null;
  const dueDate =
    typeof args.due_date === "string" && args.due_date.trim()
      ? args.due_date.trim()
      : null;
  const assigneeName =
    typeof args.assignee_name === "string" ? args.assignee_name.trim() : "";

  const confirmed = args.confirmed === true;
  if (!confirmed) {
    return JSON.stringify({
      needs_confirmation: true,
      task_title: title,
      due_date: dueDate,
      message: `Bitte bestaetige: Soll ich die Aufgabe '${title}'${dueDate ? ` (faellig ${dueDate})` : ""} anlegen?`,
    });
  }

  let assignedTo: string | null = null;
  if (assigneeName) {
    const { data: member } = await ctx.client
      .from("family_members")
      .select("id")
      .eq("family_id", ctx.familyId)
      .ilike("name", assigneeName)
      .maybeSingle();
    assignedTo = member?.id ?? null;
  }

  const { data: task, error } = await ctx.client
    .from("tasks")
    .insert({
      family_id: ctx.familyId,
      title,
      description,
      due_date: dueDate,
      status: "open",
      confidence: 1.0,
      confirmed: true,
      tags: [],
      assigned_to: assignedTo,
    })
    .select("id, title")
    .single();

  if (error || !task) {
    return JSON.stringify({ error: "Aufgabe konnte nicht angelegt werden." });
  }

  return JSON.stringify({
    success: true,
    task_id: task.id,
    titel: task.title,
    message: `Aufgabe '${task.title}' wurde angelegt.`,
  });
}

// ---------------------------------------------------------------------------
// query_calendar_events (read-only)
// ---------------------------------------------------------------------------

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const RECURRENCE_LABELS: Record<string, string> = {
  none: "einmalig",
  weekly: "wöchentlich",
  biweekly: "alle 2 Wochen",
  monthly: "monatlich",
  yearly: "jährlich",
};

type CalendarQueryEvent = {
  id: string;
  title: string;
  note: string | null;
  starts_on: string;
  ends_on: string;
  all_day: boolean;
  starts_time: string | null;
  ends_time: string | null;
  recurrence: "none" | "weekly" | "biweekly" | "monthly" | "yearly";
  recurrence_until: string | null;
  recurrence_exceptions: string[];
};

type CalendarOccurrence = CalendarQueryEvent & {
  occurrence_starts_on: string;
  occurrence_ends_on: string;
};

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T12:00:00`);
  result.setDate(result.getDate() + days);
  return result.toISOString().slice(0, 10);
}

function occurrenceEndsOn(event: CalendarQueryEvent, startsOn: string): string {
  return addDays(startsOn, occurrenceDurationDays(event));
}

function occurrenceDurationDays(event: CalendarQueryEvent): number {
  const durationMs =
    new Date(`${event.ends_on}T12:00:00`).getTime() -
    new Date(`${event.starts_on}T12:00:00`).getTime();
  return Math.round(durationMs / 86_400_000);
}

function occursOn(event: CalendarQueryEvent, date: string): boolean {
  return eventOccursOn(
    {
      ...event,
      recurrence_exceptions: event.recurrence_exceptions ?? [],
    } as EventOccurrenceSource,
    date,
  );
}

function findOccurrence(
  event: CalendarQueryEvent,
  from: string,
  to: string,
  direction: "forward" | "backward",
  overlapsFrom?: string,
): CalendarOccurrence | null {
  const step = direction === "forward" ? 1 : -1;
  let date = direction === "forward" ? from : to;

  while (
    (direction === "forward" && date <= to) ||
    (direction === "backward" && date >= from)
  ) {
    if (occursOn(event, date) && !occursOn(event, addDays(date, -1))) {
      const occurrenceEndsOnDate = occurrenceEndsOn(event, date);
      if (overlapsFrom && occurrenceEndsOnDate < overlapsFrom) {
        date = addDays(date, step);
        continue;
      }
      return {
        ...event,
        occurrence_starts_on: date,
        occurrence_ends_on: occurrenceEndsOnDate,
      };
    }
    date = addDays(date, step);
  }

  return null;
}

function nextYear(date: string): string {
  const result = new Date(`${date}T12:00:00`);
  result.setFullYear(result.getFullYear() + 1);
  return result.toISOString().slice(0, 10);
}

function findRelevantOccurrence(
  event: CalendarQueryEvent,
  direction: string,
  today: string,
  from: string | null,
  to: string | null,
): CalendarOccurrence | null {
  if (event.recurrence === "none") {
    const startsOn = event.starts_on;
    const endsOn = event.ends_on;
    if ((from && endsOn < from) || (to && startsOn > to)) return null;
    if (direction === "past" && startsOn >= today) return null;
    if (direction === "upcoming" && endsOn < today) return null;
    return {
      ...event,
      occurrence_starts_on: startsOn,
      occurrence_ends_on: endsOn,
    };
  }

  if (direction === "past") {
    const rangeStart = from ?? event.starts_on;
    const rangeEnd = [to, addDays(today, -1), event.recurrence_until]
      .filter((value): value is string => Boolean(value))
      .sort()[0];
    if (rangeEnd < rangeStart) return null;
    return findOccurrence(event, rangeStart, rangeEnd, "backward");
  }

  if (direction === "upcoming") {
    const rangeStart = [from, today, event.starts_on]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1)!;
    const rangeEnd = [to, event.recurrence_until, nextYear(rangeStart)]
      .filter((value): value is string => Boolean(value))
      .sort()[0];
    if (rangeEnd < rangeStart) return null;
    return findOccurrence(event, rangeStart, rangeEnd, "forward");
  }

  // "All" with a requested time range must still resolve a concrete
  // recurrence inside that range. Returning the original series row would
  // otherwise surface a 2020 start date for an August 2026 question, or
  // include a series with no occurrence in the requested interval.
  if (from || to) {
    const rangeStart = from ?? event.starts_on;
    const rangeEnd = to ?? event.recurrence_until ?? nextYear(rangeStart);
    if (rangeEnd < rangeStart) return null;
    // Start slightly before the requested window, so a Tuesday-only query
    // still finds a Monday–Wednesday recurring occurrence. `overlapsFrom`
    // rejects any earlier occurrence that ends before the requested range.
    const searchStart = addDays(rangeStart, -occurrenceDurationDays(event));
    return findOccurrence(event, searchStart, rangeEnd, "forward", rangeStart);
  }

  return {
    ...event,
    occurrence_starts_on: event.starts_on,
    occurrence_ends_on: event.ends_on,
  };
}

async function executeQueryCalendarEvents(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const queryText = String(args.query ?? "").trim();
  const person = String(args.person ?? "").trim();
  const direction = ["past", "upcoming", "all"].includes(String(args.direction))
    ? String(args.direction)
    : "all";
  const from = typeof args.from === "string" && DATE_PATTERN.test(args.from) ? args.from : null;
  const to = typeof args.to === "string" && DATE_PATTERN.test(args.to) ? args.to : null;
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
  }).format(new Date());

  // Resolve a person filter to the set of event ids they attend.
  let personEventIds: Set<string> | null = null;
  if (person) {
    const { data: members } = await ctx.client
      .from("family_members")
      .select("id, name")
      .eq("family_id", ctx.familyId)
      .ilike("name", `%${person}%`);
    if (!members?.length) {
      return JSON.stringify({ events: [], message: `Kein Familienmitglied namens '${person}' gefunden.` });
    }
    const { data: attendeeRows } = await ctx.client
      .from("calendar_event_attendees")
      .select("event_id")
      .in("family_member_id", members.map((m) => m.id));
    personEventIds = new Set((attendeeRows ?? []).map((r) => r.event_id));
    if (personEventIds.size === 0) {
      return JSON.stringify({ events: [], message: `Keine Termine mit ${members[0].name} gefunden.` });
    }
  }

  let query = ctx.client
    .from("calendar_events")
    .select("id, title, note, starts_on, ends_on, all_day, starts_time, ends_time, recurrence, recurrence_until, recurrence_exceptions")
    .eq("family_id", ctx.familyId);

  // Apply the attendee constraint before the cap. Date constraints are
  // resolved below because a recurring event can occur long after its
  // original starts_on and ends_on values.
  if (personEventIds) query = query.in("id", [...personEventIds]);
  if (queryText) {
    // Commas would break PostgREST's or() syntax — strip them.
    const safe = queryText.replace(/[(),]/g, " ").trim();
    if (safe) query = query.or(`title.ilike.%${safe}%,note.ilike.%${safe}%`);
  }

  const { data, error } = await query.limit(500);
  if (error) return JSON.stringify({ error: "Termine konnten nicht geladen werden." });

  const events = (data ?? []) as CalendarQueryEvent[];
  // The database already receives this constraint above. Retain the local
  // guard too, so an inconsistent join response can never leak unrelated
  // family events into the answer.
  const personEvents = personEventIds
    ? events.filter((event) => personEventIds.has(event.id))
    : events;
  const occurrences = personEvents
    .map((event) => findRelevantOccurrence(event, direction, today, from, to))
    .filter((event): event is CalendarOccurrence => event !== null)
    .sort((left, right) =>
      direction === "past"
        ? right.occurrence_starts_on.localeCompare(left.occurrence_starts_on)
        : left.occurrence_starts_on.localeCompare(right.occurrence_starts_on),
    )
    .slice(0, 20);
  if (occurrences.length === 0) {
    return JSON.stringify({
      heute: today,
      events: [],
      message: "Keine passenden Termine gefunden.",
    });
  }

  // Enrich with attendee names (two steps — the FK embed join is brittle).
  const eventIds = occurrences.map((e) => e.id);
  const { data: attendees } = await ctx.client
    .from("calendar_event_attendees")
    .select("event_id, family_member_id")
    .in("event_id", eventIds);
  const memberIds = [...new Set((attendees ?? []).map((a) => a.family_member_id))];
  const memberNameMap = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data: memberRows } = await ctx.client
      .from("family_members")
      .select("id, name")
      .in("id", memberIds);
    for (const m of memberRows ?? []) memberNameMap.set(m.id, m.name);
  }
  const eventAttendees = new Map<string, string[]>();
  for (const a of attendees ?? []) {
    const name = memberNameMap.get(a.family_member_id);
    if (!name) continue;
    if (!eventAttendees.has(a.event_id)) eventAttendees.set(a.event_id, []);
    eventAttendees.get(a.event_id)!.push(name);
  }

  return JSON.stringify({
    heute: today,
    events: occurrences.map((e) => ({
      titel: e.title,
      notiz: e.note ?? undefined,
      von: e.occurrence_starts_on,
      bis: e.occurrence_ends_on !== e.occurrence_starts_on
        ? e.occurrence_ends_on
        : undefined,
      uhrzeit: e.all_day ? "ganztägig" : `${e.starts_time}–${e.ends_time}`,
      wiederholung: RECURRENCE_LABELS[e.recurrence] ?? e.recurrence,
      teilnehmer: eventAttendees.get(e.id) ?? [],
    })),
  });
}

// ---------------------------------------------------------------------------
// add_calendar_event (with confirmation gate)
// ---------------------------------------------------------------------------

const TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;

async function executeAddCalendarEvent(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const title = String(args.title ?? "").trim();
  const startsOn = String(args.starts_on ?? "").trim();
  const endsOn = String(args.ends_on ?? startsOn).trim();
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || endsOn < startsOn) {
    return JSON.stringify({ error: "Terminangaben sind unvollständig." });
  }
  const allDay = args.all_day !== false;
  const startsTime =
    typeof args.starts_time === "string" && TIME_PATTERN.test(args.starts_time)
      ? args.starts_time.slice(0, 5)
      : null;
  const endsTime =
    typeof args.ends_time === "string" && TIME_PATTERN.test(args.ends_time)
      ? args.ends_time.slice(0, 5)
      : null;
  // The table requires both times when the event is not all-day — asking
  // again beats inserting a row the check constraint would reject.
  if (!allDay && (!startsTime || !endsTime)) {
    return JSON.stringify({
      error:
        "Für einen Termin mit Uhrzeit brauche ich Beginn und Ende (HH:MM).",
    });
  }
  const recurrence = ["none", "weekly", "biweekly", "monthly", "yearly"].includes(String(args.recurrence))
    ? String(args.recurrence)
    : "none";
  const attendees = Array.isArray(args.attendee_names)
    ? args.attendee_names.filter((name): name is string => typeof name === "string").map((name) => name.trim()).filter(Boolean)
    : [];
  if (args.confirmed !== true) {
    return JSON.stringify({
      needs_confirmation: true,
      event_title: title,
      // The full proposal travels with the confirmation request so the
      // client can render a confirmation card without parsing the message
      // text — and a confirm click can write exactly what was shown.
      starts_on: startsOn,
      ends_on: endsOn,
      all_day: allDay,
      starts_time: allDay ? null : startsTime,
      ends_time: allDay ? null : endsTime,
      recurrence,
      attendee_names: attendees,
      message: `Bitte bestätige: Soll ich '${title}' am ${startsOn}${endsOn !== startsOn ? ` bis ${endsOn}` : ""} eintragen?`,
    });
  }
  const { data: event, error } = await ctx.client.from("calendar_events").insert({
    family_id: ctx.familyId, title, starts_on: startsOn, ends_on: endsOn,
    all_day: allDay, starts_time: allDay ? null : startsTime,
    ends_time: allDay ? null : endsTime,
    recurrence, recurrence_exceptions: [],
  }).select("id, title").single();
  if (error || !event) return JSON.stringify({ error: "Termin konnte nicht angelegt werden." });
  if (attendees.length) {
    const { data: members } = await ctx.client.from("family_members").select("id, name").eq("family_id", ctx.familyId).in("name", attendees);
    if (members?.length) await ctx.client.from("calendar_event_attendees").insert(members.map((member) => ({ event_id: event.id, family_member_id: member.id })));
  }
  return JSON.stringify({ success: true, event_id: event.id, message: `Termin '${event.title}' wurde eingetragen.` });
}

// ---------------------------------------------------------------------------
// mark_task_done (with confirmation gate)
// ---------------------------------------------------------------------------

/**
 * Names of tools that have a confirmation gate. The streaming chat loop
 * uses this to detect when the model is requesting confirmation (rather
 * than executing a destructive/mutating action) and emits a
 * `confirmation_request` event to the client so it can render a
 * confirmation UI. Every tool that writes data (creates, moves, or
 * tags something) belongs in this set.
 */
export const CONFIRMATION_TOOLS = new Set<string>(CHAT_ACTION_TOOL_NAMES);

/**
 * Result shape when a tool requires user confirmation before executing.
 * The model receives this as the tool result and should ask the user to
 * confirm. The client also receives a `confirmation_request` stream event
 * so it can render a confirmation UI alongside the model's text.
 */
export interface ConfirmationRequest {
  tool_name: string;
  task_id: string;
  task_title: string;
  message: string;
}

async function executeMarkTaskDone(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const taskId = String(args.task_id ?? "").trim();
  if (!taskId) return JSON.stringify({ error: "Keine Aufgaben-ID angegeben." });

  const confirmed = args.confirmed === true;

  // Fetch the task first (needed for both the confirmation request and the
  // success message).
  const { data: task, error: fetchError } = await ctx.client
    .from("tasks")
    .select("id, title")
    .eq("id", taskId)
    .eq("family_id", ctx.familyId)
    .maybeSingle();

  if (fetchError || !task) {
    return JSON.stringify({ error: "Aufgabe nicht gefunden." });
  }

  // Confirmation gate: if the user has not explicitly confirmed, return a
  // confirmation request instead of executing the update. The model should
  // ask the user to confirm, then call mark_task_done again with
  // confirmed: true.
  if (!confirmed) {
    return JSON.stringify({
      needs_confirmation: true,
      task_id: task.id,
      task_title: task.title,
      message: `Bitte bestaetige: Soll die Aufgabe '${task.title}' als erledigt markiert werden?`,
    } as unknown as ConfirmationRequest);
  }

  // Confirmed — execute the update. `completed_at` is deliberately absent:
  // a database trigger (migration 0063) stamps it on the transition to
  // done, which is what keeps this writer in step with the Aufgaben list
  // without it having to know the list exists.
  const { error: updateError } = await ctx.client
    .from("tasks")
    .update({ status: "done" })
    .eq("id", taskId)
    .eq("family_id", ctx.familyId);

  if (updateError) {
    return JSON.stringify({ error: "Aufgabe konnte nicht aktualisiert werden." });
  }

  return JSON.stringify({
    success: true,
    task_id: task.id,
    titel: task.title,
    message: `Aufgabe '${task.title}' wurde als erledigt markiert.`,
  });
}

// ---------------------------------------------------------------------------
// graph_query — Knowledge Graph relational query
// ---------------------------------------------------------------------------

/**
 * Query the knowledge graph for entities related to a person, organization,
 * or keyword. Returns related documents, tasks, and deadlines in one call.
 *
 * Strategy:
 *   1. Find knowledge_nodes matching the entity name (ILIKE on label).
 *   2. Follow edges to find connected document IDs and task nodes.
 *   3. Fetch documents with metadata (type, category, summary, persons).
 *   4. Fetch tasks with metadata (title, due_date, document).
 *   5. Return everything in one structured response.
 *
 * This leverages the graph's relational structure so the LLM doesn't need
 * to chain search_documents + list_tasks and reason about the connection.
 */
async function executeGraphQuery(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const entity = String(args.entity ?? "").trim();
  if (!entity) return JSON.stringify({ error: "Keine Entitaet angegeben." });

  const include = (args.include as string[] | undefined) ?? ["documents", "tasks", "deadlines"];
  const upcomingDays = args.upcoming_days as number | undefined;
  const wantDocs = include.includes("documents");
  const wantTasks = include.includes("tasks") || include.includes("deadlines");
  const deadlinesOnly = include.includes("deadlines") && !include.includes("tasks");

  // 1. Find matching knowledge_nodes (person, organization, etc.)
  const { data: matchingNodes, error: nodesError } = await ctx.client
    .from("knowledge_nodes")
    .select("id, type, label")
    .eq("family_id", ctx.familyId)
    .or(`label.ilike.%${entity.toLowerCase()}%`);

  if (nodesError || !matchingNodes || matchingNodes.length === 0) {
    return JSON.stringify({
      entity,
      message: `Keine Treffer fuer '${entity}' im Wissensgraph gefunden.`,
      documents: [],
      tasks: [],
    });
  }

  const nodeIds = matchingNodes.map((n) => n.id);
  const nodeMap = new Map(matchingNodes.map((n) => [n.id, n]));

  // 2. Follow edges (both directions) to find connected document_ids
  const [incomingResult, outgoingResult] = await Promise.all([
    ctx.client
      .from("knowledge_edges")
      .select("source_node_id, target_node_id, source_document_id, relation_type, confidence, confirmed")
      .eq("family_id", ctx.familyId)
      .in("target_node_id", nodeIds),
    ctx.client
      .from("knowledge_edges")
      .select("source_node_id, target_node_id, source_document_id, relation_type, confidence, confirmed")
      .eq("family_id", ctx.familyId)
      .in("source_node_id", nodeIds),
  ]);

  const allEdges = [
    ...(incomingResult.data ?? []),
    ...(outgoingResult.data ?? []),
  ];

  // Collect document IDs from edges
  const documentIds = new Set<string>();
  for (const edge of allEdges) {
    if (edge.source_document_id) {
      documentIds.add(edge.source_document_id);
    }
  }

  // Also look up document nodes connected via edges
  const connectedNodeIds = new Set<string>();
  for (const edge of allEdges) {
    if (!nodeMap.has(edge.source_node_id)) connectedNodeIds.add(edge.source_node_id);
    if (!nodeMap.has(edge.target_node_id)) connectedNodeIds.add(edge.target_node_id);
  }

  if (connectedNodeIds.size > 0) {
    const { data: docNodes } = await ctx.client
      .from("knowledge_nodes")
      .select("id, properties_json")
      .eq("family_id", ctx.familyId)
      .eq("type", "document")
      .in("id", [...connectedNodeIds]);

    for (const node of docNodes ?? []) {
      const docId = node.properties_json?.document_id;
      if (docId && typeof docId === "string") {
        documentIds.add(docId);
      }
    }
  }

  // Build matched entity info
  const matchedEntities = matchingNodes.map((n) => ({
    name: n.label,
    typ: n.type,
  }));

  const result: {
    entity: string;
    matched: Array<{ name: string; typ: string }>;
    documents: Array<Record<string, unknown>>;
    tasks: Array<Record<string, unknown>>;
  } = {
    entity,
    matched: matchedEntities,
    documents: [],
    tasks: [],
  };

  // 3. Fetch documents with metadata
  if (wantDocs && documentIds.size > 0) {
    const docIds = [...documentIds];
    const [docResult, entityResult] = await Promise.all([
      ctx.client
        .from("documents")
        .select("id, title, document_type, category, summary, status")
        .eq("family_id", ctx.familyId)
        .eq("status", "confirmed")
        .in("id", docIds),
      ctx.client
        .from("extracted_entities")
        .select("document_id, entity_value")
        .eq("family_id", ctx.familyId)
        .eq("entity_type", "person")
        .eq("confirmed", true)
        .in("document_id", docIds),
    ]);

    const personMap = new Map<string, string[]>();
    for (const e of entityResult.data ?? []) {
      if (!e.entity_value) continue;
      if (!personMap.has(e.document_id)) personMap.set(e.document_id, []);
      personMap.get(e.document_id)!.push(e.entity_value);
    }

    // Accumulate sources for the API response
    for (const doc of docResult.data ?? []) {
      if (!ctx.sources.find((x) => x.document_id === doc.id)) {
        ctx.sources.push({
          document_id: doc.id,
          title: doc.title,
          excerpt: doc.summary ?? "",
          score: 1.0,
        } as ChatSource);
      }
    }

    result.documents = (docResult.data ?? []).map((d, i) => ({
      nr: i + 1,
      id: d.id,
      titel: d.title,
      typ: d.document_type,
      kategorie: d.category,
      zusammenfassung: d.summary,
      personen: personMap.get(d.id) ?? undefined,
    }));
  }

  // 4. Fetch tasks for the found documents
  if (wantTasks && documentIds.size > 0) {
    const docIds = [...documentIds];
    let taskQuery = ctx.client
      .from("tasks")
      .select("id, title, due_date, status, document_id")
      .eq("family_id", ctx.familyId)
      .eq("confirmed", true)
      .in("document_id", docIds);

    if (deadlinesOnly) {
      taskQuery = taskQuery.not("due_date", "is", null);
    }

    const { data: taskData } = await taskQuery.order("due_date", {
      ascending: true,
      nullsFirst: false,
    });

    let tasks = taskData ?? [];

    // Filter by upcoming days if requested
    if (upcomingDays !== undefined && upcomingDays > 0) {
      const now = new Date();
      const limit = new Date();
      limit.setDate(now.getDate() + upcomingDays);
      tasks = tasks.filter((t) => {
        if (!t.due_date) return false;
        const due = new Date(t.due_date);
        return due >= now && due <= limit;
      });
    }

    // Enrich with document titles
    const docTitleMap = new Map<string, string>();
    if (tasks.length > 0) {
      const taskDocIds = [...new Set(tasks.map((t) => t.document_id).filter(Boolean))] as string[];
      if (taskDocIds.length > 0) {
        const { data: taskDocs } = await ctx.client
          .from("documents")
          .select("id, title")
          .in("id", taskDocIds);
        for (const d of taskDocs ?? []) {
          docTitleMap.set(d.id, d.title ?? "");
        }
      }
    }

    result.tasks = tasks.map((t) => ({
      id: t.id,
      titel: t.title,
      frist: t.due_date,
      status: t.status,
      dokument: t.document_id ? (docTitleMap.get(t.document_id) ?? undefined) : undefined,
    }));
  }

  if (result.documents.length === 0 && result.tasks.length === 0) {
    return JSON.stringify({
      ...result,
      message: `Keine verwandten Dokumente oder Aufgaben fuer '${entity}' gefunden.`,
    });
  }

  return JSON.stringify(result);
}

// ---------------------------------------------------------------------------
// add_family_member (with confirmation gate)
// ---------------------------------------------------------------------------

/**
 * Add a new family member via chat.
 *
 * Inserts directly against `ctx.familyId` — deliberately NOT via the
 * `addFamilyMember` server action: its family resolution picks an
 * arbitrary RLS-visible family, which for accounts with multiple family
 * memberships (0024_family_memberships) could be a different family than
 * the one this chat is authorized for. Validation stays shared with the
 * /familie UI via `validateMember` (same schema, same German errors).
 * The insert is RLS-protected (user_belongs_to_family), so a member can
 * only write to their own family.
 */
async function executeAddFamilyMember(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const name = String(args.name ?? "").trim();
  if (!name) return JSON.stringify({ error: "Kein Name angegeben." });

  const confirmed = args.confirmed === true;
  if (!confirmed) {
    return JSON.stringify({
      needs_confirmation: true,
      member_name: name,
      message: `Bitte bestaetige: Soll '${name}' als neues Familienmitglied hinzugefuegt werden?`,
    });
  }

  const validation = validateMember({
    name,
    role: typeof args.role === "string" ? args.role : "",
    birthdate: typeof args.birthdate === "string" ? args.birthdate : "",
    avatar_color: "",
  });
  if (!validation.success) {
    return JSON.stringify({ error: validation.error });
  }

  const { data: member, error: insertError } = await ctx.client
    .from("family_members")
    .insert({
      family_id: ctx.familyId,
      name: validation.data.name,
      role: validation.data.role,
      birthdate: validation.data.birthdate,
      avatar_color: validation.data.avatar_color,
    })
    .select("id, name")
    .single();

  if (insertError || !member) {
    return JSON.stringify({
      error: "Familienmitglied konnte nicht angelegt werden.",
    });
  }

  // Mirror the role into the relationship list the /familie UI reads, so a
  // member added through chat is not the odd one out. Chat cannot name the
  // counterpart yet, so the relation has no target ("Mutter", not "Mutter
  // von Emma") — that is exactly what the UI shows for a plain role.
  if (validation.data.role) {
    const relationsSaved = await saveMemberRelations(ctx.client, {
      familyId: ctx.familyId,
      memberId: member.id,
      relations: [{ role: validation.data.role, member_ids: [] }],
    });
    if (!relationsSaved) {
      // A role that lives only on the member row is a trap: the next
      // ordinary edit reads an empty relation list and clears it. Undo the
      // insert rather than report a half-made member.
      await ctx.client.from("family_members").delete().eq("id", member.id);
      return JSON.stringify({
        error: "Familienmitglied konnte nicht angelegt werden.",
      });
    }
  }

  return JSON.stringify({
    success: true,
    member_id: member.id,
    name: member.name,
    message: `'${member.name}' wurde als Familienmitglied hinzugefuegt.`,
  });
}

// ---------------------------------------------------------------------------
// move_document_to_collection (with confirmation gate)
// ---------------------------------------------------------------------------

/**
 * Move a document into an existing collection by setting `documents.category`
 * to the collection's name — the same mechanism the /sammlungen pages use
 * to list a collection's documents (`category ilike collection.name`).
 * Only matches an existing collection; it never creates one, to avoid
 * accidental collection proliferation from typos.
 */
async function executeMoveDocumentToCollection(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const documentId = String(args.document_id ?? "").trim();
  const collectionName = String(args.collection_name ?? "").trim();
  if (!documentId || !collectionName) {
    return JSON.stringify({ error: "Dokument-ID oder Sammlungsname fehlt." });
  }

  const { data: doc, error: docError } = await ctx.client
    .from("documents")
    .select("id, title")
    .eq("id", documentId)
    .eq("family_id", ctx.familyId)
    .maybeSingle();

  if (docError || !doc) {
    return JSON.stringify({ error: "Dokument nicht gefunden." });
  }

  const { data: collections } = await ctx.client
    .from("collections")
    .select("name")
    .eq("family_id", ctx.familyId)
    .ilike("name", collectionName);

  const match = collections?.[0];
  if (!match) {
    const { data: allCollections } = await ctx.client
      .from("collections")
      .select("name")
      .eq("family_id", ctx.familyId);
    return JSON.stringify({
      error: `Keine Sammlung namens '${collectionName}' gefunden.`,
      verfuegbare_sammlungen: (allCollections ?? []).map((c) => c.name),
    });
  }

  const confirmed = args.confirmed === true;
  const documentTitle = doc.title ?? "Das Dokument";
  if (!confirmed) {
    return JSON.stringify({
      needs_confirmation: true,
      document_id: doc.id,
      document_title: documentTitle,
      collection_name: match.name,
      message: `Bitte bestaetige: Soll '${documentTitle}' in die Sammlung '${match.name}' verschoben werden?`,
    });
  }

  const { error: updateError } = await ctx.client
    .from("documents")
    .update({ category: match.name })
    .eq("id", doc.id)
    .eq("family_id", ctx.familyId);

  if (updateError) {
    return JSON.stringify({ error: "Dokument konnte nicht verschoben werden." });
  }

  return JSON.stringify({
    success: true,
    document_id: doc.id,
    document_title: documentTitle,
    collection_name: match.name,
    message: `'${documentTitle}' wurde in die Sammlung '${match.name}' verschoben.`,
  });
}

// ---------------------------------------------------------------------------
// add_document_tags (with confirmation gate)
// ---------------------------------------------------------------------------

/**
 * Add one or more tags to a document, deduping against existing tags.
 */
async function executeAddDocumentTags(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const documentId = String(args.document_id ?? "").trim();
  const newTags = (Array.isArray(args.tags) ? args.tags : [])
    .map((t) => String(t).trim())
    .filter(Boolean);

  if (!documentId || newTags.length === 0) {
    return JSON.stringify({ error: "Dokument-ID oder Tags fehlen." });
  }

  const { data: doc, error: docError } = await ctx.client
    .from("documents")
    .select("id, title, tags")
    .eq("id", documentId)
    .eq("family_id", ctx.familyId)
    .maybeSingle();

  if (docError || !doc) {
    return JSON.stringify({ error: "Dokument nicht gefunden." });
  }

  const documentTitle = doc.title ?? "Das Dokument";
  const mergedTags = [...new Set([...(doc.tags ?? []), ...newTags])];

  const confirmed = args.confirmed === true;
  if (!confirmed) {
    return JSON.stringify({
      needs_confirmation: true,
      document_id: doc.id,
      document_title: documentTitle,
      tags: newTags,
      message: `Bitte bestaetige: Sollen dem Dokument '${documentTitle}' die Schlagworte ${newTags.join(", ")} hinzugefuegt werden?`,
    });
  }

  const { error: updateError } = await ctx.client
    .from("documents")
    .update({ tags: mergedTags })
    .eq("id", doc.id)
    .eq("family_id", ctx.familyId);

  if (updateError) {
    return JSON.stringify({ error: "Schlagworte konnten nicht gespeichert werden." });
  }

  return JSON.stringify({
    success: true,
    document_id: doc.id,
    document_title: documentTitle,
    tags: mergedTags,
    message: `Dem Dokument '${documentTitle}' wurden die Schlagworte ${newTags.join(", ")} hinzugefuegt.`,
  });
}

// ---------------------------------------------------------------------------
// save_document_fact (with confirmation gate)
// ---------------------------------------------------------------------------

/**
 * Save or correct a typed fact (serial number, contract number, IBAN, …)
 * on a document — the agentic path for "Merk dir: die Seriennummer der
 * Waschmaschine ist …". If a fact of the same type already exists on the
 * document (matching the given label when provided), it is CORRECTED;
 * otherwise a new fact is added. User-provided facts are stored with
 * confidence 1.0 and confirmed=true, so the fact search picks them up
 * immediately — no reindex.
 */
async function executeSaveDocumentFact(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const documentId = String(args.document_id ?? "").trim();
  const value = String(args.value ?? "").trim();
  if (!documentId || !value) {
    return JSON.stringify({
      error: "Dokument-ID oder Wert fehlt.",
    });
  }

  const { data: doc, error: docError } = await ctx.client
    .from("documents")
    .select("id, title")
    .eq("id", documentId)
    .eq("family_id", ctx.familyId)
    .maybeSingle();

  if (docError || !doc) {
    return JSON.stringify({ error: "Dokument nicht gefunden." });
  }

  const requestedLabel =
    typeof args.label === "string" && args.label.trim()
      ? args.label.trim()
      : null;
  const factLabel = requestedLabel ?? DEFAULT_FACT_LABEL;
  const documentTitle = doc.title ?? "Das Dokument";

  // Existing fact with the same label → this is a correction, not an add.
  // Without a label to match on, a save must never guess which of the
  // document's numbers it is supposed to overwrite — it adds one.
  const { data: existingFacts } = await ctx.client
    .from("document_facts")
    .select("id, label, value")
    .eq("document_id", doc.id)
    .eq("family_id", ctx.familyId);
  const existing = requestedLabel
    ? existingFacts?.find(
        (f) => f.label.toLowerCase() === requestedLabel.toLowerCase(),
      )
    : undefined;

  const confirmed = args.confirmed === true;
  if (!confirmed) {
    return JSON.stringify({
      needs_confirmation: true,
      document_id: doc.id,
      document_title: documentTitle,
      // The card must disclose when this "add" actually overwrites an
      // existing number of the same name — otherwise a person would
      // confirm a correction (e.g. of an IBAN) without ever seeing the
      // old value.
      label: factLabel,
      value,
      existing_value: existing ? existing.value : null,
      message: existing
        ? `Bitte bestaetige: Soll die ${factLabel} von '${documentTitle}' von '${existing.value}' zu '${value}' korrigiert werden?`
        : `Bitte bestaetige: Soll die ${factLabel} '${value}' bei '${documentTitle}' hinterlegt werden?`,
    });
  }

  if (existing) {
    const { error: updateError } = await ctx.client
      .from("document_facts")
      .update({
        value,
        normalized_value: normalizeFactValue(value),
        confidence: 1.0,
        confirmed: true,
        ...(requestedLabel ? { label: requestedLabel } : {}),
      })
      .eq("id", existing.id)
      .eq("family_id", ctx.familyId);
    if (updateError) {
      return JSON.stringify({ error: "Die Nummer konnte nicht korrigiert werden." });
    }
    return JSON.stringify({
      success: true,
      action: "corrected",
      document_id: doc.id,
      document_title: documentTitle,
      message: `Die ${factLabel} von '${documentTitle}' wurde zu '${value}' korrigiert (vorher: '${existing.value}').`,
    });
  }

  const { error: insertError } = await ctx.client
    .from("document_facts")
    .insert({
      document_id: doc.id,
      family_id: ctx.familyId,
      fact_type: IDENTIFIER_FACT_TYPE,
      label: factLabel,
      value,
      normalized_value: normalizeFactValue(value),
      confidence: 1.0,
      confirmed: true,
    });
  if (insertError) {
    return JSON.stringify({ error: "Die Nummer konnte nicht gespeichert werden." });
  }
  return JSON.stringify({
    success: true,
    action: "added",
    document_id: doc.id,
    document_title: documentTitle,
    message: `Die ${factLabel} '${value}' wurde bei '${documentTitle}' hinterlegt.`,
  });
}

// ---------------------------------------------------------------------------
// update_task (with confirmation gate)
// ---------------------------------------------------------------------------

/**
 * Update an existing task's fields — the chat counterpart of the task
 * detail sheet (title, description, due date, assignee) plus
 * reopening a done task. Only provided fields are changed; an empty
 * string for due_date / description / assignee_name CLEARS the value,
 * so "die Frist kann weg" works as well as "neue Frist".
 */
async function executeUpdateTask(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const taskId = String(args.task_id ?? "").trim();
  if (!taskId) {
    return JSON.stringify({ error: "Keine Aufgaben-ID angegeben." });
  }

  const { data: task, error: fetchError } = await ctx.client
    .from("tasks")
    .select("id, title, status")
    .eq("id", taskId)
    .eq("family_id", ctx.familyId)
    .maybeSingle();

  if (fetchError || !task) {
    return JSON.stringify({ error: "Aufgabe nicht gefunden." });
  }

  // Collect the requested changes (only provided fields).
  const updates: Database["public"]["Tables"]["tasks"]["Update"] = {};
  const changes: string[] = [];

  if (typeof args.title === "string" && args.title.trim()) {
    updates.title = args.title.trim();
    changes.push(`Titel: '${updates.title}'`);
  }
  if (typeof args.description === "string") {
    const description = args.description.trim();
    updates.description = description || null;
    changes.push(description ? "Beschreibung geaendert" : "Beschreibung entfernt");
  }
  if (typeof args.due_date === "string") {
    const dueDate = args.due_date.trim();
    updates.due_date = dueDate || null;
    changes.push(dueDate ? `Frist: ${dueDate}` : "Frist entfernt");
  }
  if (
    typeof args.status === "string" &&
    ["open", "done"].includes(args.status)
  ) {
    updates.status = args.status;
    changes.push(
      args.status === "done" ? "als erledigt markiert" : "wieder geoeffnet",
    );
  }

  // The assignee resolves to a family member id. An unknown name is an
  // error — silently storing null would CLEAR the assignment, the exact
  // opposite of what the user asked for.
  if (typeof args.assignee_name === "string") {
    const assigneeName = args.assignee_name.trim();
    if (assigneeName) {
      const { data: member } = await ctx.client
        .from("family_members")
        .select("id, name")
        .eq("family_id", ctx.familyId)
        .ilike("name", assigneeName)
        .maybeSingle();
      if (!member) {
        return JSON.stringify({
          error: `Kein Familienmitglied namens '${assigneeName}' gefunden.`,
        });
      }
      updates.assigned_to = member.id;
      changes.push(`zustaendig: ${member.name}`);
    } else {
      updates.assigned_to = null;
      changes.push("Zuordnung entfernt");
    }
  }

  if (Object.keys(updates).length === 0) {
    return JSON.stringify({
      error:
        "Keine Aenderung angegeben. Nenne mindestens ein Feld " +
        "(Titel, Beschreibung, Frist, Person oder Status).",
    });
  }

  const confirmed = args.confirmed === true;
  if (!confirmed) {
    return JSON.stringify({
      needs_confirmation: true,
      task_id: task.id,
      task_title: task.title,
      aenderungen: changes,
      message: `Bitte bestaetige: Soll ich die Aufgabe '${task.title}' aendern (${changes.join(", ")})?`,
    });
  }

  // `completed_at` is maintained by a database trigger (migration 0063),
  // so changing `status` here both stamps a completion and clears one on
  // reopening, with no bookkeeping in this tool.
  const { error: updateError } = await ctx.client
    .from("tasks")
    .update(updates)
    .eq("id", task.id)
    .eq("family_id", ctx.familyId);

  if (updateError) {
    return JSON.stringify({
      error: "Aufgabe konnte nicht aktualisiert werden.",
    });
  }

  const newTitle = updates.title ?? task.title;
  return JSON.stringify({
    success: true,
    task_id: task.id,
    titel: newTitle,
    aenderungen: changes,
    message: `Aufgabe '${newTitle}' wurde aktualisiert (${changes.join(", ")}).`,
  });
}

// ---------------------------------------------------------------------------
// create_collection (with confirmation gate)
// ---------------------------------------------------------------------------

/**
 * Create a new collection via chat.
 *
 * Inserts directly against `ctx.familyId` — deliberately NOT via the
 * `createCollection` server action: its `getUserFamily()` picks an
 * arbitrary RLS-visible family (`.limit(1)`), which for accounts with
 * multiple family memberships (0024_family_memberships) could be a
 * different family than the one this chat is authorized for. Validation
 * (name/icon/color) is shared with the UI via `validateCollectionInput`.
 */
async function executeCreateCollection(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const name = String(args.name ?? "").trim();
  if (!name) return JSON.stringify({ error: "Kein Name angegeben." });

  const confirmed = args.confirmed === true;
  if (!confirmed) {
    return JSON.stringify({
      needs_confirmation: true,
      collection_name: name,
      message: `Bitte bestaetige: Soll ich die Sammlung '${name}' anlegen?`,
    });
  }

  const validation = validateCollectionInput({
    name,
    icon: typeof args.icon === "string" ? args.icon : "file-text",
    color: typeof args.color === "string" ? args.color : "petrol",
  });
  if (!validation.success) {
    return JSON.stringify({ error: validation.error });
  }

  const { data: collection, error: insertError } = await ctx.client
    .from("collections")
    .insert({
      family_id: ctx.familyId,
      name: validation.data.name,
      icon: validation.data.icon,
      color: validation.data.color,
    })
    .select("id, name")
    .single();

  if (insertError || !collection) {
    // Unique violation → a collection with this name already exists.
    if (insertError?.code === "23505") {
      return JSON.stringify({ error: "Diese Sammlung gibt es schon." });
    }
    return JSON.stringify({ error: "Sammlung konnte nicht angelegt werden." });
  }

  return JSON.stringify({
    success: true,
    collection_id: collection.id,
    name: collection.name,
    message:
      `Die Sammlung '${collection.name}' wurde angelegt. ` +
      "Du kannst jetzt Dokumente hineinlegen.",
  });
}

// ---------------------------------------------------------------------------
// create_note (with confirmation gate)
// ---------------------------------------------------------------------------

/** Caps mirror the noteSchema in POST /api/documents/notes. */
const NOTE_TITLE_MAX = 200;
const NOTE_CONTENT_MAX = 10_000;

/**
 * Save a free-text note as a manual document — the agentic path for
 * "Notier dir: …". Mirrors the note editor flow: insert with status
 * "confirmed" because the person supplied its text. It may still run the
 * shared analyze step for search and organization, but keeps that confirmed
 * status and never joins the review queue.
 *
 * With document_type "credentials" it is also the agentic path for "Leg
 * mir die Zugangsdaten fuer X an": url and username are folded into the
 * body by the same rule the note sheet uses. A password is never accepted
 * here — see the note on `secret` below.
 */
async function executeCreateNote(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const title = String(args.title ?? "").trim();
  const rawType = String(args.document_type ?? "other");
  const documentType: DocumentType = (
    DOCUMENT_TYPES as readonly string[]
  ).includes(rawType)
    ? (rawType as DocumentType)
    : "other";
  const isCredentials = documentType === "credentials";

  const content = isCredentials
    ? buildCredentialsContent({
        title,
        url: String(args.url ?? ""),
        username: String(args.username ?? ""),
        description: String(args.content ?? ""),
      })
    : String(args.content ?? "").trim();

  if (!title) return JSON.stringify({ error: "Kein Titel angegeben." });
  if (!content) return JSON.stringify({ error: "Kein Notiztext angegeben." });
  if (title.length > NOTE_TITLE_MAX) {
    return JSON.stringify({
      error: `Titel ist zu lang (max. ${NOTE_TITLE_MAX} Zeichen).`,
    });
  }
  if (content.length > NOTE_CONTENT_MAX) {
    return JSON.stringify({
      error: `Notiz ist zu lang (max. ${NOTE_CONTENT_MAX} Zeichen).`,
    });
  }

  const confirmed = args.confirmed === true;
  if (!confirmed) {
    return JSON.stringify({
      needs_confirmation: true,
      note_title: title,
      message: isCredentials
        ? `Bitte bestaetige: Soll ich die Zugangsdaten '${title}' anlegen?`
        : `Bitte bestaetige: Soll ich die Notiz '${title}' speichern?`,
    });
  }

  // uploaded_by comes from the same session the chat route authenticated.
  const {
    data: { user },
  } = await ctx.client.auth.getUser();
  if (!user) {
    return JSON.stringify({ error: "Notiz konnte nicht gespeichert werden." });
  }

  // Same insert as POST /api/documents/notes (minus the optional image
  // attachment, which chat cannot provide).
  const documentId = crypto.randomUUID();
  const { data: docRow, error: insertError } = await ctx.client
    .from("documents")
    .insert({
      id: documentId,
      family_id: ctx.familyId,
      uploaded_by: user.id,
      status: "confirmed",
      source: "manual",
      title,
      document_type: documentType,
      // `secret` stays null on purpose. The chat never carries a password:
      // it would pass through the model and be persisted verbatim in the
      // chat history, which is exactly what the encrypted column avoids.
      // The family member sets it in the document itself.
      ocr_text: content,
      page_count: 1,
    })
    .select("id")
    .single();

  if (insertError || !docRow) {
    return JSON.stringify({ error: "Notiz konnte nicht gespeichert werden." });
  }

  // Page row so the analysis reads the text (it falls back to ocr_text).
  await ctx.client.from("document_pages").insert({
    document_id: documentId,
    page_number: 1,
    ocr_markdown: content,
  });

  // Enrich the confirmed note with the shared analysis step. The final
  // status remains confirmed because wasConfirmed is true.
  const { data: transitioned } = await ctx.client
    .from("documents")
    .update({ status: "analyzing" })
    .eq("id", documentId)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();

  if (!transitioned) {
    // Unexpected right after insert — the note still exists.
    return JSON.stringify({
      success: true,
      document_id: documentId,
      titel: title,
      analysiert: false,
      message: `Notiz '${title}' wurde gespeichert.`,
    });
  }

  try {
    await performAnalyzeStep(ctx.client, {
      id: documentId,
      family_id: ctx.familyId,
      ocr_text: content,
      // The user named this note in the chat — analysis must not rename it.
      source: "manual",
      title,
      // Only pinned when the user picked a real type: "Zugangsdaten" must
      // survive the analysis, while a plain note still gets classified.
      document_type: isCredentials ? documentType : undefined,
      wasConfirmed: true,
    });
  } catch (err) {
    // The note itself is saved and confirmed — only the enrichment failed.
    // Marking it `failed` would show the user an unusable error card for a
    // note that is perfectly intact (the message below says as much).
    //
    // A destructive failure is the exception: it can leave the note's
    // stored results half-replaced, and only the visible failed state gets
    // the user to retry it.
    if (isDestructiveAnalysisFailure(err)) {
      await markDocumentFailed(
        ctx.client,
        documentId,
        err instanceof Error ? err.message : "Analyse ist fehlgeschlagen.",
        {
          stage: "analysis",
          code: "ANALYSIS_FAILED",
          cause: err,
          familyId: ctx.familyId,
        },
      );
    } else {
      await restoreConfirmedAfterAnalysisFailure(ctx.client, documentId, {
        stage: "analysis",
        code: "ANALYSIS_FAILED",
        cause: err,
        familyId: ctx.familyId,
      });
    }
    return JSON.stringify({
      success: true,
      document_id: documentId,
      titel: title,
      analysiert: false,
      message:
      `Notiz '${title}' wurde gespeichert. Die automatische ` +
        "Sortierung hat nicht geklappt, aber deine Notiz ist sicher gespeichert.",
    });
  }

  return JSON.stringify({
    success: true,
    document_id: documentId,
    titel: title,
    analysiert: true,
    message: isCredentials
      ? `Zugangsdaten '${title}' wurden angelegt. Das Passwort kann im ` +
        "Dokument selbst hinterlegt werden — ueber den Chat wird keines gespeichert."
      : `Notiz '${title}' wurde gespeichert.`,
  });
}

// ---------------------------------------------------------------------------
// update_note (with confirmation gate)
// ---------------------------------------------------------------------------

async function executeUpdateNote(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const documentId = String(args.document_id ?? "").trim();
  const addition = String(args.append_content ?? "").trim();

  if (!documentId) {
    return JSON.stringify({ error: "Keine Notiz angegeben." });
  }
  if (!addition) {
    return JSON.stringify({ error: "Keine Ergänzung angegeben." });
  }
  if (addition.length > NOTE_CONTENT_MAX) {
    return JSON.stringify({
      error: `Ergänzung ist zu lang (max. ${NOTE_CONTENT_MAX} Zeichen).`,
    });
  }

  const { data: note, error: readError } = await ctx.client
    .from("documents")
    .select("id, title, source, status, document_type")
    .eq("id", documentId)
    .eq("family_id", ctx.familyId)
    .maybeSingle();

  if (readError || !note) {
    return JSON.stringify({ error: "Notiz wurde nicht gefunden." });
  }
  if (
    note.source !== "manual" ||
    note.status !== "confirmed" ||
    note.document_type === "credentials"
  ) {
    return JSON.stringify({
      error: "Diese Notiz kann über den Chat nicht geändert werden.",
    });
  }

  const title = note.title?.trim() || "Notiz";
  if (args.confirmed !== true) {
    return JSON.stringify({
      needs_confirmation: true,
      note_title: title,
      message: `Bitte bestätige die Ergänzung für „${title}“.`,
    });
  }

  const { data, error } = await ctx.client.rpc("append_to_manual_note", {
    p_document_id: documentId,
    p_family_id: ctx.familyId,
    p_append_content: addition,
  });
  const result = data?.[0];

  if (error || !result || result.result_status === "not_found") {
    return JSON.stringify({ error: "Notiz wurde nicht gefunden." });
  }
  if (result.result_status === "invalid_note") {
    return JSON.stringify({
      error: "Diese Notiz kann über den Chat nicht geändert werden.",
    });
  }
  if (result.result_status === "too_long") {
    return JSON.stringify({
      error: `Notiz ist zu lang (max. ${NOTE_CONTENT_MAX} Zeichen).`,
    });
  }
  if (
    result.result_status !== "updated" &&
    result.result_status !== "already_updated"
  ) {
    return JSON.stringify({ error: "Notiz konnte nicht geändert werden." });
  }

  return JSON.stringify({
    success: true,
    document_id: documentId,
    titel: result.note_title ?? title,
    already_updated: result.result_status === "already_updated",
    message:
      result.result_status === "already_updated"
        ? `Notiz '${title}' enthielt diese Ergänzung bereits.`
        : `Notiz '${title}' wurde ergänzt.`,
  });
}
