export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      document_embeddings: {
        Row: {
          chunk_text: string
          document_id: string
          embedding: string | null
          family_id: string
          id: string
          metadata_json: Json
        }
        Insert: {
          chunk_text: string
          document_id: string
          embedding?: string | null
          family_id: string
          id?: string
          metadata_json?: Json
        }
        Update: {
          chunk_text?: string
          document_id?: string
          embedding?: string | null
          family_id?: string
          id?: string
          metadata_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "document_embeddings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_embeddings_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      document_pages: {
        Row: {
          document_id: string
          id: string
          image_url: string | null
          layout_json: Json | null
          ocr_markdown: string | null
          page_number: number
        }
        Insert: {
          document_id: string
          id?: string
          image_url?: string | null
          layout_json?: Json | null
          ocr_markdown?: string | null
          page_number: number
        }
        Update: {
          document_id?: string
          id?: string
          image_url?: string | null
          layout_json?: Json | null
          ocr_markdown?: string | null
          page_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_pages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string | null
          confirmed_at: string | null
          created_at: string
          document_type: string | null
          error_message: string | null
          family_id: string
          file_url: string
          id: string
          mime_type: string | null
          ocr_text: string | null
          original_filename: string | null
          page_count: number | null
          status: string
          summary: string | null
          title: string | null
          uploaded_by: string
        }
        Insert: {
          category?: string | null
          confirmed_at?: string | null
          created_at?: string
          document_type?: string | null
          error_message?: string | null
          family_id: string
          file_url: string
          id?: string
          mime_type?: string | null
          ocr_text?: string | null
          original_filename?: string | null
          page_count?: number | null
          status?: string
          summary?: string | null
          title?: string | null
          uploaded_by: string
        }
        Update: {
          category?: string | null
          confirmed_at?: string | null
          created_at?: string
          document_type?: string | null
          error_message?: string | null
          family_id?: string
          file_url?: string
          id?: string
          mime_type?: string | null
          ocr_text?: string | null
          original_filename?: string | null
          page_count?: number | null
          status?: string
          summary?: string | null
          title?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      extracted_entities: {
        Row: {
          confidence: number
          confirmed: boolean
          created_at: string
          document_id: string
          entity_type: string
          entity_value: string
          family_id: string
          id: string
          linked_object_id: string | null
          normalized_value: string | null
        }
        Insert: {
          confidence?: number
          confirmed?: boolean
          created_at?: string
          document_id: string
          entity_type: string
          entity_value: string
          family_id: string
          id?: string
          linked_object_id?: string | null
          normalized_value?: string | null
        }
        Update: {
          confidence?: number
          confirmed?: boolean
          created_at?: string
          document_id?: string
          entity_type?: string
          entity_value?: string
          family_id?: string
          id?: string
          linked_object_id?: string | null
          normalized_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extracted_entities_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_entities_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      family_members: {
        Row: {
          avatar_color: string | null
          birthdate: string | null
          created_at: string
          family_id: string
          id: string
          name: string
          role: string | null
        }
        Insert: {
          avatar_color?: string | null
          birthdate?: string | null
          created_at?: string
          family_id: string
          id?: string
          name: string
          role?: string | null
        }
        Update: {
          avatar_color?: string | null
          birthdate?: string | null
          created_at?: string
          family_id?: string
          id?: string
          name?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_edges: {
        Row: {
          confidence: number
          confirmed: boolean
          created_at: string
          family_id: string
          id: string
          relation_type: string
          source_document_id: string | null
          source_node_id: string
          target_node_id: string
        }
        Insert: {
          confidence?: number
          confirmed?: boolean
          created_at?: string
          family_id: string
          id?: string
          relation_type: string
          source_document_id?: string | null
          source_node_id: string
          target_node_id: string
        }
        Update: {
          confidence?: number
          confirmed?: boolean
          created_at?: string
          family_id?: string
          id?: string
          relation_type?: string
          source_document_id?: string | null
          source_node_id?: string
          target_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_edges_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_edges_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_nodes: {
        Row: {
          created_at: string
          family_id: string
          id: string
          label: string
          properties_json: Json
          type: string
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          label: string
          properties_json?: Json
          type: string
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          label?: string
          properties_json?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_nodes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          confidence: number
          confirmed: boolean
          created_at: string
          document_id: string
          due_date: string | null
          family_id: string
          id: string
          priority: string
          status: string
          title: string
        }
        Insert: {
          confidence?: number
          confirmed?: boolean
          created_at?: string
          document_id: string
          due_date?: string | null
          family_id: string
          id?: string
          priority?: string
          status?: string
          title: string
        }
        Update: {
          confidence?: number
          confirmed?: boolean
          created_at?: string
          document_id?: string
          due_date?: string | null
          family_id?: string
          id?: string
          priority?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      user_belongs_to_family: { Args: { fam_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

