"use client";

import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

type TrashItem = {
  item_type: string;
  id: string;
  label: string;
  deleted_at: string;
};

export function RestoreTrashItems({
  items,
  loadFailed = false,
}: {
  items: TrashItem[];
  loadFailed?: boolean;
}) {
  const [visibleItems, setVisibleItems] = useState(items);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const restore = async (item: TrashItem) => {
    if (restoringId) return;
    setRestoringId(item.id);

    try {
      if (item.item_type === "document") {
        const response = await fetch(`/api/documents/${item.id}/restore`, {
          method: "POST",
        });
        if (!response.ok) throw new Error("document restore failed");
      } else {
        const { data, error } = await createClient().rpc("restore_task", {
          p_task_id: item.id,
        });
        if (error || !data) throw new Error("task restore failed");
      }

      setVisibleItems((current) =>
        current.filter((candidate) => candidate.id !== item.id),
      );
      toast.success(
        item.item_type === "document"
          ? "Dokument wiederhergestellt"
          : "Aufgabe wiederhergestellt",
      );
    } catch {
      toast.error("Wiederherstellen hat nicht geklappt.");
    } finally {
      setRestoringId(null);
    }
  };

  if (loadFailed) {
    return (
      <div className="mt-6 rounded-ordilo-md border border-border bg-card p-5 text-sm text-muted-foreground">
        Der Papierkorb konnte nicht geladen werden. Bitte versuche es nochmal.
      </div>
    );
  }

  if (visibleItems.length === 0) {
    return (
      <div className="mt-6 rounded-ordilo-md border border-dashed border-border bg-[var(--sand)] p-6 text-center text-sm text-muted-foreground">
        Der Papierkorb ist leer.
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      {visibleItems.map((item) => {
        const isRestoring = restoringId === item.id;
        return (
          <div
            key={`${item.item_type}:${item.id}`}
            className="flex items-center gap-3 rounded-ordilo-sm border border-border bg-card p-3 shadow-card"
          >
            <Trash2
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {item.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.item_type === "task" ? "Aufgabe" : "Dokument oder Notiz"}
                {" · gelöscht am "}
                {new Intl.DateTimeFormat("de-DE", {
                  dateStyle: "medium",
                }).format(new Date(item.deleted_at))}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void restore(item)}
              disabled={restoringId !== null}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-ordilo-sm px-2 text-sm font-medium text-[var(--petrol)] transition-colors hover:bg-[var(--petrol)]/10 disabled:cursor-wait disabled:opacity-50"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {isRestoring ? "Wird geladen …" : "Wiederherstellen"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
