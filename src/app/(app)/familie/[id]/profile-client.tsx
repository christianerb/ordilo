"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Clock, ListTodo } from "lucide-react";
import type { Database } from "@/types/database";
import { DocumentCard } from "@/components/ordilo/document-card";
import { TaskCard, type TaskCardData } from "@/components/ordilo/task-card";
import { TimelineItem } from "@/components/ordilo/timeline-item";
import { EmptyState } from "@/components/ordilo/empty-state";
import {
  buildTimelineEvents,
  sortTimelineEvents,
  type ProfileDocument,
  type ProfileTask,
  type ProfileDateEntity,
} from "@/lib/profile-utils";
import { formatGermanDate } from "@/lib/format";
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from "@/lib/schemas/extraction";
import { getPriorityLabel } from "@/lib/task-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

/**
 * Props for the ProfileClient component.
 */
export interface ProfileClientProps {
  /** The family member whose profile is displayed. */
  member: MemberRow;
  /** Documents linked to this person (via confirmed extracted_entities). */
  documents: ProfileDocument[];
  /** Open, confirmed tasks linked to this person via their documents. */
  tasks: ProfileTask[];
  /** Date entities from documents linked to this person (for timeline). */
  dateEntities: ProfileDateEntity[];
  /** Lookup map: document_id → document title (for task card source links). */
  documentTitles?: Map<string, string | null>;
}

// ---------------------------------------------------------------------------
// Section heading helper
// ---------------------------------------------------------------------------

/**
 * A section heading with an icon and German label.
 */
function SectionHeading({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon
        className="size-5 text-[var(--petrol)]"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <h2 className="text-lg font-semibold text-foreground">{children}</h2>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Person Profile Client — renders the full person profile with documents,
 * timeline, and open tasks sections.
 *
 * Each section shows a warm empty state when no data is available.
 * Document cards and timeline items are clickable and navigate to the
 * document detail view (/scan?doc=ID).
 *
 * All text in German.
 */
export function ProfileClient({
  member,
  documents,
  tasks,
  dateEntities,
  documentTitles,
}: ProfileClientProps) {
  const router = useRouter();

  // Format member data.
  const formattedBirthdate = formatGermanDate(member.birthdate);
  const avatarColor = member.avatar_color ?? "#305460";
  const initial = member.name.charAt(0).toUpperCase() || "?";

  // Build a lookup map: document_id → document type label (for descriptions).
  const docTypeMap = new Map<string, string | null>();
  for (const doc of documents) {
    const label = doc.document_type
      ? DOCUMENT_TYPE_LABELS[doc.document_type as DocumentType] ?? null
      : null;
    docTypeMap.set(doc.id, label);
  }

  // Build a lookup map: document_id → task priority label (for descriptions).
  const taskPriorityMap = new Map<string, string>();
  for (const task of tasks) {
    taskPriorityMap.set(task.document_id, getPriorityLabel(task.priority));
  }

  // Build and sort timeline events (newest first), enriched with descriptions.
  const timelineEvents = sortTimelineEvents(
    buildTimelineEvents(documents, tasks, dateEntities),
    "desc",
  ).map((event) => {
    let description: string | undefined;
    if (event.type === "document" && event.documentId) {
      description = docTypeMap.get(event.documentId) ?? undefined;
    } else if (event.type === "task" && event.documentId) {
      const priorityLabel = taskPriorityMap.get(event.documentId);
      if (priorityLabel) description = `Priorität: ${priorityLabel}`;
    }
    return { ...event, description };
  });

  // Build task card data with document titles.
  const taskCardData: TaskCardData[] = tasks.map((task) => ({
    id: task.id,
    family_id: member.family_id,
    document_id: task.document_id,
    title: task.title,
    due_date: task.due_date,
    priority: task.priority,
    status: task.status,
    confidence: 0,
    confirmed: true,
    created_at: "",
    document_title: documentTitles?.get(task.document_id) ?? null,
  }));

  // Navigate to document detail.
  const navigateToDocument = (docId: string) => {
    router.push(`/scan?doc=${docId}`);
  };

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href="/familie"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Familie
      </Link>

      {/* Member header — avatar + name + role + birthdate */}
      <div className="flex flex-col items-center gap-3 py-2">
        <div
          className="flex size-20 items-center justify-center rounded-full text-3xl font-semibold text-white"
          style={{ backgroundColor: avatarColor }}
          aria-hidden="true"
        >
          {initial}
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {member.name}
          </h1>
          {member.role && member.role.trim() !== "" && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {member.role}
            </p>
          )}
          {formattedBirthdate && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formattedBirthdate}
            </p>
          )}
        </div>
      </div>

      {/* Documents section */}
      <section className="space-y-3" data-testid="profile-documents">
        <SectionHeading icon={FileText}>Dokumente</SectionHeading>

        {documents.length === 0 ? (
          <div className="rounded-ordilo-lg border border-border bg-card p-4 shadow-card">
            <EmptyState
              icon={FileText}
              title="Keine Dokumente"
              description="Dieser Person sind noch keine Dokumente zugeordnet."
            />
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                title={doc.title}
                originalFilename={doc.original_filename}
                mimeType={null}
                status={doc.status}
                createdAt={doc.created_at}
                onClick={() => navigateToDocument(doc.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Timeline section */}
      <section className="space-y-3" data-testid="profile-timeline">
        <SectionHeading icon={Clock}>Verlauf</SectionHeading>

        {timelineEvents.length === 0 ? (
          <div className="rounded-ordilo-lg border border-border bg-card p-4 shadow-card">
            <EmptyState
              icon={Clock}
              title="Keine Ereignisse"
              description="Es gibt noch keine Ereignisse für diese Person."
            />
          </div>
        ) : (
          <div data-testid="timeline-list">
            {timelineEvents.map((event, index) => (
              <TimelineItem
                key={`${event.type}-${event.date}-${index}`}
                event={event}
                isLast={index === timelineEvents.length - 1}
                onClick={
                  event.documentId
                    ? () => navigateToDocument(event.documentId!)
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Open tasks section */}
      <section className="space-y-3" data-testid="profile-tasks">
        <SectionHeading icon={ListTodo}>Offene Aufgaben</SectionHeading>

        {taskCardData.length === 0 ? (
          <div className="rounded-ordilo-lg border border-border bg-card p-4 shadow-card">
            <EmptyState
              icon={ListTodo}
              title="Keine offenen Aufgaben"
              description="Für diese Person gibt es aktuell keine offenen Aufgaben."
            />
          </div>
        ) : (
          <div className="space-y-3" data-testid="profile-task-list">
            {taskCardData.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
