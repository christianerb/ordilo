"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { formatGermanDate } from "@/lib/format";
import { fetchDocumentAttribution } from "@/lib/attribution";
import { useChangeEffect } from "@/lib/hooks/use-change-effect";
import { cn } from "@/lib/utils";

/**
 * "Von Christian hinzugefügt · 15.08.2026" — who in the family put this
 * document into the family book, and when.
 *
 * A shared family book without names is anonymous: every document looks
 * like it appeared by itself, and nobody knows who to ask about it. The
 * line stays quiet (small, muted, one line) because it answers a question
 * that only comes up occasionally.
 *
 * Falls back gracefully: an uploader who is not linked to a family member
 * (or a document from before the link existed) shows just the date rather
 * than an empty "Von  hinzugefügt".
 */
export function DocumentAttribution({
  uploadedBy,
  createdAt,
  className,
}: {
  uploadedBy: string | null;
  createdAt: string | null;
  className?: string;
}) {
  const [name, setName] = useState<string | null>(null);
  const [isCurrentUser, setIsCurrentUser] = useState(false);

  useChangeEffect(() => {
    let cancelled = false;
    void (async () => {
      const attribution = await fetchDocumentAttribution(uploadedBy);
      if (cancelled) return;
      setName(attribution.name);
      setIsCurrentUser(attribution.isCurrentUser);
    })();
    return () => {
      cancelled = true;
    };
  }, [uploadedBy]);

  const date = formatGermanDate(createdAt);
  const who = isCurrentUser ? "dir" : name;

  if (!who && !date) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground",
        className,
      )}
      data-testid="document-attribution"
    >
      <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
      {who ? (
        <>
          Von {who} hinzugefügt
          {date && ` · ${date}`}
        </>
      ) : (
        `Hinzugefügt am ${date}`
      )}
    </span>
  );
}
