// Knowledge graph end-to-end against a real PostgreSQL + PostgREST with all
// migrations applied (scripts/graph-test-db/start.sh). The graph is built by
// the real confirm_document RPC and read through RLS as a family member, so
// this exercises the same SQL, filters and policies as production.
// Without GRAPH_TEST_REST_URL the suite is skipped (CI has no database).
import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PostgrestClient } from "@supabase/postgrest-js";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ withScope: vi.fn(), captureException: vi.fn() }));
// No model calls: query expansion and node embeddings degrade gracefully.
vi.mock("@/lib/ai/query-expansion", () => ({ expandQuery: vi.fn(async () => null) }));
vi.mock("@/lib/ai/embeddings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/embeddings")>()),
  getQueryEmbedding: vi.fn(async () => {
    throw new Error("no embeddings in the graph integration test");
  }),
}));

import { executeTool, type ToolContext } from "@/lib/ai/tools";
import { graphSearch } from "@/lib/ai/search";

const REST_URL = process.env.GRAPH_TEST_REST_URL;
const DB_URL = process.env.GRAPH_TEST_DB_URL;
const JWT_SECRET = process.env.GRAPH_TEST_JWT_SECRET;

function jwt(claims: Record<string, unknown>): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${body}.${createHmac("sha256", JWT_SECRET!).update(body).digest("base64url")}`;
}

function sql(statement: string) {
  execFileSync("psql", [DB_URL!, "-q", "-v", "ON_ERROR_STOP=1", "-c", statement], { stdio: "pipe" });
}

const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
const inDays = (n: number) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Fixture: Familie Becker. Oma Anna and daughter Hannah share four letters;
// son Max shares three with his teacher Maximilian Weber.
// ---------------------------------------------------------------------------
const familyId = randomUUID();
const otherFamilyId = randomUUID();
const userId = randomUUID();
const otherUserId = randomUUID();
const member = {
  sabine: { id: randomUUID(), name: "Sabine", role: "Mutter" },
  thomas: { id: randomUUID(), name: "Thomas", role: "Vater" },
  hannah: { id: randomUUID(), name: "Hannah", role: "Tochter" },
  max: { id: randomUUID(), name: "Max", role: "Sohn" },
  anna: { id: randomUUID(), name: "Anna", role: "Oma" },
};

type Person = { name: string; member?: keyof typeof member; confidence?: number | null };
type Org = { name: string; type: string; confidence?: number | null };
interface DocSpec {
  key: string;
  title: string;
  persons?: Person[];
  orgs?: Org[];
  tasks?: Array<{ title: string; due_date: string | null }>;
  family?: "own" | "other";
}

const DOCS: DocSpec[] = [
  {
    key: "ticket", title: "Deutschlandticket Abo",
    persons: [{ name: "Hannah Becker", member: "hannah" }],
    orgs: [{ name: "Deutsche Bahn", type: "Verkehrsunternehmen" }],
    tasks: [{ title: "Abo verlängern oder kündigen", due_date: today }],
  },
  {
    key: "zeugnis", title: "Zeugnis 5. Klasse",
    persons: [{ name: "Max Becker", member: "max" }, { name: "Maximilian Weber" }],
    orgs: [{ name: "Gymnasium am Rosenpark", type: "Schule" }],
  },
  {
    key: "elternbrief", title: "Elternbrief Klassenfahrt",
    persons: [{ name: "Maximilian Weber" }],
    orgs: [{ name: "Gymnasium am Rosenpark", type: "Schule" }],
    tasks: [{ title: "Einverständnis abgeben", due_date: inDays(30) }],
  },
  {
    key: "rente", title: "Rentenbescheid",
    persons: [{ name: "Anna Becker", member: "anna" }],
    orgs: [{ name: "Deutsche Rentenversicherung Bund", type: "Behörde" }],
  },
  {
    // Extraction without confidences: the confirm RPC stores 0.0.
    key: "zahnrechnung", title: "Rechnung Füllungstherapie",
    persons: [{ name: "Hannah Becker", member: "hannah", confidence: null }],
    orgs: [{ name: "Praxis Dr. Linden", type: "Zahnarztpraxis", confidence: null }],
  },
  {
    key: "kostenplan", title: "Heil- und Kostenplan Zahnspange",
    persons: [{ name: "Hannah Becker", member: "hannah" }],
    orgs: [{ name: "Praxis Dr. Linden", type: "Zahnarztpraxis" }],
  },
  {
    key: "praxisinfo", title: "Neue Öffnungszeiten",
    orgs: [{ name: "Praxis Dr. Linden", type: "Zahnarztpraxis" }],
  },
  {
    key: "miete", title: "Mietvertrag Wohnung",
    persons: [{ name: "Sabine Becker", member: "sabine" }, { name: "Thomas Becker", member: "thomas" }],
    orgs: [{ name: "Hausverwaltung Schmidt, Meyer & Partner", type: "Hausverwaltung" }],
  },
  {
    key: "grundsteuer", title: "Grundsteuerbescheid",
    orgs: [{ name: "Gemeinde Oberhaching", type: "Behörde" }],
  },
  {
    key: "kindergeld", title: "Bescheid Kindergeld",
    persons: [{ name: "Sabine Becker", member: "sabine" }],
    orgs: [{ name: "Familienkasse der Bundesagentur für Arbeit", type: "Behörde" }],
  },
  {
    key: "fremd", title: "Fremdes Zeugnis Hannah", family: "other",
    persons: [{ name: "Hannah Fremd" }],
    orgs: [{ name: "Praxis Dr. Linden", type: "Zahnarztpraxis" }],
  },
];
const docId: Record<string, string> = Object.fromEntries(DOCS.map((d) => [d.key, randomUUID()]));
const keyOf = new Map<string, string>(DOCS.map((d) => [docId[d.key], d.key]));

const client = () =>
  new PostgrestClient(REST_URL!, {
    headers: { Authorization: `Bearer ${jwt({ role: "authenticated", sub: userId })}` },
  }) as unknown as ToolContext["client"];
const otherClient = () =>
  new PostgrestClient(REST_URL!, {
    headers: { Authorization: `Bearer ${jwt({ role: "authenticated", sub: otherUserId })}` },
  }) as unknown as ToolContext["client"];

async function seed() {
  const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
  sql(`
    insert into auth.users (id, email) values (${q(userId)}, 'becker@example.test'), (${q(otherUserId)}, 'fremd@example.test');
    insert into families (id, name, created_by) values (${q(familyId)}, 'Becker', ${q(userId)}), (${q(otherFamilyId)}, 'Fremd', ${q(otherUserId)});
    -- (a trigger adds the creator's family_memberships row)
    insert into family_members (id, family_id, name, role) values
      ${Object.values(member).map((m) => `(${q(m.id)}, ${q(familyId)}, ${q(m.name)}, ${q(m.role)})`).join(",")};
    insert into documents (id, family_id, uploaded_by, title, status) values
      ${DOCS.map((d) => `(${q(docId[d.key])}, ${q(d.family === "other" ? otherFamilyId : familyId)}, ${q(d.family === "other" ? otherUserId : userId)}, ${q(d.title)}, 'analyzed')`).join(",")};
  `);

  // Confirm each document through the production RPC, as the family member.
  for (const d of DOCS) {
    const own = d.family !== "other";
    const persons = (d.persons ?? []).map((p) => ({
      name: p.name,
      person_id: p.member ? member[p.member].id : null,
      confidence: p.confidence === undefined ? 0.92 : p.confidence,
    }));
    const orgs = (d.orgs ?? []).map((o) => ({
      name: o.name, type: o.type, confidence: o.confidence === undefined ? 0.9 : o.confidence,
    }));
    // Null confidences are what an extraction without scores sends.
    const args: Record<string, unknown> = {
      p_document_id: docId[d.key],
      p_family_id: own ? familyId : otherFamilyId,
      p_title: d.title,
      p_summary: d.title,
      p_document_type: "other",
      p_category: "sonstiges",
      p_persons: persons,
      p_organizations: orgs,
      p_entities: [
        ...persons.map((p) => ({ entity_type: "person", entity_value: p.name, normalized_value: p.name.toLowerCase(), label: null, confidence: p.confidence ?? 0, linked_object_id: p.person_id })),
        ...orgs.map((o) => ({ entity_type: "organization", entity_value: o.name, normalized_value: o.name.toLowerCase(), label: null, confidence: o.confidence ?? 0, linked_object_id: null })),
      ],
      p_tasks: (d.tasks ?? []).map((t) => ({ title: t.title, due_date: t.due_date, confidence: 0.9 })),
    };
    const { data, error } = await (own ? client() : otherClient()).rpc("confirm_document", args as never);
    if (error || (data as { status?: string })?.status !== "confirmed") {
      throw new Error(`confirm_document ${d.key}: ${JSON.stringify(error ?? data)}`);
    }
  }
}

function ctx(): ToolContext {
  return {
    client: client(),
    familyId,
    sources: [],
    speakerName: null,
    preloadedFamilyMembers: Object.values(member).map(({ name, role }) => ({ name, role })),
  };
}

async function search(query: string): Promise<string[]> {
  const results = await graphSearch(client(), query, familyId);
  return results.map((r) => keyOf.get(r.document_id) ?? r.document_id);
}

async function graphQuery(entity: string, extra: Record<string, unknown> = {}) {
  const raw = JSON.parse(await executeTool("graph_query", { entity, ...extra }, ctx())) as {
    documents?: Array<{ id: string }>;
    tasks?: Array<{ titel: string }>;
  };
  return {
    docs: (raw.documents ?? []).map((d) => keyOf.get(d.id) ?? d.id).sort(),
    tasks: (raw.tasks ?? []).map((t) => t.titel),
  };
}

const HANNAH_DOCS = ["kostenplan", "ticket", "zahnrechnung"];

describe.skipIf(!REST_URL || !DB_URL || !JWT_SECRET)("knowledge graph (real database)", () => {
  beforeAll(seed, 60_000);

  describe("graphSearch", () => {
    it("finds a person's documents by name and possessive", async () => {
      expect((await search("Hannahs Unterlagen")).sort()).toEqual(HANNAH_DOCS);
    });

    it("does not mix up Anna and Hannah", async () => {
      expect(await search("Was hat Anna bekommen")).toEqual(["rente"]);
    });

    it("does not treat Max's teacher Maximilian as Max", async () => {
      expect(await search("Was hat Max bekommen")).toEqual(["zeugnis"]);
    });

    it("tolerates a misspelled name", async () => {
      expect((await search("Hannas Unterlagen")).sort()).toEqual(HANNAH_DOCS);
      expect((await search("was hat hanna")).sort()).toEqual(HANNAH_DOCS);
      expect((await search("Hanahs Unterlagen")).sort()).toEqual(HANNAH_DOCS);
      expect((await search("Unterlagen von Hnanah")).sort()).toEqual(HANNAH_DOCS);
    });

    it("resolves family roles", async () => {
      expect((await search("Was hat meine Tochter")).sort()).toEqual(HANNAH_DOCS);
      expect(await search("Omas Rente")).toEqual(["rente"]);
      expect(await search("Was hat mein Sohn bekommen")).toEqual(["zeugnis"]);
    });

    it("does not let filler words match organizations", async () => {
      const hits = await search("Welche Unterlagen gibt es für die Wohnung");
      expect(hits).not.toContain("kindergeld");
      expect(hits).not.toContain("grundsteuer");
    });

    it("ranks the document matching person and topic first", async () => {
      expect((await search("Hannahs Ticket"))[0]).toBe("ticket");
      expect((await search("Hannahs Zahnspange"))[0]).toBe("kostenplan");
    });

    it("follows a person's organization to its other documents", async () => {
      const hits = await search("Alles von Hannahs Zahnarzt");
      expect(hits).toEqual(expect.arrayContaining(["zahnrechnung", "kostenplan", "praxisinfo"]));
      expect(hits).not.toContain("rente");
    });

    it("scores documents whose edges carry no confidence", async () => {
      const results = await graphSearch(client(), "Praxis Dr. Linden", familyId);
      const rechnung = results.find((r) => r.document_id === docId.zahnrechnung);
      expect(rechnung?.score ?? 0).toBeGreaterThan(0.3);
    });

    it("never returns another family's documents", async () => {
      expect(await search("Praxis Linden Hannah")).not.toContain("fremd");
    });
  });

  describe("graph_query tool", () => {
    it("finds a person", async () => {
      expect((await graphQuery("Hannah")).docs).toEqual(HANNAH_DOCS);
    });

    it("does not mix up Anna and Hannah", async () => {
      expect((await graphQuery("Anna")).docs).toEqual(["rente"]);
    });

    it("does not treat Max's teacher as Max", async () => {
      expect((await graphQuery("Max")).docs).toEqual(["zeugnis"]);
    });

    it("tolerates misspelled names", async () => {
      expect((await graphQuery("Hanna")).docs).toEqual(HANNAH_DOCS);
      expect((await graphQuery("Hana")).docs).toEqual(HANNAH_DOCS);
      expect((await graphQuery("Rentenversicherug")).docs).toEqual(["rente"]);
    });

    it("resolves family roles", async () => {
      expect((await graphQuery("meine Tochter")).docs).toEqual(HANNAH_DOCS);
      expect((await graphQuery("Oma")).docs).toEqual(["rente"]);
    });

    it("handles organization names with commas and ampersands", async () => {
      expect((await graphQuery("Hausverwaltung Schmidt, Meyer & Partner")).docs).toEqual(["miete"]);
      expect((await graphQuery("Hausverwaltung")).docs).toEqual(["miete"]);
    });

    it("finds organizations by their kind", async () => {
      expect((await graphQuery("Zahnarzt")).docs).toEqual(["kostenplan", "praxisinfo", "zahnrechnung"]);
    });

    it("counts a deadline due today as upcoming", async () => {
      const { tasks } = await graphQuery("Hannah", { include: ["deadlines"], upcoming_days: 7 });
      expect(tasks).toEqual(["Abo verlängern oder kündigen"]);
    });

    it("never returns another family's documents", async () => {
      expect((await graphQuery("Fremd")).docs).toEqual([]);
    });
  });
});
