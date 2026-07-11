import type OpenAI from "openai";
import type { ChatSource } from "@/lib/schemas/chat";
import { redactPII } from "@/lib/ai/pii-redact";
import {
  hybridSearch,
  graphSearch,
} from "@/lib/ai/search";
import {
  filterByRelevanceThreshold,
  combineSearchResults,
} from "@/lib/ai/chat";
import { rerankResults } from "@/lib/ai/reranking";
import { addFamilyMember } from "@/app/(app)/familie/actions";

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

export const TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
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
      name: "present_answer_card",
      description:
        "Zeigt die Antwort als strukturierte Karte statt als Fliesstext an. " +
        "Verwende dies NUR, wenn die Antwort GENAU EIN konkretes Ergebnis " +
        "mit mehreren Detailfeldern beschreibt (z.B. ein Termin, eine Frist, " +
        "eine Rechnung, eine einzelne Aufgabe). Verwende dies NICHT fuer " +
        "Listen mit mehreren Elementen, allgemeine Erklaerungen, " +
        "Begruessungen/Smalltalk oder wenn die Quellen die Frage nicht " +
        "beantworten (dann normal in Text antworten).",
      parameters: {
        type: "object",
        properties: {
          card_type: {
            type: "string",
            enum: ["termin", "aufgabe", "dokument", "allgemein"],
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
            description: "1-6 Detailfelder als Label/Wert-Paare.",
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
];

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
    case "search_documents":
      return executeSearchDocuments(args, ctx);
    case "list_tasks":
      return executeListTasks(args, ctx);
    case "list_family_members":
      return executeListFamilyMembers(ctx);
    case "mark_task_done":
      return executeMarkTaskDone(args, ctx);
    case "graph_query":
      return executeGraphQuery(args, ctx);
    case "add_family_member":
      return executeAddFamilyMember(args);
    case "move_document_to_collection":
      return executeMoveDocumentToCollection(args, ctx);
    case "add_document_tags":
      return executeAddDocumentTags(args, ctx);
    default:
      return JSON.stringify({ error: `Unbekanntes Tool: ${name}` });
  }
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

async function executeListTasks(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const status = String(args.status ?? "open");
  const upcomingDays = args.upcoming_days as number | undefined;

  let query = ctx.client
    .from("tasks")
    .select("id, title, due_date, priority, status, confirmed, document_id")
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
      prioritaet: t.priority,
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

  return JSON.stringify({
    members: data.map((m) => ({
      id: m.id,
      name: m.name,
      rolle: m.role,
      geburtsdatum: m.birthdate,
    })),
  });
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
export const CONFIRMATION_TOOLS = new Set([
  "mark_task_done",
  "add_family_member",
  "move_document_to_collection",
  "add_document_tags",
]);

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

  // Confirmed — execute the update.
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
 *   4. Fetch tasks with metadata (title, due_date, priority, document).
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
      .select("id, title, due_date, priority, status, document_id")
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
      prioritaet: t.priority,
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
 * Add a new family member via chat. Reuses the existing `addFamilyMember`
 * server action so validation, error messages, and ownership checks stay
 * in one place — the same action the /familie UI form calls.
 */
async function executeAddFamilyMember(
  args: Record<string, unknown>,
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

  const result = await addFamilyMember({
    name,
    role: typeof args.role === "string" ? args.role : undefined,
    birthdate: typeof args.birthdate === "string" ? args.birthdate : undefined,
  });

  if (!result.success) {
    return JSON.stringify({ error: result.error });
  }

  return JSON.stringify({
    success: true,
    member_id: result.data.id,
    name: result.data.name,
    message: `'${result.data.name}' wurde als Familienmitglied hinzugefuegt.`,
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
