"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getFamilyId } from "@/lib/supabase/client-helpers";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/**
 * React hook that resolves the current user's family ID on the client.
 *
 * Wraps the `families.select("id").limit(1).maybeSingle()` query that was
 * previously duplicated across client components. The hook fetches the
 * family ID once on mount and exposes a `loading` flag so consumers can
 * gate dependent work (e.g. waiting to fetch family-scoped data until the
 * family ID is known).
 *
 * @returns `{ familyId, loading }` — `familyId` is `null` until the query
 *          resolves (or when the user has no family); `loading` is true
 *          until the first query completes.
 */
export function useFamilyId(): {
  familyId: string | null;
  loading: boolean;
} {
  const supabase = createClient();
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useMountEffect(() => {
    let active = true;

    getFamilyId(supabase).then((id) => {
      if (!active) return;
      setFamilyId(id);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  });

  return { familyId, loading };
}
