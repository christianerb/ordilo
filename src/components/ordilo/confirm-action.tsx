"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  OrdiloDrawer,
  OrdiloDrawerFooter,
  OrdiloDrawerHeader,
} from "@/components/ordilo/ordilo-drawer";

/**
 * ConfirmAction — a shared "are you sure?" overlay for destructive actions.
 *
 * One component, two surfaces: `variant="dialog"` for the centered shadcn
 * Dialog (aufgaben, familie, sammlungen), `variant="drawer"` for the
 * bottom-anchored OrdiloDrawer (dokumente). Both share the same anatomy:
 * a title, a description, an optional error banner, and a pinned footer
 * with "Abbrechen" + a destructive confirm button.
 *
 * `loading` swaps the confirm button for a spinner + `loadingLabel`.
 * `children` slots in extra content between the description and the footer
 * (e.g. the calendar recurrence options).
 */
export function ConfirmAction({
  variant,
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Abbrechen",
  onConfirm,
  loading = false,
  loadingLabel,
  error,
  testId,
  confirmTestId,
  children,
}: {
  variant: "dialog" | "drawer";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  loading?: boolean;
  loadingLabel?: string;
  error?: string | null;
  testId?: string;
  confirmTestId?: string;
  children?: React.ReactNode;
}) {
  const errorBanner =
    error && (
      <div
        role="alert"
        className="rounded-ordilo-sm border border-destructive/30 bg-destructive/5 px-3 py-2"
      >
        <p className="text-sm font-medium text-destructive">{error}</p>
      </div>
    );

  const footer = (
    <>
      <Button
        type="button"
        variant="outline"
        className="flex-1"
        onClick={() => onOpenChange(false)}
        disabled={loading}
      >
        {cancelLabel}
      </Button>
      <Button
        type="button"
        variant="destructive"
        className="flex-1"
        onClick={onConfirm}
        disabled={loading}
        data-testid={confirmTestId}
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {loadingLabel ?? confirmLabel}
          </>
        ) : (
          confirmLabel
        )}
      </Button>
    </>
  );

  if (variant === "drawer") {
    return (
      <OrdiloDrawer
        variant="form"
        open={open}
        onOpenChange={onOpenChange}
        data-testid={testId}
      >
        <OrdiloDrawerHeader title={title} description={description} />
        {children}
        {errorBanner}
        <OrdiloDrawerFooter>{footer}</OrdiloDrawerFooter>
      </OrdiloDrawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-ordilo-md" data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {errorBanner}
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
