"use client";

import * as React from "react";
import { XIcon } from "lucide-react";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsDesktop } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";

/**
 * The one overlay surface in Ordilo.
 *
 * Every drawer in the app used to hand-roll its own geometry at the call site:
 * thirteen `SheetContent`s, three of them byte-identical, two with no classes
 * at all. This component owns that geometry so a drawer is chosen by what it is
 * for, not by remembering a class string.
 *
 * Three variants, and the choice is about the job, not the look:
 *
 * - `picker` — one decision, committed on tap ("Wer macht das?", "Wann?").
 *   No close button: choosing is the way out, and an X next to a list of
 *   answers invites the reading that you must confirm.
 * - `form`   — something to fill in and submit. Bottom-anchored and centred, so
 *   it stays thumb-reachable on a phone and doesn't sprawl on a desktop.
 * - `detail` — a record to read and edit. The only variant that changes
 *   anchor: bottom on a phone, right-hand panel from `lg` up, because a
 *   full-height side panel on a phone is the worst of both.
 *
 * Composition mirrors the shape every one of those drawers already had:
 * a header that names the thing, a body that scrolls, an optional footer that
 * does not.
 */

type OrdiloDrawerVariant = "picker" | "form" | "detail";

const VariantContext = React.createContext<OrdiloDrawerVariant>("form");

const useDrawerVariant = () => React.useContext(VariantContext);

/**
 * Geometry per variant.
 *
 * The `data-[vaul-drawer-direction=…]:` prefixes are deliberate rather than
 * decorative: shadcn's `DrawerContent` sets its defaults behind exactly those
 * prefixes, and `cn`/tailwind-merge only dedupes utilities whose full variant
 * chain matches. A bare `max-w-md` would not replace
 * `data-[vaul-drawer-direction=right]:sm:max-w-sm`, it would race it.
 */
const CONTENT_VARIANTS: Record<OrdiloDrawerVariant, string> = {
  picker: cn(
    "mx-auto w-full",
    "data-[vaul-drawer-direction=bottom]:max-w-md",
    "data-[vaul-drawer-direction=bottom]:max-h-[85dvh]",
    "data-[vaul-drawer-direction=bottom]:rounded-t-ordilo-xl",
  ),
  form: cn(
    "mx-auto w-full",
    "data-[vaul-drawer-direction=bottom]:max-w-md",
    "data-[vaul-drawer-direction=bottom]:max-h-[85dvh]",
    "data-[vaul-drawer-direction=bottom]:rounded-t-ordilo-xl",
  ),
  detail: cn(
    "w-full",
    "data-[vaul-drawer-direction=bottom]:max-h-[92dvh]",
    "data-[vaul-drawer-direction=bottom]:rounded-t-ordilo-xl",
    "data-[vaul-drawer-direction=right]:h-full",
    "data-[vaul-drawer-direction=right]:w-full",
    "data-[vaul-drawer-direction=right]:sm:max-w-md",
    "data-[vaul-drawer-direction=right]:lg:max-w-xl",
    "data-[vaul-drawer-direction=right]:xl:max-w-[42rem]",
  ),
};

const HEADER_VARIANTS: Record<OrdiloDrawerVariant, string> = {
  picker: "px-5 pt-1 pb-3",
  form: "px-5 pt-1 pb-3",
  // The detail header is a titlebar over scrolling content, so it earns a
  // rule and a tint the scrolled body can pass under.
  detail: "border-b border-border bg-[var(--sand)]/70 px-5 py-4",
};

const TITLE_VARIANTS: Record<OrdiloDrawerVariant, string> = {
  picker: "text-base font-semibold",
  form: "text-base font-semibold",
  detail: "text-[15px]",
};

/**
 * A picker's description is the name of the thing being acted on, so it gets
 * one line and an ellipsis. A form or detail description is a sentence
 * explaining the drawer, and clipping that would lose the explanation.
 */
const DESCRIPTION_VARIANTS: Record<OrdiloDrawerVariant, string> = {
  picker: "truncate text-sm",
  form: "text-sm",
  detail: "text-sm",
};

export interface OrdiloDrawerProps
  extends Omit<React.ComponentProps<typeof DrawerContent>, "children"> {
  variant?: OrdiloDrawerVariant;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  /**
   * Show the X. Defaults to true everywhere except `picker`, where tapping an
   * answer is the way out.
   */
  showCloseButton?: boolean;
  /** Escape hatch for the rare drawer that must not close on outside click. */
  dismissible?: boolean;
}

export function OrdiloDrawer({
  variant = "form",
  open,
  onOpenChange,
  children,
  className,
  showCloseButton,
  dismissible,
  ...props
}: OrdiloDrawerProps) {
  const desktop = useIsDesktop();
  // Only the detail variant leaves the bottom edge; pickers and forms stay
  // thumb-reachable at every width.
  const preferred = variant === "detail" && desktop ? "right" : "bottom";

  // Changing the anchor remounts the drawer (see the `key` below), which would
  // throw away the state of whatever is inside it — a half-corrected document,
  // a half-typed form. So the anchor is frozen for as long as the drawer is
  // open and only catches up with the viewport while it is closed. Resizing
  // past `lg` mid-edit therefore leaves the open drawer where it is; the next
  // time it opens, it opens on the right.
  const [anchor, setAnchor] = React.useState<"bottom" | "right">(preferred);
  if (!open && anchor !== preferred) setAnchor(preferred);

  const withClose = showCloseButton ?? variant !== "picker";

  return (
    <Drawer
      // vaul sets up its drag physics and enter animation from the direction,
      // so switching sides needs a fresh mount rather than a restyle. Safe
      // here because `anchor` only ever changes while the drawer is closed.
      key={anchor}
      open={open}
      onOpenChange={onOpenChange}
      direction={anchor}
      dismissible={dismissible}
    >
      <VariantContext.Provider value={variant}>
        <DrawerContent
          className={cn(
            "bg-[var(--surface-box)]",
            // Keeps the last row of a bottom drawer clear of the home
            // indicator without padding the sides of a side panel.
            "data-[vaul-drawer-direction=bottom]:pb-[env(safe-area-inset-bottom)]",
            CONTENT_VARIANTS[variant],
            className,
          )}
          {...props}
        >
          {children}
          {withClose && (
            <DrawerClose className="absolute top-2.5 right-2.5 flex size-11 items-center justify-center rounded-ordilo-sm opacity-70 ring-offset-background transition-opacity hover:bg-secondary hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden">
              <XIcon className="size-4" aria-hidden="true" />
              <span className="sr-only">Schließen</span>
            </DrawerClose>
          )}
        </DrawerContent>
      </VariantContext.Provider>
    </Drawer>
  );
}

export interface OrdiloDrawerHeaderProps
  extends Omit<React.ComponentProps<"div">, "title"> {
  title: React.ReactNode;
  /**
   * Radix requires a description for every dialog. Pass the real one, or set
   * `descriptionHidden` to keep it for screen readers only — never omit it.
   */
  description: React.ReactNode;
  descriptionHidden?: boolean;
  /**
   * Sits beside the title on the same line — a status pill, a count, a badge.
   * Kept out of `title` so the heading element stays plain text for anyone
   * navigating by headings.
   */
  titleAdornment?: React.ReactNode;
  titleClassName?: string;
  descriptionClassName?: string;
  /** Ref onto the title, for drawers that move focus there on open. */
  titleRef?: React.Ref<HTMLHeadingElement>;
}

/** Pairs the title with its adornment, or leaves it alone when there is none. */
function withAdornment(
  titleNode: React.ReactNode,
  adornment: React.ReactNode,
): React.ReactNode {
  if (!adornment) return titleNode;
  return (
    <div className="flex items-center gap-3">
      {titleNode}
      {adornment}
    </div>
  );
}

export function OrdiloDrawerHeader({
  title,
  description,
  descriptionHidden = false,
  titleAdornment,
  className,
  titleClassName,
  descriptionClassName,
  titleRef,
  children,
  ...props
}: OrdiloDrawerHeaderProps) {
  const variant = useDrawerVariant();

  return (
    <div
      data-slot="drawer-header"
      className={cn(
        // Left-aligned at every width — shadcn centres bottom-drawer headers,
        // which reads as a dialog rather than the top of a document.
        "flex shrink-0 flex-col gap-1 text-left",
        HEADER_VARIANTS[variant],
        // Room for the X, which is positioned against the content.
        "pr-16",
        className,
      )}
      {...props}
    >
      {withAdornment(
        <DrawerTitle
          ref={titleRef}
          // A ref onto a heading exists in order to focus it, and a heading is
          // not focusable without this.
          tabIndex={titleRef ? -1 : undefined}
          className={cn(TITLE_VARIANTS[variant], titleClassName)}
        >
          {title}
        </DrawerTitle>,
        titleAdornment,
      )}
      <DrawerDescription
        className={cn(
          descriptionHidden ? "sr-only" : DESCRIPTION_VARIANTS[variant],
          descriptionClassName,
        )}
      >
        {description}
      </DrawerDescription>
      {children}
    </div>
  );
}

/**
 * The scrolling region. Owns `min-h-0` so the flex column actually clips
 * instead of pushing the footer off-screen — the bug that made the old sheets
 * feel like they "didn't work" on long content.
 */
export function OrdiloDrawerBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const variant = useDrawerVariant();

  return (
    <div
      data-slot="drawer-body"
      className={cn(
        "min-h-0 flex-1 overflow-y-auto px-5",
        variant === "detail" ? "py-4" : "pb-4",
        className,
      )}
      {...props}
    />
  );
}

/** A pinned action bar. Never scrolls — the primary action stays reachable. */
export function OrdiloDrawerFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn(
        "mt-auto flex shrink-0 gap-3 border-t border-border px-5 py-4",
        className,
      )}
      {...props}
    />
  );
}

export { DrawerClose as OrdiloDrawerClose };
