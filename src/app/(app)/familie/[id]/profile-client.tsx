"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Cake,
  Pencil,
} from "lucide-react";
import type { Database } from "@/types/database";
import { DocumentCard } from "@/components/ordilo/document-card";
import { TaskCard, type TaskCardData } from "@/components/ordilo/task-card";
import { TimelineItem } from "@/components/ordilo/timeline-item";
import type { MemberOption } from "@/components/ordilo/member-form";
import {
  formatRelations,
  nameMap,
  type MemberRelation,
} from "@/lib/family/relations";
import {
  buildTimelineEvents,
  sortTimelineEvents,
  type ProfileDocument,
  type ProfileTask,
  type ProfileDateEntity,
} from "@/lib/profile-utils";
import { formatGermanDate, isBirthdayToday, getDaysUntilBirthday } from "@/lib/format";
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from "@/lib/schemas/extraction";
import { useDocumentViewer } from "@/lib/scan/scan-context";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

export interface ProfileClientProps {
  member: MemberRow;
  documents: ProfileDocument[];
  tasks: ProfileTask[];
  dateEntities: ProfileDateEntity[];
  documentTitles?: Map<string, string | null>;
  /** A short-lived signed URL for the member's uploaded photo, if any. */
  photoUrl?: string | null;
  /** The member's relationships, e.g. "Mutter von Emma", "Partnerin von Chris". */
  relations?: MemberRelation[];
  /** Other members of the same family — the people a relation can point at. */
  otherMembers?: MemberOption[];
}

export function ProfileClient({
  member: initialMember,
  documents,
  tasks,
  dateEntities,
  documentTitles,
  photoUrl: initialPhotoUrl,
  relations: initialRelations = [],
  otherMembers = [],
}: ProfileClientProps) {
  const { openDocument } = useDocumentViewer();

  // Editing happens on its own page (/familie/[id]/bearbeiten), so these
  // are read-only here — a save navigates back and the server re-renders.
  const member = initialMember;
  const photoUrl = initialPhotoUrl;
  const relations = initialRelations;

  const formattedBirthdate = formatGermanDate(member.birthdate);
  const avatarColor = member.avatar_color ?? "#305460";
  const initial = member.name.charAt(0).toUpperCase() || "?";
  // Kept separate from the compact birthdate meta line below — a person is
  // usually several things at once ("Mutter von Emma und Hanna · Partnerin
  // von Chris"), and the profile page has room to spell that out.
  const relationship = formatRelations(relations, nameMap(otherMembers)) || null;
  // The role already leads the relationship line — repeating it next to the
  // birthdate would say "Mutter" twice.
  const metaLine = [relationship ? null : member.role, formattedBirthdate]
    .filter(Boolean)
    .join(" · ");

  const docTypeMap = new Map<string, string | null>();
  for (const doc of documents) {
    const label = doc.document_type
      ? DOCUMENT_TYPE_LABELS[doc.document_type as DocumentType] ?? null
      : null;
    docTypeMap.set(doc.id, label);
  }

  const timelineEvents = sortTimelineEvents(
    buildTimelineEvents(documents, tasks, dateEntities),
    "desc",
  ).map((event) => {
    let description: string | undefined;
    if (event.type === "document" && event.documentId) {
      description = docTypeMap.get(event.documentId) ?? undefined;
    }
    return { ...event, description };
  });

  const taskCardData: TaskCardData[] = tasks.map((task) => ({
    id: task.id,
    family_id: member.family_id,
    document_id: task.document_id,
    title: task.title,
    description: null,
    due_date: task.due_date,
    status: task.status,
    confidence: 0,
    confirmed: true,
    created_at: "",
    tags: [],
    assigned_to: null,
    completed_at: null,
    document_title: task.document_id ? documentTitles?.get(task.document_id) ?? null : null,
  }));

  const navigateToDocument = (docId: string) => {
    void openDocument(docId);
  };

  const birthdayToday = isBirthdayToday(member.birthdate);
  const daysUntilBirthday = getDaysUntilBirthday(member.birthdate);
  const birthdaySoon =
    !birthdayToday && daysUntilBirthday !== null && daysUntilBirthday <= 7;

  return (
    <div className="app-page-stack">
      {/* Back link + edit */}
      <div className="flex items-center justify-between">
        <Link
          href="/familie"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Link>
        <Link
          href={`/familie/${member.id}/bearbeiten`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          data-testid="profile-edit-button"
        >
          <Pencil className="h-4 w-4" />
          Bearbeiten
        </Link>
      </div>

      {/* Birthday banner */}
      {(birthdayToday || birthdaySoon) && (
        <div
          className="flex items-center gap-3 rounded-ordilo-sm border border-[var(--apricot)]/20 bg-[var(--apricot)]/[0.06] p-3 animate-card-in"
          data-testid="birthday-banner"
        >
          <Cake
            className={`size-5 shrink-0 text-[var(--apricot)] ${birthdayToday ? "animate-sparkle-pulse" : ""}`}
            strokeWidth={1.75}
          />
          <p className="text-sm font-medium text-foreground">
            {birthdayToday
              ? `Heute hat ${member.name} Geburtstag!`
              : daysUntilBirthday === 1
                ? `${member.name} hat morgen Geburtstag`
                : `${member.name} hat in ${daysUntilBirthday} Tagen Geburtstag`}
          </p>
        </div>
      )}

      {/* Steckbrief header — avatar, name, meta, quick stats */}
      <div className="relative overflow-hidden rounded-ordilo-md border border-border p-4 animate-card-in">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--sand)] to-[var(--sand-light)]" />
        <div
          className="absolute -top-12 -right-12 size-32 rounded-full bg-[var(--petrol)] opacity-[0.04] blur-2xl animate-banner-glow"
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-4">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt=""
              aria-hidden="true"
              className="size-16 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div
              className="flex size-16 shrink-0 items-center justify-center rounded-full text-2xl font-semibold text-white"
              style={{ backgroundColor: avatarColor }}
              aria-hidden="true"
            >
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-foreground">
              {member.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {metaLine}
            </p>
            {relationship && (
              <p className="mt-0.5 text-sm text-muted-foreground" data-testid="profile-relationship">
                {relationship}
              </p>
            )}
            {/* Quick stats */}
            <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
              <span>{documents.length} Dokumente</span>
              {tasks.length > 0 && <span>· {tasks.length} offen</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Documents section */}
      <section className="space-y-2" data-testid="profile-documents">
        <h2 className="text-sm font-semibold text-muted-foreground">Dokumente</h2>
        {documents.length === 0 ? (
          <p className="rounded-ordilo-sm border border-border bg-card px-3 py-4 text-center text-sm text-muted-foreground">
            Noch keine Dokumente für diese Person — kommt alles mit der Zeit.
          </p>
        ) : (
          <div className="space-y-2 stagger-children">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                title={doc.title}
                originalFilename={doc.original_filename}
                mimeType={null}
                status={doc.status}
                createdAt={doc.created_at}
                documentType={doc.document_type}
                onClick={() => navigateToDocument(doc.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Open tasks */}
      {taskCardData.length > 0 && (
        <section className="space-y-2" data-testid="profile-tasks">
          <h2 className="text-sm font-semibold text-muted-foreground">Offene Aufgaben</h2>
          <div className="space-y-2 stagger-children" data-testid="profile-task-list">
            {taskCardData.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </section>
      )}

      {/* Timeline */}
      {timelineEvents.length > 0 && (
        <section className="space-y-2" data-testid="profile-timeline">
          <h2 className="text-sm font-semibold text-muted-foreground">Verlauf</h2>
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
        </section>
      )}

    </div>
  );
}
