"use client";

import { useCallback, useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * "Im eigenen Kalender sehen" — copies the family's ICS subscription URL,
 * creating the feed token on first use. Lives in the family settings: a
 * one-time setup, not a daily planner surface.
 */
export function CalendarFeedCard({ familyId }: { familyId: string }) {
  const [copying, setCopying] = useState(false);

  const copyFeedLink = useCallback(async () => {
    setCopying(true);
    try {
      // Created lazily on tap: settings render without touching Supabase.
      const supabase = createClient();
      let { data: tokenRow } = await supabase
        .from("calendar_feed_tokens")
        .select("token")
        .eq("family_id", familyId)
        .maybeSingle();
      if (!tokenRow) {
        const { data: created, error } = await supabase
          .from("calendar_feed_tokens")
          .insert({ family_id: familyId })
          .select("token")
          .single();
        if (error || !created) {
          toast.error("Der Kalender-Link konnte nicht erstellt werden.");
          return;
        }
        tokenRow = created;
      }
      const url = `${window.location.origin}/api/calendar/ics?token=${tokenRow.token}`;
      await navigator.clipboard.writeText(url);
      toast.success(
        "Link kopiert. Füge ihn in deiner Kalender-App als Abo hinzu.",
      );
    } catch {
      toast.error("Der Link konnte nicht kopiert werden.");
    } finally {
      setCopying(false);
    }
  }, [familyId]);

  return (
    <section
      className="flex items-center gap-3 rounded-ordilo-md border border-border bg-card p-4 shadow-card"
      aria-label="Kalender abonnieren"
    >
      <Link2
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          Familienkalender abonnieren
        </p>
        <p className="text-xs text-muted-foreground">
          Zeigt eure Termine auch in Google, Apple oder Outlook. Der Link
          gilt für die ganze Familie.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={() => void copyFeedLink()}
        disabled={copying}
        data-testid="calendar-feed-copy-button"
      >
        Link kopieren
      </Button>
    </section>
  );
}
