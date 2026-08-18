"use client";

import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The shared surface of the Dokumente library — the page header, the
 * search/filter toolbar, and the one grouped list its three tabs
 * (Dokumente, Notizen, Kontakte) all render into.
 *
 * All three used to bring their own header, their own search field and
 * their own list card, which made switching tabs feel like switching
 * products. These pieces are what keep them one page.
 */

/**
 * Page header: what this page is, how much is in it, and the one action
 * that adds to it. Sits on a sage wash so it reads as the top of a page
 * rather than as another card.
 */
export function LibraryPageHeader({
  title,
  count,
  description,
  action,
}: {
  title: string;
  /** Shown as a pill next to the title. */
  count?: number;
  description?: string;
  /** The single primary action, right-aligned. */
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3 rounded-ordilo-md border border-[color-mix(in_srgb,var(--border)_55%,transparent)] bg-[color-mix(in_srgb,var(--wash-sage)_48%,var(--surface-box))] px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-[var(--petrol)]">
            {title}
          </h1>
          {count !== undefined && (
            <span
              key={count}
              className="animate-count-settle rounded-full bg-[var(--surface-box)] px-2.5 py-0.5 text-sm font-medium tabular-nums text-[var(--mist-dark)]"
              data-testid="library-header-count"
            >
              {count}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </header>
  );
}

/** One row holding the search field and everything that narrows the list. */
export function LibraryToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex items-center gap-2", className)}>{children}</div>;
}

/**
 * The library's search field. Rectangular and calm rather than a floating
 * pill — it belongs to the list underneath it, not to the page.
 */
export function LibrarySearchField({
  value,
  onChange,
  placeholder,
  label,
  testId,
  trailing,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Accessible name — the field itself carries no visible label. */
  label: string;
  testId?: string;
  /** Optional control pinned inside the field's right edge. */
  trailing?: ReactNode;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search
        className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        data-testid={testId}
        className={cn(
          "h-11 w-full rounded-ordilo-sm border border-border bg-[var(--sand)] pl-11 text-base text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-[var(--petrol)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm",
          trailing ? "pr-12" : "pr-3",
        )}
      />
      {trailing && (
        <span className="absolute top-1/2 right-1.5 -translate-y-1/2">
          {trailing}
        </span>
      )}
    </div>
  );
}

/**
 * The button that reveals the rest of the filters. Labelled, because an
 * icon-only funnel is the control people ask about most.
 */
export function LibraryFilterButton({
  open,
  onToggle,
  active = false,
  testId,
}: {
  open: boolean;
  onToggle: () => void;
  /** True when a filter is currently narrowing the list. */
  active?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "press-scale inline-flex h-11 shrink-0 items-center gap-2 rounded-ordilo-sm border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        open || active
          ? "border-[var(--petrol)]/25 bg-[var(--petrol)]/10 text-[var(--petrol)]"
          : "border-border bg-[var(--sand)] text-[var(--mist-dark)] hover:text-foreground",
      )}
      data-testid={testId}
    >
      <SlidersHorizontal className="size-4" aria-hidden="true" />
      <span>Filter</span>
      {active && (
        <span
          className="size-1.5 rounded-full bg-[var(--petrol)]"
          aria-hidden="true"
        />
      )}
      <ChevronDown
        className={cn(
          "size-4 transition-transform duration-200 motion-reduce:transition-none",
          open && "rotate-180",
        )}
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * The list itself: one grouped surface with hairlines between rows.
 *
 * It carries no shadow — it always sits inside the page's own box, and
 * nested cards rely on background contrast instead (DESIGN.md, the
 * No-Shadow-Stacking rule).
 */
export function LibraryList({
  children,
  testId,
  className,
}: {
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <ul
      data-testid={testId}
      className={cn(
        "animate-card-in divide-y divide-[color-mix(in_srgb,var(--border)_60%,transparent)] overflow-hidden rounded-ordilo-sm border border-[color-mix(in_srgb,var(--border)_75%,transparent)] bg-[var(--surface-story)]",
        className,
      )}
    >
      {children}
    </ul>
  );
}

/**
 * One row in the library list. Everything a row can say has a fixed
 * place: the tile on the left, title and one line of detail in the
 * middle, date and status on the right, actions at the far end.
 */
export function LibraryRow({
  leading,
  title,
  titleAdornment,
  subtitle,
  meta,
  trailing,
  onClick,
  actionLabel,
  testId,
}: {
  leading: ReactNode;
  title: ReactNode;
  /** Small marker after the title (e.g. a hover-only open arrow). */
  titleAdornment?: ReactNode;
  subtitle?: ReactNode;
  /** Right-hand column: date, status, phone number. */
  meta?: ReactNode;
  /** Row-level controls that must not trigger the row itself. */
  trailing?: ReactNode;
  onClick?: () => void;
  /** Accessible name of the row button, e.g. "Stromrechnung öffnen". */
  actionLabel?: string;
  testId?: string;
}) {
  return (
    <li
      className="group flex items-center gap-1 transition-colors hover:bg-[color-mix(in_srgb,var(--sand-warm)_55%,transparent)]"
      data-testid={testId}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={actionLabel}
        className="press-scale flex min-h-18 min-w-0 flex-1 items-center gap-3 rounded-ordilo-sm px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        {leading}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate font-medium text-foreground">
              {title}
            </span>
            {titleAdornment}
          </span>
          {subtitle && (
            <span className="mt-0.5 block truncate text-sm text-muted-foreground">
              {subtitle}
            </span>
          )}
        </span>
        {meta && (
          <span className="flex shrink-0 flex-col items-end gap-1 pl-1 text-right">
            {meta}
          </span>
        )}
      </button>
      {trailing && <span className="shrink-0 pr-1.5">{trailing}</span>}
    </li>
  );
}

/**
 * The square icon tile in front of a row. Takes a collection's color
 * when the row has one, and the calm sand tile when it does not.
 */
export function LibraryTile({
  icon: Icon,
  background,
  foreground,
  className,
}: {
  icon: LucideIcon;
  background?: string;
  foreground?: string;
  className?: string;
}) {
  const style: CSSProperties | undefined = background
    ? { backgroundColor: background }
    : undefined;

  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-ordilo-sm",
        !background && "bg-[var(--sand-light)]",
        className,
      )}
      style={style}
      aria-hidden="true"
    >
      <Icon
        className="size-4.5"
        style={{ color: foreground ?? "var(--mist-dark)" }}
      />
    </span>
  );
}

/** The small pill that carries a row's status or date on the right. */
export function LibraryBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * What the list says when a filter matches nothing. Not an empty state —
 * the family has documents, this selection just doesn't.
 */
export function LibraryNoResults({
  message,
  hint,
  onReset,
  resetLabel = "Alles wieder zeigen",
}: {
  message: string;
  hint?: string;
  onReset?: () => void;
  resetLabel?: string;
}) {
  return (
    <div className="rounded-ordilo-sm border border-[color-mix(in_srgb,var(--border)_75%,transparent)] bg-[var(--surface-story)] p-6 text-center text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{message}</p>
      {hint && <p className="mt-1">{hint}</p>}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="mt-2 font-medium text-[var(--petrol)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {resetLabel}
        </button>
      )}
    </div>
  );
}
