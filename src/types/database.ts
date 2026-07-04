/**
 * Supabase database types.
 *
 * Manually defined from the migration schema (supabase/migrations/
 * 0001_initial_schema.sql) until full type generation is wired up. Covers
 * all 9 tables, the user_belongs_to_family helper function, and the
 * embedding vector column.
 */

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
        };
        Insert: {
          id?: string;
          name: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_by?: string;
          created_at?: string;
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
        };
        Insert: {
          id?: string;
          family_id: string;
          name: string;
          role?: string | null;
          birthdate?: string | null;
          avatar_color?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          name?: string;
          role?: string | null;
          birthdate?: string | null;
          avatar_color?: string | null;
          created_at?: string;
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
          file_url: string;
          original_filename: string | null;
          mime_type: string | null;
          page_count: number | null;
          ocr_text: string | null;
          summary: string | null;
          error_message: string | null;
          created_at: string;
          confirmed_at: string | null;
        };
        Insert: {
          id?: string;
          family_id: string;
          uploaded_by: string;
          title?: string | null;
          document_type?: string | null;
          category?: string | null;
          status?: string;
          file_url: string;
          original_filename?: string | null;
          mime_type?: string | null;
          page_count?: number | null;
          ocr_text?: string | null;
          summary?: string | null;
          error_message?: string | null;
          created_at?: string;
          confirmed_at?: string | null;
        };
        Update: {
          id?: string;
          family_id?: string;
          uploaded_by?: string | null;
          title?: string | null;
          document_type?: string | null;
          category?: string | null;
          status?: string;
          file_url?: string;
          original_filename?: string | null;
          mime_type?: string | null;
          page_count?: number | null;
          ocr_text?: string | null;
          summary?: string | null;
          error_message?: string | null;
          created_at?: string;
          confirmed_at?: string | null;
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
          due_date: string | null;
          priority: string;
          status: string;
          confidence: number;
          confirmed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          document_id: string;
          title: string;
          due_date?: string | null;
          priority?: string;
          status?: string;
          confidence?: number;
          confirmed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          document_id?: string;
          title?: string;
          due_date?: string | null;
          priority?: string;
          status?: string;
          confidence?: number;
          confirmed?: boolean;
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
        };
        Insert: {
          id?: string;
          document_id: string;
          family_id: string;
          chunk_text: string;
          embedding?: string | null;
          metadata_json?: Record<string, unknown>;
        };
        Update: {
          id?: string;
          document_id?: string;
          family_id?: string;
          chunk_text?: string;
          embedding?: string | null;
          metadata_json?: Record<string, unknown>;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type DatabaseSchema = Database["public"];
