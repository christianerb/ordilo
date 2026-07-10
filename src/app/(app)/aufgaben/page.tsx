import { createClient } from "@/lib/supabase/server";
import type { TaskCardData } from "@/components/ordilo/task-card";
import type { Database } from "@/types/database";
import { AufgabenClient } from "./aufgaben-client";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

async function loadInitialTasks(): Promise<{
  tasks: TaskCardData[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data: family } = await supabase
    .from("families")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!family) {
    return { tasks: [], error: null };
  }

  const { data: taskRows, error: tasksError } = await supabase
    .from("tasks")
    .select("*")
    .eq("family_id", family.id)
    .eq("confirmed", true)
    .order("created_at", { ascending: false });

  if (tasksError) {
    return {
      tasks: [],
      error: "Aufgaben konnten nicht geladen werden. Bitte versuche es später nochmal.",
    };
  }

  if (!taskRows || taskRows.length === 0) {
    return { tasks: [], error: null };
  }

  const taskIds = taskRows.map((task) => task.id);
  const { data: linkRows } = await supabase
    .from("task_documents")
    .select("task_id, document_id")
    .in("task_id", taskIds);

  const allDocumentIds = [
    ...new Set([
      ...taskRows.map((task) => task.document_id),
      ...(linkRows ?? []).map((link) => link.document_id),
    ].filter((id): id is string => Boolean(id))),
  ];

  const titleMap = new Map<string, string | null>();
  if (allDocumentIds.length > 0) {
    const { data: documentRows } = await supabase
      .from("documents")
      .select("id, title")
      .in("id", allDocumentIds);

    for (const document of (documentRows ?? []) as Pick<DocumentRow, "id" | "title">[]) {
      titleMap.set(document.id, document.title);
    }
  }

  const linkedByTask = new Map<string, { id: string; title: string | null }[]>();
  for (const link of linkRows ?? []) {
    const existing = linkedByTask.get(link.task_id) ?? [];
    existing.push({
      id: link.document_id,
      title: titleMap.get(link.document_id) ?? null,
    });
    linkedByTask.set(link.task_id, existing);
  }

  const tasks = (taskRows as TaskRow[]).map((task) => ({
    ...task,
    document_title: task.document_id ? titleMap.get(task.document_id) ?? null : null,
    linked_documents: linkedByTask.get(task.id) ?? [],
  }));

  return { tasks, error: null };
}

export default async function AufgabenPage() {
  const { tasks: initialTasks, error } = await loadInitialTasks();
  const taskKey = initialTasks
    .map((task) => `${task.id}:${task.status}:${task.title}:${task.due_date ?? ""}:${task.linked_documents?.length ?? 0}`)
    .join("|");

  return (
    <AufgabenClient
      key={taskKey || `empty:${error ?? "ok"}`}
      initialTasks={initialTasks}
      initialError={error}
    />
  );
}
