"use client";

import { useCallback, useRef, useState } from "react";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/**
 * How long a revealed password stays on screen, and how long a copied one
 * stays in the clipboard. Password managers settle around half a minute:
 * long enough to type it over or paste it into a login form, short enough
 * that it is gone before the phone is handed to someone else.
 */
const EXPIRY_MS = 30_000;

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
 * Both exposures expire after {@link EXPIRY_MS}: the value disappears from
 * the screen (and from component state — showing it again re-fetches it),
 * and a copied value is cleared from the clipboard. Clearing the clipboard
 * needs document focus, so a clear that fails while the user is pasting
 * elsewhere is retried once when the page regains focus.
 */
export function useSecretReveal(documentId: string | null) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set while a clipboard clear is waiting for the page to regain focus. */
  const pendingClear = useRef<(() => void) | null>(null);

  useMountEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (clipboardTimer.current) clearTimeout(clipboardTimer.current);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    if (pendingClear.current) pendingClear.current();
  });

  const armHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      // Dropped entirely, not just hidden: seeing it again is a deliberate
      // act that goes through the reveal endpoint once more.
      setRevealed(null);
      setShow(false);
    }, EXPIRY_MS);
  }, []);

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
      armHide();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Geheim konnte nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [documentId, armHide]);

  const toggleShow = useCallback(() => {
    setShow((s) => !s);
    armHide();
  }, [armHide]);

  const copy = useCallback(async () => {
    if (revealed == null) return;
    try {
      await navigator.clipboard.writeText(revealed);
    } catch {
      // Clipboard may be unavailable (insecure context, denied permission);
      // the value stays selectable on screen.
      return;
    }

    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1500);

    const clear = async () => {
      // Only clear what we put there. `readText` is unavailable or denied
      // in several browsers — then the password is overwritten anyway,
      // which is the safer of the two mistakes right after a deliberate
      // password copy.
      try {
        const current = await navigator.clipboard.readText();
        if (current !== revealed) return true;
      } catch {
        // Fall through and clear.
      }
      try {
        await navigator.clipboard.writeText("");
        return true;
      } catch {
        // Writing needs document focus — the user is most likely pasting
        // the password somewhere else right now. Retry once on return.
        return false;
      }
    };

    if (clipboardTimer.current) clearTimeout(clipboardTimer.current);
    clipboardTimer.current = setTimeout(() => {
      void clear().then((done) => {
        if (done || typeof window === "undefined") return;
        const onFocus = () => {
          window.removeEventListener("focus", onFocus);
          pendingClear.current = null;
          void clear();
        };
        window.addEventListener("focus", onFocus);
        pendingClear.current = () => window.removeEventListener("focus", onFocus);
      });
    }, EXPIRY_MS);
  }, [revealed]);

  return { revealed, show, loading, copied, error, reveal, toggleShow, copy };
}
