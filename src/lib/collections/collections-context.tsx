"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { createCollection } from "@/app/(app)/sammlungen/actions";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import type { Database } from "@/types/database";

type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];

/** The slice of a collection row the UI needs. */
export interface CollectionInfo {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

export type AddCollectionResult =
  | { success: true; data: CollectionInfo }
  | { success: false; error: string };

interface CollectionsContextValue {
  /** The family's collections, sorted by sort_order. */
  collections: CollectionInfo[];
  /** Create a collection and update every consumer (sidebar, folder list). */
  addCollection: (values: {
    name: string;
    icon: string;
    color: string;
  }) => Promise<AddCollectionResult>;
}

const CollectionsContext = createContext<CollectionsContextValue | null>(null);

function toInfo(row: Pick<CollectionRow, "id" | "name" | "icon" | "color">): CollectionInfo {
  return { id: row.id, name: row.name, icon: row.icon, color: row.color };
}

/**
 * Collections are shown in TWO places at once (desktop sidebar + the
 * Familienbuch folder list), so their state lives in ONE provider: a
 * single fetch per app mount, and a create from either surface updates
 * both immediately — no duplicate queries, no stale sibling view.
 */
export function CollectionsProvider({ children }: { children: React.ReactNode }) {
  const [collections, setCollections] = useState<CollectionInfo[]>([]);

  useMountEffect(() => {
    let cancelled = false;
    void (async () => {
      // RLS scopes the query to the user's family; unauthenticated
      // sessions simply get an empty list.
      const supabase = createClient();
      const { data } = await supabase
        .from("collections")
        .select("id, name, icon, color")
        .order("sort_order", { ascending: true });
      if (!cancelled && data) setCollections(data.map(toInfo));
    })();
    return () => {
      cancelled = true;
    };
  });

  const addCollection = useCallback(
    async (values: { name: string; icon: string; color: string }): Promise<AddCollectionResult> => {
      try {
        const result = await createCollection(values);
        if (!result.success) return result;
        const info = toInfo(result.data);
        setCollections((prev) => [...prev, info]);
        return { success: true, data: info };
      } catch {
        // A rejected server action (network drop) must never strand the
        // caller — surface it as a normal failure result.
        return {
          success: false,
          error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
        };
      }
    },
    [],
  );

  const value = useMemo(
    () => ({ collections, addCollection }),
    [collections, addCollection],
  );

  return (
    <CollectionsContext.Provider value={value}>
      {children}
    </CollectionsContext.Provider>
  );
}

export function useCollections(): CollectionsContextValue {
  const context = useContext(CollectionsContext);
  if (!context) {
    throw new Error("useCollections must be used within a CollectionsProvider");
  }
  return context;
}
