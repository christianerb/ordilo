"use client";

import { useCallback, useRef, useState } from "react";
import type { createClient } from "@/lib/supabase/client";
import { getFamilyId } from "@/lib/supabase/client-helpers";

type BrowserSupabaseClient = ReturnType<typeof createClient>;

/**
 * Resolves the signed-in family's id once per session and mirrors it into
 * a ref, so event-time callbacks (uploads, note creation, list fetches)
 * can read it without depending on render timing.
 */
export function useFamilyId(supabase: BrowserSupabaseClient) {
  const [familyId, setFamilyId] = useState<string | null>(null);
  const familyIdRef = useRef(familyId);
  familyIdRef.current = familyId;
  const familyIdResolvedRef = useRef(false);
  const familyIdPromiseRef = useRef<Promise<string | null> | null>(null);

  const ensureFamilyId = useCallback(async () => {
    if (familyIdResolvedRef.current) {
      return familyIdRef.current;
    }
    if (familyIdPromiseRef.current) {
      return familyIdPromiseRef.current;
    }

    const promise = getFamilyId(supabase).then((id) => {
      // Only treat the id as resolved once we actually have one. getFamilyId
      // returns null for a read error too, and caching that null poisoned
      // every later upload in the session: handleFileUpload bailed out
      // before reporting anything, leaving the wizard on an endless
      // "Foto wird hochgeladen" spinner with no error and no retry.
      if (id) {
        familyIdResolvedRef.current = true;
      }
      familyIdRef.current = id;
      setFamilyId(id);
      familyIdPromiseRef.current = null;
      return id;
    });

    familyIdPromiseRef.current = promise;
    return promise;
  }, [supabase]);

  return { familyId, familyIdRef, ensureFamilyId };
}
