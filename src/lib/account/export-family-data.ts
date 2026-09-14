import type { User } from "@supabase/supabase-js";
import { FRIENDLY_ERROR, getUserFamily } from "@/lib/actions/result";
import { createClient } from "@/lib/supabase/server";

const EXPORT_PAGE_SIZE = 500;
const FILTER_CHUNK_SIZE = 100;

type RowPage<T> = {
  data: T[] | null;
  error: unknown;
};

async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<RowPage<T>>,
) {
  const rows: T[] = [];

  for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
    const result = await fetchPage(from, from + EXPORT_PAGE_SIZE - 1);
    if (result.error) throw new Error(FRIENDLY_ERROR);

    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < EXPORT_PAGE_SIZE) return rows;
  }
}

async function fetchRowsForIds<T>(
  ids: string[],
  fetchChunk: (ids: string[]) => Promise<T[]>,
) {
  const rows: T[] = [];
  for (let from = 0; from < ids.length; from += FILTER_CHUNK_SIZE) {
    rows.push(...(await fetchChunk(ids.slice(from, from + FILTER_CHUNK_SIZE))));
  }
  return rows;
}

/**
 * Build a portable JSON export with the account and the family data the
 * authenticated caller can currently read. Every query uses the caller's
 * RLS-scoped Supabase client; the service-role client is deliberately not used.
 *
 * Storage paths, invite/feed tokens, encrypted document secrets, embeddings,
 * internal processing records and temporary signed URLs are not exported.
 * Original files remain available through each document's normal download.
 */
export async function exportFamilyData(user: User) {
  const supabase = await createClient();
  const { data: resolvedFamily, error: familyError } = await getUserFamily(
    supabase,
  );
  if (familyError) throw new Error(FRIENDLY_ERROR);

  const account = {
    id: user.id,
    email: user.email ?? null,
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? null,
  };

  if (!resolvedFamily) {
    return {
      format: "ordilo-data-export",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      account,
      family: null,
      contents: {},
      files: {
        included: false,
        note:
          "Dieser JSON-Export enthält keine Originaldateien. Originale kannst du in Ordilo bei jedem Dokument einzeln öffnen oder teilen.",
      },
    };
  }

  const familyId = resolvedFamily.id;
  const [
    familyResult,
    membershipResult,
    familyMembers,
    familyMemberRelations,
    collections,
    documents,
    documentFacts,
    extractedEntities,
    contacts,
    tasks,
    taskDocuments,
    calendarEvents,
    inventoryItems,
    inboundEmails,
    inboundSuggestions,
    chatConversations,
    chatMessages,
  ] = await Promise.all([
    supabase
      .from("families")
      .select("id, name, created_at, onboarding_completed_at")
      .eq("id", familyId)
      .single(),
    supabase
      .from("family_memberships")
      .select("role, created_at, intro_seen_at")
      .eq("family_id", familyId)
      .eq("user_id", user.id)
      .maybeSingle(),
    fetchAllRows((from, to) =>
      supabase
        .from("family_members")
        .select("id, name, role, birthdate, avatar_color, created_at")
        .eq("family_id", familyId)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("family_member_relations")
        .select(
          "id, member_id, related_member_id, role, sort_order, created_at",
        )
        .eq("family_id", familyId)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("collections")
        .select("id, name, icon, color, sort_order, created_at")
        .eq("family_id", familyId)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("documents")
        .select(
          "id, title, document_type, category, status, original_filename, mime_type, page_count, corrections_text, ocr_text, summary, created_at, confirmed_at, tags, source",
        )
        .eq("family_id", familyId)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("document_facts")
        .select(
          "id, document_id, fact_type, label, value, normalized_value, confidence, confirmed, created_at",
        )
        .eq("family_id", familyId)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("extracted_entities")
        .select(
          "id, document_id, entity_type, entity_value, normalized_value, label, amount_minor, currency, amount_kind, value_date, confidence, confirmed, linked_object_id, created_at",
        )
        .eq("family_id", familyId)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("contacts")
        .select(
          "id, source_document_id, name, organization, role, phone, email, status, user_edited_at, created_at, updated_at",
        )
        .eq("family_id", familyId)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("tasks")
        .select(
          "id, document_id, title, description, due_date, status, confidence, confirmed, created_at, tags, assigned_to, completed_at",
        )
        .eq("family_id", familyId)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("task_documents")
        .select("id, task_id, document_id, created_at")
        .eq("family_id", familyId)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("calendar_events")
        .select(
          "id, title, note, starts_on, ends_on, all_day, starts_time, ends_time, recurrence, recurrence_until, recurrence_exceptions, location, responsible_member_id, document_id, created_at",
        )
        .eq("family_id", familyId)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("family_inventory_items")
        .select(
          "id, name, item_type, metadata, tags, linked_member_id, status, source_document_id, created_at, updated_at",
        )
        .eq("family_id", familyId)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("inbound_emails")
        .select(
          "id, from_address, subject, body_text, received_at, retention, retention_decided_at, created_at",
        )
        .eq("family_id", familyId)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("inbound_suggestions")
        .select(
          "id, inbound_email_id, kind, title, starts_on, starts_time, ends_time, location, note, confidence, status, created_calendar_event_id, created_task_id, decided_at, created_at",
        )
        .eq("family_id", familyId)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("chat_conversations")
        .select("id, title, created_at, updated_at")
        .eq("family_id", familyId)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("chat_messages")
        .select(
          "id, conversation_id, role, content, response_state, feedback, created_at",
        )
        .eq("family_id", familyId)
        .order("id")
        .range(from, to),
    ),
  ]);

  if (familyResult.error || membershipResult.error) {
    throw new Error(FRIENDLY_ERROR);
  }
  if (!familyResult.data) {
    throw new Error(FRIENDLY_ERROR);
  }

  const documentPages = await fetchRowsForIds(
    documents.map((document) => document.id),
    (documentIds) =>
      fetchAllRows((from, to) =>
        supabase
          .from("document_pages")
          .select("id, document_id, page_number, ocr_markdown")
          .in("document_id", documentIds)
          .order("id")
          .range(from, to),
      ),
  );
  const calendarEventAttendees = await fetchRowsForIds(
    calendarEvents.map((event) => event.id),
    (eventIds) =>
      fetchAllRows((from, to) =>
        supabase
          .from("calendar_event_attendees")
          .select("event_id, family_member_id, created_at")
          .in("event_id", eventIds)
          .order("event_id")
          .order("family_member_id")
          .range(from, to),
      ),
  );

  return {
    format: "ordilo-data-export",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    account,
    family: {
      ...familyResult.data,
      currentAccountRole:
        membershipResult.data?.role ??
        (resolvedFamily.isOwner ? "owner" : null),
      joinedAt: membershipResult.data?.created_at ?? null,
    },
    contents: {
      familyMembers,
      familyMemberRelations,
      collections,
      documents,
      documentPages,
      documentFacts,
      extractedEntities,
      contacts,
      tasks,
      taskDocuments,
      calendarEvents,
      calendarEventAttendees,
      inventoryItems,
      inboundEmails,
      inboundSuggestions,
      chatConversations,
      chatMessages,
    },
    files: {
      included: false,
      note:
        "Dieser JSON-Export enthält keine Originaldateien. Originale kannst du in Ordilo bei jedem Dokument einzeln öffnen oder teilen.",
    },
  };
}
