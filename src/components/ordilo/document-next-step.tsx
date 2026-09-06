"use client";

import { getDocumentNextStep } from "@ordilo/document-contract";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { recordDocumentValueEvent } from "@/lib/analytics/first-value";

export function DocumentNextStep({
  documentId,
  title,
  eventsCreated,
  tasksKept,
  onLeave,
}: {
  documentId: string;
  title: string;
  eventsCreated: number;
  tasksKept: number;
  onLeave: () => void;
}) {
  const router = useRouter();
  const next = getDocumentNextStep({ eventsCreated, tasksKept });
  return (
    <Button
      type="button"
      size="lg"
      className="min-h-12 w-full max-w-xs rounded-ordilo-md whitespace-normal"
      onClick={() => {
        void recordDocumentValueEvent({
          name: "document_next_step_selected",
          documentId,
          destination: next.kind,
        });
        onLeave();
        router.push(
          next.kind === "question"
            ? `/suche?q=${encodeURIComponent(`Was ist in „${title}“ wichtig? Bitte zeig mir die Fundstelle.`)}`
            : next.kind === "calendar" ? "/aufgaben?tab=planer" : "/aufgaben",
        );
      }}
    >
      {next.label}
    </Button>
  );
}
