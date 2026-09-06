import { getDocumentNextStep } from "@ordilo/document-contract";
import { useRouter } from "expo-router";

import { OrdiloButton } from "@/src/components/ui";
import { useFamily } from "@/src/lib/family-context";
import { recordFirstValueEvent } from "@/src/lib/first-value";

export function DocumentNextStep({
  documentId,
  title,
  eventsCreated,
  tasksKept,
}: {
  documentId: string;
  title: string;
  eventsCreated: number;
  tasksKept: number;
}) {
  const router = useRouter();
  const { family } = useFamily();
  const next = getDocumentNextStep({ eventsCreated, tasksKept });

  return (
    <OrdiloButton
      title={next.label}
      size="lg"
      onPress={() => {
        if (family) {
          void recordFirstValueEvent(family.id, {
            name: "document_next_step_selected",
            documentId,
            destination: next.kind,
          });
        }
        if (next.kind === "question") {
          router.replace({
            pathname: "/suche",
            params: { q: `Was ist in „${title}“ wichtig? Bitte zeig mir die Fundstelle.` },
          });
        } else {
          router.replace({
            pathname: "/(tabs)/plan",
            params: { tab: next.kind === "calendar" ? "calendar" : "tasks" },
          });
        }
      }}
    />
  );
}
