"use client";

import { useCallback, useState } from "react";

/**
 * Click-to-reveal for a document's encrypted secret.
 *
 * `documents.secret` holds an AES-256-GCM envelope; the plaintext exists
 * nowhere in the database and never reaches the chat model. POST
 * /api/documents/[id]/secret is the single place that decrypts it, on
 * explicit user request. This hook wraps that request plus the show/hide
 * and copy state around it, so the document detail sheet and the chat
 * answer card share one implementation instead of two copies that drift.
 *
 * The value is fetched on demand and kept in component state only — the
 * caller unmounting (sheet closed, chat scrolled away) drops it.
 */
export function useSecretReveal(documentId: string | null) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reveal = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/secret`, {
        method: "POST",
      });
      const body = (await res.json()) as { secret?: string; error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Geheim konnte nicht geladen werden.");
      }
      setRevealed(body.secret ?? "");
      setShow(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Geheim konnte nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  const toggleShow = useCallback(() => setShow((s) => !s), []);

  const copy = useCallback(async () => {
    if (revealed == null) return;
    try {
      await navigator.clipboard.writeText(revealed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (insecure context, denied permission);
      // the value stays visible for manual selection.
    }
  }, [revealed]);

  return { revealed, show, loading, copied, error, reveal, toggleShow, copy };
}
