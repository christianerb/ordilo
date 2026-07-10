import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  loadConversationMessages,
  listConversations,
} from "@/lib/ai/chat-history";
import { SucheClient } from "./suche-client";
import type { DocumentMetadata, InitialMessage } from "./suche-client";

/**
 * Search / Chat page (server component).
 *
 * Fetches the user's family, family members, confirmed documents (with
 * metadata for filter chips), person-document associations (from
 * extracted_entities), the list of all chat conversations, and the
 * messages of the selected conversation (via ?chat=<id> param).
 *
 * If no ?chat= param is present, shows the empty state (no messages
 * loaded). When the user sends their first message, a new conversation
 * is created via the /api/chat endpoint.
 */
export default async function SuchePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();

  // Read URL params
  const params = await searchParams;
  const initialQuery =
    typeof params.q === "string" ? params.q.trim() : "";
  const chatId =
    typeof params.chat === "string" ? params.chat.trim() : "";

  // 1. Fetch the user's family (RLS-scoped).
  const { data: family } = await supabase
    .from("families")
    .select("id, name")
    .limit(1)
    .maybeSingle();

  if (!family) {
    redirect("/onboarding");
  }

  const [
    { data: memberData },
    { data: docData },
    conversations,
    { data: selectedConversation },
  ] = await Promise.all([
    supabase
      .from("family_members")
      .select("id, name")
      .eq("family_id", family.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("documents")
      .select("id, title, category, document_type")
      .eq("family_id", family.id)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false }),
    listConversations(supabase, family.id).catch(() => []),
    chatId
      ? supabase
          .from("chat_conversations")
          .select("id")
          .eq("id", chatId)
          .eq("family_id", family.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const members = (memberData ?? []).map((m) => ({
    id: m.id,
    name: m.name,
  }));

  const confirmedDocIds = (docData ?? []).map((d) => d.id);

  // 4. Fetch person entities for confirmed documents (to build the
  //    person-document mapping for filtering).
  let documents: DocumentMetadata[] = [];

  if (confirmedDocIds.length > 0) {
    const { data: entityData } = await supabase
      .from("extracted_entities")
      .select("document_id, entity_value")
      .eq("family_id", family.id)
      .eq("entity_type", "person")
      .eq("confirmed", true)
      .in("document_id", confirmedDocIds);

    // Build a mapping: document_id → set of person names.
    const personMap = new Map<string, Set<string>>();
    for (const entity of entityData ?? []) {
      if (!entity.entity_value) continue;
      if (!personMap.has(entity.document_id)) {
        personMap.set(entity.document_id, new Set());
      }
      personMap.get(entity.document_id)!.add(entity.entity_value);
    }

    documents = (docData ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      document_type: d.document_type,
      persons: personMap.get(d.id)
        ? [...personMap.get(d.id)!]
        : [],
    }));
  }

  // 6. Load messages for the selected conversation (if ?chat=<id> is present).
  let conversationId = "";
  let initialMessages: InitialMessage[] = [];

  if (selectedConversation) {
    try {
      conversationId = selectedConversation.id;
      const rows = await loadConversationMessages(supabase, conversationId);
      initialMessages = rows.map((row) => ({
        id: row.id,
        role: row.role as "user" | "assistant",
        content: row.content,
        sources: row.sources ?? [],
        card: row.card ?? undefined,
        feedback: (row.feedback as "positive" | "negative" | null) ?? null,
      }));
    } catch {
      // Persistence not available — start fresh.
    }
  }

  return (
    <SucheClient
      key={chatId || "new"}
      familyId={family.id}
      familyName={family.name}
      members={members}
      documents={documents}
      initialQuery={initialQuery}
      conversationId={conversationId}
      initialMessages={initialMessages}
      conversations={conversations.map((c) => ({
        id: c.id,
        title: c.title,
        updated_at: c.updated_at,
      }))}
    />
  );
}
