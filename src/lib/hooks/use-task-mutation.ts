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
   * Called after the Supabase update resolves — whether it succeeded or
   * returned an error object — but NOT when the call throws an exception.
   * Used to sync server state (e.g. `router.refresh()`).
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
 * internal ref), so they are safe to pass to memoized children.
 *
 * @returns `{ toggleDone, dismiss }` — async mutation functions.
 */
export function useTaskMutation(options: UseTaskMutationOptions): {
  toggleDone: (taskId: string, newStatus: string) => Promise<void>;
  dismiss: (taskId: string) => Promise<void>;
} {
  const supabase = createClient();

  // Keep the latest callbacks without re-creating the mutation functions.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const toggleDone = useCallback(
    async (taskId: string, newStatus: string) => {
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
        }
        opts.onSettled?.();
      } catch {
        opts.onRevertToggle(taskId, newStatus);
        (opts.onToggleException ?? opts.onToggleError)();
      }
    },
    [supabase],
  );

  const dismiss = useCallback(
    async (taskId: string) => {
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
        }
        opts.onSettled?.();
      } catch {
        opts.onRevertDismiss(taskId);
        (opts.onDismissException ?? opts.onDismissError)();
      }
    },
    [supabase],
  );

  return { toggleDone, dismiss };
}
