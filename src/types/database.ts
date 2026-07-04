/**
 * Supabase generated database types.
 *
 * This is a placeholder. The full types will be generated from the Supabase
 * schema after the database migration is applied (see the `database-schema`
 * feature). For now we export an empty Database interface so that Supabase
 * clients can be typed without errors.
 */

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type DatabaseSchema = Database["public"];
