"use client";

import { useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Options for the {@link useTaskMutation} hook.
 *
 * The hook owns the Supabase `tasks` update call and the optimistic /
 * revert orchestration. Components supply callbacks that know how to
 * mutate their local state and surface errors, so the same optimistic
 * pattern can be shared across the home dashboard and the Aufgaben page
 * without coupling the hook to a specific state shape or error UI.
 */
export interface UseTaskMutationOptions {
  /**
   * Apply the optimistic toggle-done update (e.g. set the task status to
   * `newStatus`). Called immediately before the Supabase update.
   */
  onOptimisticToggle: (taskId: string, newStatus: string) => void;
  /**
   * Revert a failed toggle-done. Called when the Supabase update returns
   * an error or throws.
   */
  onRevertToggle: (taskId: string, newStatus: string) => void;
  /**
   * Apply the optimistic dismiss update (e.g. remove the task from the
   * list or mark it as dismissed). Called immediately before the
   * Supabase update.
   */
  onOptimisticDismiss: (taskId: string) => void;
  /**
   * Revert a failed dismiss. Called when the Supabase update returns an
   * error or throws.
   */
  onRevertDismiss: (taskId: string) => void;
  /**
   * Called when a toggle-done mutation fails with a Supabase error object.
   * The component decides how to surface the error (e.g. a toast or an
   * inline message).
   */
  onToggleError: () => void;
  /**
   * Called when a toggle-done mutation throws an exception (e.g. a network
   * error). When omitted, falls back to {@link onToggleError} so components
   * that use the same message for both paths need only supply one.
   */
  onToggleException?: () => void;
  /**
   * Called when a dismiss mutation fails with a Supabase error object. The
   * component decides how to surface the error.
   */
  onDismissError: () => void;
  /**
   * Called when a dismiss mutation throws an exception. When omitted, falls
   * back to {@link onDismissError}.
   */
  onDismissException?: () => void;
  /**
   * Called after a successful Supabase update (no error, no exception).
   * Used to sync server state (e.g. `router.refresh()`). NOT called on
   * error or exception paths — `onToggleError` / `onDismissError` cover
   * those.
   */
  onSettled?: () => void;
}

/**
 * Shared optimistic-update mutation hook for tasks.
 *
 * Wraps the common toggle-done and dismiss pattern used by the home
 * dashboard and the Aufgaben page. The hook creates its own browser
 * Supabase client (RLS-protected) and performs the `tasks` update,
 * delegating state mutation and error reporting to the supplied
 * callbacks so behavior (revert strategy, error messages, refresh)
 * stays component-specific.
 *
 * The returned `toggleDone` and `dismiss` functions have stable
 * identities across renders (they read the latest callbacks from an
 * internal ref), so they are safe to pass to memoized children. Both
 * return `true` on success and `false` on error so callers can show
 * success toasts only after the mutation actually resolved.
 *
 * @returns `{ toggleDone, dismiss }` — async mutation functions.
 */
export function useTaskMutation(options: UseTaskMutationOptions): {
  toggleDone: (taskId: string, newStatus: string) => Promise<boolean>;
  dismiss: (taskId: string) => Promise<boolean>;
} {
  const supabase = createClient();

  // Keep the latest callbacks without re-creating the mutation functions.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const toggleDone = useCallback(
    async (taskId: string, newStatus: string): Promise<boolean> => {
      const opts = optionsRef.current;
      opts.onOptimisticToggle(taskId, newStatus);

      try {
        const { error } = await supabase
          .from("tasks")
          .update({ status: newStatus })
          .eq("id", taskId);

        if (error) {
          opts.onRevertToggle(taskId, newStatus);
          opts.onToggleError();
          return false;
        }
        opts.onSettled?.();
        return true;
      } catch {
        opts.onRevertToggle(taskId, newStatus);
        (opts.onToggleException ?? opts.onToggleError)();
        return false;
      }
    },
    [supabase],
  );

  const dismiss = useCallback(
    async (taskId: string): Promise<boolean> => {
      const opts = optionsRef.current;
      opts.onOptimisticDismiss(taskId);

      try {
        const { error } = await supabase
          .from("tasks")
          .update({ status: "dismissed" })
          .eq("id", taskId);

        if (error) {
          opts.onRevertDismiss(taskId);
          opts.onDismissError();
          return false;
        }
        opts.onSettled?.();
        return true;
      } catch {
        opts.onRevertDismiss(taskId);
        (opts.onDismissException ?? opts.onDismissError)();
        return false;
      }
    },
    [supabase],
  );

  return { toggleDone, dismiss };
}
