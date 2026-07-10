/**
 * Proactive intelligence insights for the home dashboard.
 *
 * Computes contextual hints from the knowledge graph, tasks, and document
 * metadata — e.g. "Frist läuft in 2 Tagen ab", "3 unbezahlte Rechnungen",
 * "Neue Dokumente von der Stadtwerke".
 *
 * All queries are RLS-scoped via the server Supabase client.
 */

type ServerClient = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

export interface HomeInsight {
  id: string;
  /** Icon name from lucide-react that best represents this insight. */
  icon: "alert" | "receipt" | "building" | "calendar";
  /** German headline, e.g. "Frist läuft in 2 Tagen ab". */
  title: string;
  /** Optional detail line, e.g. "Schulranzen kaufen — fällig am 15.07.2026". */
  detail?: string;
  /** Route to navigate to when the user taps the insight. */
  href: string;
  /** Visual emphasis: apricot for urgent, petrol for informational. */
  tone: "urgent" | "info";
}

/**
 * Compute proactive insights for the home dashboard.
 *
 * @param serverClient - RLS-scoped Supabase server client.
 * @param familyId - The family to compute insights for.
 * @returns Up to 3 insights, sorted by urgency (urgent first).
 */
export async function computeInsights(
  serverClient: ServerClient,
  familyId: string,
): Promise<HomeInsight[]> {
  const [deadlineInsights, docTypeInsights, orgInsights] = await Promise.all([
    fetchDeadlineInsights(serverClient, familyId),
    fetchDocTypeInsights(serverClient, familyId),
    fetchOrgInsights(serverClient, familyId),
  ]);

  const all = [...deadlineInsights, ...docTypeInsights, ...orgInsights];

  // Sort: urgent first, then by relevance
  all.sort((a, b) => {
    if (a.tone === "urgent" && b.tone !== "urgent") return -1;
    if (a.tone !== "urgent" && b.tone === "urgent") return 1;
    return 0;
  });

  return all.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Deadline insights — open tasks with due dates within 3 days
// ---------------------------------------------------------------------------

async function fetchDeadlineInsights(
  client: ServerClient,
  familyId: string,
): Promise<HomeInsight[]> {
  const now = new Date();
  const in3Days = new Date();
  in3Days.setDate(now.getDate() + 3);
  const nowStr = now.toISOString().split("T")[0];
  const in3DaysStr = in3Days.toISOString().split("T")[0];

  const { data: tasks } = await client
    .from("tasks")
    .select("id, title, due_date, priority, document_id")
    .eq("family_id", familyId)
    .eq("status", "open")
    .eq("confirmed", true)
    .not("due_date", "is", null)
    .gte("due_date", nowStr)
    .lte("due_date", in3DaysStr)
    .order("due_date", { ascending: true })
    .limit(2);

  if (!tasks || tasks.length === 0) return [];

  return tasks.map((task) => {
    const due = new Date(task.due_date);
    const daysLeft = Math.ceil(
      (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    const day = String(due.getDate()).padStart(2, "0");
    const month = String(due.getMonth() + 1).padStart(2, "0");
    const year = due.getFullYear();

    return {
      id: `deadline-${task.id}`,
      icon: "calendar" as const,
      title:
        daysLeft <= 1
          ? "Frist läuft morgen ab"
          : `Frist läuft in ${daysLeft} Tagen ab`,
      detail: `${task.title} — fällig am ${day}.${month}.${year}`,
      href: task.document_id
        ? `/dokumente?doc=${task.document_id}`
        : "/aufgaben",
      tone: (daysLeft <= 1 ? "urgent" : "info") as "urgent" | "info",
    };
  });
}

// ---------------------------------------------------------------------------
// Document type insights — count confirmed docs by document_type
// ---------------------------------------------------------------------------

/** German labels for common document types with count suffix. */
const DOC_TYPE_LABELS: Record<string, { singular: string; plural: string }> = {
  invoice: { singular: "Rechnung", plural: "Rechnungen" },
  receipt: { singular: "Quittung", plural: "Quittungen" },
  contract: { singular: "Vertrag", plural: "Verträge" },
  letter: { singular: "Brief", plural: "Briefe" },
  medical: { singular: "Arztbrief", plural: "Arztbriefe" },
  insurance: { singular: "Versicherungsdokument", plural: "Versicherungsdokumente" },
  tax: { singular: "Steuerdokument", plural: "Steuerdokumente" },
  bank_statement: { singular: "Kontoauszug", plural: "Kontoauszüge" },
};

async function fetchDocTypeInsights(
  client: ServerClient,
  familyId: string,
): Promise<HomeInsight[]> {
  const { data: docs } = await client
    .from("documents")
    .select("document_type")
    .eq("family_id", familyId)
    .eq("status", "confirmed")
    .not("document_type", "is", null);

  if (!docs || docs.length === 0) return [];

  // Count by document_type
  const counts = new Map<string, number>();
  for (const doc of docs) {
    const type = doc.document_type;
    if (type) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }

  // Only show insights for types with >= 2 documents and a known label
  const insights: HomeInsight[] = [];
  for (const [type, count] of counts) {
    const labels = DOC_TYPE_LABELS[type];
    if (!labels || count < 2) continue;

    insights.push({
      id: `doctype-${type}`,
      icon: "receipt",
      title: `${count} ${count === 1 ? labels.singular : labels.plural}`,
      detail: "In deiner Sammlung",
      href: "/suche",
      tone: "info",
    });
  }

  return insights.slice(0, 1);
}

// ---------------------------------------------------------------------------
// Organization insights — recent documents from known organizations
// ---------------------------------------------------------------------------

async function fetchOrgInsights(
  client: ServerClient,
  familyId: string,
): Promise<HomeInsight[]> {
  // Find organizations that have at least 2 confirmed documents
  const { data: orgEntities } = await client
    .from("extracted_entities")
    .select("entity_value, normalized_value, document_id")
    .eq("family_id", familyId)
    .eq("entity_type", "organization")
    .order("created_at", { ascending: false });

  if (!orgEntities || orgEntities.length === 0) return [];

  // Count documents per organization (by normalized_value)
  const orgDocCounts = new Map<string, { name: string; docIds: Set<string> }>();
  for (const entity of orgEntities) {
    const key = entity.normalized_value ?? entity.entity_value.toLowerCase();
    const existing = orgDocCounts.get(key);
    if (existing) {
      existing.docIds.add(entity.document_id);
    } else {
      orgDocCounts.set(key, {
        name: entity.entity_value,
        docIds: new Set([entity.document_id]),
      });
    }
  }

  // Find organizations with >= 2 documents
  const insights: HomeInsight[] = [];
  for (const [, { name, docIds }] of orgDocCounts) {
    if (docIds.size >= 2) {
      insights.push({
        id: `org-${name.toLowerCase().replace(/\s+/g, "-")}`,
        icon: "building",
        title: `${docIds.size} Dokumente von ${name}`,
      detail: "Gesammelt von dieser Organisation",
        href: `/suche?q=${encodeURIComponent(name)}`,
        tone: "info",
      });
    }
  }

  return insights.slice(0, 1);
}
