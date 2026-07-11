/**
 * Supabase database types.
 *
 * Manually defined from the migration schema (supabase/migrations/
 * 0001_initial_schema.sql) until full type generation is wired up. Covers
 * all 9 tables, the user_belongs_to_family helper function, the
 * confirm_document RPC function, and the embedding vector column.
 */

// ---------------------------------------------------------------------------
// confirm_document RPC parameter types (passed as JSONB arrays)
// ---------------------------------------------------------------------------

/** A person node to upsert during confirm. */
export type ConfirmRpcPerson = {
  name: string;
  /** Family member UUID (links knowledge node to a family_member), or null. */
  person_id: string | null;
  confidence: number;
};

/** An organization node to upsert during confirm. */
export type ConfirmRpcOrganization = {
  name: string;
  type: string;
  confidence: number;
};

/** A precomputed embedding chunk to insert during confirm. */
export type ConfirmRpcEmbedding = {
  chunk_text: string;
  /** pgvector text format: "[v1,v2,...,v1536]". */
  embedding: string;
  page_number: number;
  chunk_index: number;
  chunk_total: number;
  /** "chunk" for text chunks, "question" for synthetic question embeddings. */
  chunk_type?: string;
};

/** A label embedding for a knowledge graph node (document title, person name, org name). */
export type ConfirmRpcLabelEmbedding = {
  label: string;
  /** pgvector text format: "[v1,v2,...,v1536]". */
  embedding: string;
};

/** An extracted entity to insert (confirmed = true) during confirm. */
export type ConfirmRpcEntity = {
  entity_type: string;
  entity_value: string;
  normalized_value: string | null;
  confidence: number;
  /** Family member UUID for person entities, or null. */
  linked_object_id: string | null;
};

/** A task to insert (confirmed = true) during confirm. */
export type ConfirmRpcTask = {
  title: string;
  /** ISO date string "YYYY-MM-DD", or null. */
  due_date: string | null;
  priority: string;
  confidence: number;
};

/** A typed document fact to insert (confirmed = true) during confirm. */
export type ConfirmRpcFact = {
  fact_type: string;
  label: string;
  value: string;
  /** Lowercased, alphanumeric-only version of value (for exact lookup). */
  normalized_value: string;
  confidence: number;
};

/** Result returned by the confirm_document RPC. */
export type ConfirmRpcResult = {
  /** "confirmed" on success, "status_changed" when not in 'analyzed' state. */
  status: "confirmed" | "status_changed";
  /** Present when status === "confirmed". */
  document_id?: string;
};

/** A single row returned by the semantic_search RPC. */
export type SemanticSearchRow = {
  document_id: string;
  title: string | null;
  chunk_text: string;
  /** Cosine similarity score: 1 - (embedding <=> query_embedding), in [0, 1]. */
  score: number;
};

/** A single row returned by the lexical_search RPC (full-text search). */
export type LexicalSearchRow = {
  document_id: string;
  title: string | null;
  chunk_text: string;
  /** ts_rank_cd score (unnormalized; used for ranking only). */
  score: number;
};

export type Database = {
  public: {
    Tables: {
      // families -----------------------------------------------------------
      families: {
        Row: {
          id: string;
          name: string;
          created_by: string;
          created_at: string;
          /**
           * Durable marker set when the user completes the onboarding flow.
           * NULL means onboarding has not been completed yet (mid-onboarding
           * or no family). Once set, the user can access /familie and other
           * app routes even with zero family members (VAL-ONBOARD-026,
           * VAL-FAMILY-004). See migration 0011.
           */
          onboarding_completed_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          created_by: string;
          created_at?: string;
          onboarding_completed_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          created_by?: string;
          created_at?: string;
          onboarding_completed_at?: string | null;
        };
        Relationships: [];
      };
      // family_members -----------------------------------------------------
      family_members: {
        Row: {
          id: string;
          family_id: string;
          name: string;
          role: string | null;
          birthdate: string | null;
          avatar_color: string | null;
          created_at: string;
          /** Links a family member to an auth user (speaker identity). See migration 0014. */
          linked_user_id: string | null;
          /** Storage path of the member's uploaded profile photo. See migration 0022. */
          photo_url: string | null;
          /** Another family member this person has a relationship to. See migration 0022. */
          related_member_id: string | null;
          /** Free-text label describing the relationship to related_member_id, e.g. "Ehepartner". */
          relationship_label: string | null;
        };
        Insert: {
          id?: string;
          family_id: string;
          name: string;
          role?: string | null;
          birthdate?: string | null;
          avatar_color?: string | null;
          created_at?: string;
          linked_user_id?: string | null;
          photo_url?: string | null;
          related_member_id?: string | null;
          relationship_label?: string | null;
        };
        Update: {
          id?: string;
          family_id?: string;
          name?: string;
          role?: string | null;
          birthdate?: string | null;
          avatar_color?: string | null;
          created_at?: string;
          linked_user_id?: string | null;
          photo_url?: string | null;
          related_member_id?: string | null;
          relationship_label?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      // family_memberships ---------------------------------------------------
      family_memberships: {
        Row: {
          id: string;
          family_id: string;
          user_id: string;
          role: string; // 'owner' | 'adult' | 'viewer'
          created_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          user_id: string;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          user_id?: string;
          role?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "family_memberships_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      // family_invites -------------------------------------------------------
      family_invites: {
        Row: {
          id: string;
          family_id: string;
          token: string;
          role: string; // 'adult' | 'viewer'
          created_by: string | null;
          expires_at: string;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          token?: string;
          role?: string;
          created_by?: string | null;
          expires_at?: string;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          token?: string;
          role?: string;
          created_by?: string | null;
          expires_at?: string;
          revoked_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "family_invites_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      // family_inventory_items ----------------------------------------------
      family_inventory_items: {
        Row: {
          id: string;
          family_id: string;
          name: string;
          item_type: string;
          metadata: Record<string, unknown>;
          tags: string[];
          linked_member_id: string | null;
          status: string;
          source_document_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          name: string;
          item_type: string;
          metadata?: Record<string, unknown>;
          tags?: string[];
          linked_member_id?: string | null;
          status?: string;
          source_document_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          name?: string;
          item_type?: string;
          metadata?: Record<string, unknown>;
          tags?: string[];
          linked_member_id?: string | null;
          status?: string;
          source_document_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "family_inventory_items_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "family_inventory_items_linked_member_id_fkey";
            columns: ["linked_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["id"];
          },
        ];
      };
      // collections ----------------------------------------------------------
      collections: {
        Row: {
          id: string;
          family_id: string;
          name: string;
          icon: string;
          color: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          name: string;
          icon?: string;
          color?: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          name?: string;
          icon?: string;
          color?: string;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collections_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      // documents ----------------------------------------------------------
      documents: {
        Row: {
          id: string;
          family_id: string;
          uploaded_by: string | null;
          title: string | null;
          document_type: string | null;
          category: string | null;
          status: string;
          file_url: string | null;
          original_filename: string | null;
          mime_type: string | null;
          page_count: number | null;
          ocr_text: string | null;
          summary: string | null;
          error_message: string | null;
          created_at: string;
          confirmed_at: string | null;
          tags: string[];
          source: string;
          /** Pipeline version that produced the current extraction (see 0026). */
          extraction_version: number | null;
        };
        Insert: {
          id?: string;
          family_id: string;
          uploaded_by: string;
          title?: string | null;
          document_type?: string | null;
          category?: string | null;
          status?: string;
          file_url?: string | null;
          original_filename?: string | null;
          mime_type?: string | null;
          page_count?: number | null;
          ocr_text?: string | null;
          summary?: string | null;
          error_message?: string | null;
          created_at?: string;
          confirmed_at?: string | null;
          tags?: string[];
          source?: string;
          extraction_version?: number | null;
        };
        Update: {
          id?: string;
          family_id?: string;
          uploaded_by?: string | null;
          title?: string | null;
          document_type?: string | null;
          category?: string | null;
          status?: string;
          file_url?: string | null;
          original_filename?: string | null;
          mime_type?: string | null;
          page_count?: number | null;
          ocr_text?: string | null;
          summary?: string | null;
          error_message?: string | null;
          created_at?: string;
          confirmed_at?: string | null;
          tags?: string[];
          source?: string;
          extraction_version?: number | null;
        };
        Relationships: [];
      };
      // document_pages -----------------------------------------------------
      document_pages: {
        Row: {
          id: string;
          document_id: string;
          page_number: number;
          image_url: string | null;
          ocr_markdown: string | null;
          layout_json: Record<string, unknown> | null;
        };
        Insert: {
          id?: string;
          document_id: string;
          page_number: number;
          image_url?: string | null;
          ocr_markdown?: string | null;
          layout_json?: Record<string, unknown> | null;
        };
        Update: {
          id?: string;
          document_id?: string;
          page_number?: number;
          image_url?: string | null;
          ocr_markdown?: string | null;
          layout_json?: Record<string, unknown> | null;
        };
        Relationships: [];
      };
      // extracted_entities -------------------------------------------------
      extracted_entities: {
        Row: {
          id: string;
          document_id: string;
          family_id: string;
          entity_type: string;
          entity_value: string;
          normalized_value: string | null;
          confidence: number;
          confirmed: boolean;
          linked_object_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          family_id: string;
          entity_type: string;
          entity_value: string;
          normalized_value?: string | null;
          confidence?: number;
          confirmed?: boolean;
          linked_object_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          family_id?: string;
          entity_type?: string;
          entity_value?: string;
          normalized_value?: string | null;
          confidence?: number;
          confirmed?: boolean;
          linked_object_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      // tasks --------------------------------------------------------------
      tasks: {
        Row: {
          id: string;
          family_id: string;
          document_id: string;
          title: string;
          description: string | null;
          due_date: string | null;
          priority: string;
          status: string;
          confidence: number;
          confirmed: boolean;
          created_at: string;
          tags: string[];
        };
        Insert: {
          id?: string;
          family_id: string;
          document_id: string;
          title: string;
          description?: string | null;
          due_date?: string | null;
          priority?: string;
          status?: string;
          confidence?: number;
          confirmed?: boolean;
          created_at?: string;
          tags?: string[];
        };
        Update: {
          id?: string;
          family_id?: string;
          document_id?: string;
          title?: string;
          description?: string | null;
          due_date?: string | null;
          priority?: string;
          status?: string;
          confidence?: number;
          confirmed?: boolean;
          created_at?: string;
          tags?: string[];
        };
        Relationships: [];
      };
      // task_documents ----------------------------------------------
      task_documents: {
        Row: {
          id: string;
          task_id: string;
          document_id: string;
          family_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          document_id: string;
          family_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          document_id?: string;
          family_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      // knowledge_nodes ----------------------------------------------------
      knowledge_nodes: {
        Row: {
          id: string;
          family_id: string;
          type: string;
          label: string;
          properties_json: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          type: string;
          label: string;
          properties_json?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          type?: string;
          label?: string;
          properties_json?: Record<string, unknown>;
          created_at?: string;
        };
        Relationships: [];
      };
      // knowledge_edges ----------------------------------------------------
      knowledge_edges: {
        Row: {
          id: string;
          family_id: string;
          source_node_id: string;
          target_node_id: string;
          relation_type: string;
          confidence: number;
          source_document_id: string | null;
          confirmed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          source_node_id: string;
          target_node_id: string;
          relation_type: string;
          confidence?: number;
          source_document_id?: string | null;
          confirmed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          source_node_id?: string;
          target_node_id?: string;
          relation_type?: string;
          confidence?: number;
          source_document_id?: string | null;
          confirmed?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      // document_embeddings ------------------------------------------------
      document_embeddings: {
        Row: {
          id: string;
          document_id: string;
          family_id: string;
          chunk_text: string;
          embedding: string | null; // vector(1536) — represented as string in JS
          metadata_json: Record<string, unknown>;
          /** Pipeline version that produced this embedding (see 0026). */
          pipeline_version: number;
        };
        Insert: {
          id?: string;
          document_id: string;
          family_id: string;
          chunk_text: string;
          embedding?: string | null;
          metadata_json?: Record<string, unknown>;
          pipeline_version?: number;
        };
        Update: {
          id?: string;
          document_id?: string;
          family_id?: string;
          chunk_text?: string;
          embedding?: string | null;
          metadata_json?: Record<string, unknown>;
          pipeline_version?: number;
        };
        Relationships: [];
      };
      // document_facts -------------------------------------------------------
      document_facts: {
        Row: {
          id: string;
          document_id: string;
          family_id: string;
          fact_type: string;
          label: string;
          value: string;
          normalized_value: string;
          confidence: number;
          confirmed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          family_id: string;
          fact_type: string;
          label: string;
          value: string;
          normalized_value: string;
          confidence?: number;
          confirmed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          family_id?: string;
          fact_type?: string;
          label?: string;
          value?: string;
          normalized_value?: string;
          confidence?: number;
          confirmed?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      // processing_jobs ------------------------------------------------------
      processing_jobs: {
        Row: {
          id: string;
          family_id: string;
          document_id: string | null;
          job_type: string; // 'ocr' | 'analyze' | 'reindex'
          status: string; // 'pending' | 'running' | 'done' | 'failed' | 'dead'
          attempts: number;
          max_attempts: number;
          run_after: string;
          payload: Record<string, unknown>;
          last_error: string | null;
          created_at: string;
          updated_at: string;
          started_at: string | null;
          finished_at: string | null;
        };
        Insert: {
          id?: string;
          family_id: string;
          document_id?: string | null;
          job_type: string;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          run_after?: string;
          payload?: Record<string, unknown>;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Update: {
          id?: string;
          family_id?: string;
          document_id?: string | null;
          job_type?: string;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          run_after?: string;
          payload?: Record<string, unknown>;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Relationships: [];
      };
      // chat_conversations -------------------------------------------------
      chat_conversations: {
        Row: {
          id: string;
          family_id: string;
          title: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      // chat_messages ------------------------------------------------------
      chat_messages: {
        Row: {
          id: string;
          conversation_id: string;
          family_id: string;
          role: string;
          content: string;
          sources: Record<string, unknown>[] | null;
          card: Record<string, unknown> | null;
          feedback: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          family_id: string;
          role: string;
          content: string;
          sources?: Record<string, unknown>[] | null;
          card?: Record<string, unknown> | null;
          feedback?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          family_id?: string;
          role?: string;
          content?: string;
          sources?: Record<string, unknown>[] | null;
          card?: Record<string, unknown> | null;
          feedback?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      // chat_usage ---------------------------------------------------------
      chat_usage: {
        Row: {
          id: string;
          family_id: string;
          usage_date: string;
          message_count: number;
          token_count: number;
        };
        Insert: {
          id?: string;
          family_id: string;
          usage_date?: string;
          message_count?: number;
          token_count?: number;
        };
        Update: {
          id?: string;
          family_id?: string;
          usage_date?: string;
          message_count?: number;
          token_count?: number;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      user_belongs_to_family: {
        Args: { fam_id: string };
        Returns: boolean;
      };
      // confirm_document — single-transaction atomic confirm RPC.
      // See supabase/migrations/0005_confirm_rpc.sql.
      // The complex array params are passed as JSONB; the route serializes
      // them and the RPC iterates with jsonb_array_elements.
      confirm_document: {
        Args: {
          p_document_id: string;
          p_family_id: string;
          p_title: string;
          p_summary: string;
          p_document_type: string;
          p_category: string;
          p_persons: ConfirmRpcPerson[];
          p_organizations: ConfirmRpcOrganization[];
          p_embeddings: ConfirmRpcEmbedding[];
          p_label_embeddings: ConfirmRpcLabelEmbedding[];
          p_entities: ConfirmRpcEntity[];
          p_tasks: ConfirmRpcTask[];
          p_facts: ConfirmRpcFact[];
          p_pipeline_version: number;
        };
        Returns: ConfirmRpcResult;
      };
      // get_family_invite_info — family name for a valid invite token
      // (works signed-out; holding the token is the authorization).
      // See supabase/migrations/0029_family_invites.sql.
      get_family_invite_info: {
        Args: { p_token: string };
        Returns: { status: string; family_name?: string };
      };
      // accept_family_invite — join the invite's family as a member.
      // See supabase/migrations/0029_family_invites.sql.
      accept_family_invite: {
        Args: { p_token: string };
        Returns: {
          status: string;
          family_id?: string;
          family_name?: string;
        };
      };
      // lexical_search — German full-text search over embedding chunks.
      // See supabase/migrations/0027_fts_and_document_facts.sql.
      lexical_search: {
        Args: {
          p_query: string;
          p_family_id: string;
          p_limit?: number;
        };
        Returns: LexicalSearchRow[];
      };
      // claim_processing_jobs — atomically claim due pending jobs
      // (FOR UPDATE SKIP LOCKED). Service-role only.
      // See supabase/migrations/0025_processing_jobs.sql.
      claim_processing_jobs: {
        Args: { p_limit?: number };
        Returns: Database["public"]["Tables"]["processing_jobs"]["Row"][];
      };
      // replace_document_embeddings — transactional embedding replacement
      // for the reindex job. Service-role only.
      // See supabase/migrations/0026_pipeline_versions.sql.
      replace_document_embeddings: {
        Args: {
          p_document_id: string;
          p_family_id: string;
          p_embeddings: ConfirmRpcEmbedding[];
          p_pipeline_version: number;
        };
        Returns: {
          status: string;
          document_id: string;
          embedding_count: number;
        };
      };
      // semantic_search — pgvector cosine similarity search RPC.
      // See supabase/migrations/0006_semantic_search_rpc.sql.
      // SECURITY INVOKER (RLS enforced). Returns top-k confirmed-document
      // chunks ranked by cosine similarity (1 - <=>).
      semantic_search: {
        Args: {
          p_query_embedding: string; // pgvector text format "[v1,v2,...]"
          p_family_id: string;
          p_limit?: number;
        };
        Returns: SemanticSearchRow[];
      };
      // semantic_node_search — cosine similarity search on knowledge_nodes.label_embedding
      // See supabase/migrations/0016_semantic_node_search_rpc.sql
      semantic_node_search: {
        Args: {
          p_query_embedding: string;
          p_family_id: string;
          p_limit?: number;
          p_threshold?: number;
        };
        Returns: {
          id: string;
          type: string;
          label: string;
          score: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type DatabaseSchema = Database["public"];
