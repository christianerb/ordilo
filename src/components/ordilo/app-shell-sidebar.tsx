"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  History,
  LogOut,
  Plus,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { logout } from "@/app/(app)/actions";
import type { CollectionFormValues } from "@/components/ordilo/collection-form";
import { useCollections } from "@/lib/collections/collections-context";
import { OrdiloMark } from "@/components/ordilo/ordilo-mark";
import { OrdiloWordmark } from "@/components/ordilo/ordilo-wordmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { getCollectionColor, getCollectionIcon } from "@/lib/schemas/collections";
import { cn } from "@/lib/utils";
import {
  DESKTOP_SHELL_SURFACE_STYLE,
  getGreeting,
  getProfileDisplayName,
  isSubItemActive,
  isTabActive,
  getTimeOfDay,
  NAV_TABS,
  type SidebarProfile,
  type TimeOfDay,
  TIME_REFRESH_INTERVAL_MS,
} from "./app-shell-shared";

const CollectionForm = dynamic(() =>
  import("@/components/ordilo/collection-form").then((m) => m.CollectionForm),
);

export function SidebarCollections({
  activePathname,
  collapsed,
}: {
  activePathname: string;
  collapsed: boolean;
}) {
  const router = useRouter();
  const { collections: list, addCollection } = useCollections();
  const [addOpen, setAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleAddSubmit = async (values: CollectionFormValues) => {
    setServerError(null);
    setIsSubmitting(true);
    const result = await addCollection(values);
    setIsSubmitting(false);

    if (!result.success) {
      setServerError(result.error);
      return;
    }

    setAddOpen(false);
    router.refresh();
  };

  return (
    <div>
      {collapsed ? (
        <div className="mx-3 border-t border-border/60" aria-hidden="true" />
      ) : (
        <p className="px-3 text-xs font-medium text-muted-foreground">
          Sammlungen
        </p>
      )}
      <ul className="mt-1 space-y-px">
        {list.map((collection) => {
          const href = `/sammlungen/${collection.id}`;
          const active =
            activePathname === href || activePathname.startsWith(`${href}/`);
          const Icon = getCollectionIcon(collection.icon);
          const colorOption = getCollectionColor(collection.color);
          return (
            <li key={collection.id}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? collection.name : undefined}
                className={cn(
                  "flex min-h-10 items-center rounded-ordilo-sm px-3 py-2 transition-[background-color,box-shadow,color] duration-150",
                  collapsed ? "justify-center" : "justify-start",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:bg-[var(--sand-warm)] hover:text-foreground",
                )}
                style={{
                  backgroundColor: active
                    ? `color-mix(in srgb, ${colorOption.bg} 38%, var(--sand-light))`
                    : undefined,
                  boxShadow: active
                    ? `inset 0 0 0 1px color-mix(in srgb, ${colorOption.fg} 28%, transparent)`
                    : undefined,
                }}
              >
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: colorOption.bg }}
                  aria-hidden="true"
                >
                  <Icon
                    className="size-3.5"
                    style={{ color: colorOption.fg }}
                    strokeWidth={1.75}
                  />
                </span>
                <span
                  className={cn(
                    "overflow-hidden truncate text-sm font-normal transition-[max-width,opacity,margin-left] duration-200 ease-out",
                    collapsed
                      ? "ml-0 max-w-0 opacity-0"
                      : "ml-2.5 max-w-[8rem] opacity-100",
                  )}
                >
                  {collection.name}
                </span>
                {!collapsed && active && (
                  <span
                    className="ml-auto size-1.5 shrink-0 rounded-full bg-[var(--apricot)] animate-nav-dot"
                    aria-hidden="true"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => {
          setServerError(null);
          setAddOpen(true);
        }}
        aria-label="Sammlung hinzufügen"
        title={collapsed ? "Sammlung hinzufügen" : undefined}
        className={cn(
          "mt-1 flex min-h-10 w-full items-center rounded-ordilo-sm px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-[var(--sand-warm)] hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          collapsed ? "justify-center" : "justify-start",
        )}
      >
        <Plus className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
        <span
          className={cn(
            "overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin-left] duration-200 ease-out",
            collapsed ? "ml-0 max-w-0 opacity-0" : "ml-2.5 max-w-[10rem] opacity-100",
          )}
        >
          Neue Sammlung
        </span>
      </button>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[85dvh] max-w-md overflow-y-auto rounded-t-ordilo-xl"
        >
          <SheetHeader>
            <SheetTitle>Sammlung hinzufügen</SheetTitle>
            <SheetDescription>
              Gib der Sammlung einen Namen, ein Icon und eine Farbe.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <CollectionForm
              submitLabel="Sammlung hinzufügen"
              onSubmit={handleAddSubmit}
              isSubmitting={isSubmitting}
              serverError={serverError}
              onClearServerError={() => setServerError(null)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SidebarFooter({
  profile,
  collapsed,
}: {
  profile?: SidebarProfile;
  collapsed: boolean;
}) {
  if (!profile) {
    return (
      <div className="border-t border-border px-3 py-3">
        <form action={logout}>
          <button
            type="submit"
            title={collapsed ? "Abmelden" : undefined}
            className={cn(
              "flex w-full items-center rounded-ordilo-sm py-3 text-sm text-muted-foreground transition-colors hover:bg-[var(--sand-warm)] hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              collapsed ? "justify-center px-0" : "gap-3 px-3",
            )}
          >
            <LogOut className="size-5 shrink-0" aria-hidden="true" strokeWidth={1.75} />
            {!collapsed && <span>Abmelden</span>}
          </button>
        </form>
      </div>
    );
  }

  const displayName = getProfileDisplayName(profile);
  const initial = displayName.charAt(0).toUpperCase() || "?";

  const avatar = (
    <span
      className="relative flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white animate-avatar-pop"
      style={{ backgroundColor: "var(--petrol)" }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={displayName}
          title={collapsed ? displayName : profile.familyName}
          className={cn(
            "group relative flex items-center rounded-ordilo-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            collapsed
              ? "justify-center p-1.5 hover:bg-[var(--sand-warm)]"
              : "w-full gap-2.5 p-2 hover:bg-white/60",
          )}
        >
          {avatar}
          {!collapsed && (
            <>
              <span className="block min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground">
                {profile.familyName}
              </span>
              <ChevronsUpDown
                className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:text-muted-foreground"
                aria-hidden="true"
              />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/familie">
            <Settings className="size-4" aria-hidden="true" />
            Familie
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            void logout();
          }}
        >
          <LogOut className="size-4" aria-hidden="true" />
          Abmelden
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (collapsed) {
    return <div className="flex justify-center pb-3">{menu}</div>;
  }

  return (
    <div className="border-t border-border/60 px-3 py-3">
      {menu}
    </div>
  );
}

const SCENERY_TONES: Record<TimeOfDay, { sky: string; light: string }> = {
  morning: { sky: "var(--wash-apricot)", light: "var(--apricot-light)" },
  day: { sky: "var(--wash-blue)", light: "var(--petrol)" },
  evening: { sky: "var(--wash-apricot)", light: "var(--apricot)" },
  night: { sky: "var(--petrol-darker)", light: "var(--warm-white)" },
};

/**
 * A small time-aware family-journal scene. It sits near the profile rather
 * than the working area, so its warmth never competes with navigation.
 */
function SidebarScenery({
  timeOfDay,
  collapsed,
}: {
  timeOfDay: TimeOfDay;
  collapsed: boolean;
}) {
  if (collapsed) return null;
  const tone = SCENERY_TONES[timeOfDay];
  const isNight = timeOfDay === "night";

  return (
    <div
      data-testid="sidebar-scenery"
      className="px-4 pb-2 pt-3 text-[var(--mist-dark)]"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 192 64"
        fill="none"
        className="h-auto w-full overflow-visible"
      >
        <path
          d="M0 48 C21 31 39 36 57 48 C74 36 91 38 108 48 C129 27 153 31 192 47 V64 H0 Z"
          fill={tone.sky}
          className="transition-colors duration-500"
          opacity={isNight ? 0.45 : 0.7}
        />
        <path
          d="M0 51 C25 42 44 44 64 53 C92 43 120 45 143 53 C161 45 176 46 192 51"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          opacity="0.42"
        />
        <path
          d="M83 50 V35 L94 26 L105 35 V50 M89 50 V40 H99 V50 M88 35 H100"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.72"
        />
        <path
          d="M36 50 V34 M25 39 L36 25 L47 39 M43 50 V40 M52 50 V38 M45 42 L52 31 L59 42"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.62"
        />
        {isNight ? (
          <path
            d="M155 11 A9 9 0 1 0 164 21 A7 7 0 1 1 155 11 Z"
            fill={tone.light}
            className="transition-colors duration-500"
            opacity="0.9"
          />
        ) : (
          <circle
            cx="157"
            cy="17"
            r="7"
            fill={tone.light}
            className="transition-colors duration-500"
            opacity="0.85"
          />
        )}
      </svg>
    </div>
  );
}

export function SidebarNav({
  pathname,
  profile,
  collapsed,
  onToggleCollapse,
}: {
  pathname: string;
  profile?: SidebarProfile;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const [greeting, setGreeting] = useState<string | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("day");

  useMountEffect(() => {
    const refresh = () => {
      const now = new Date();
      setGreeting(getGreeting(now));
      setTimeOfDay(getTimeOfDay(now));
    };
    refresh();
    const interval = window.setInterval(refresh, TIME_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  });

  const displayName = profile ? getProfileDisplayName(profile) : null;
  const hasActiveCollection = pathname.startsWith("/sammlungen/");
  const currentTab = useSearchParams().get("tab");

  return (
    <aside
      aria-label="Hauptnavigation"
      data-collapsed={collapsed}
      className={cn(
        "fixed left-0 top-0 z-50 hidden h-dvh flex-col overflow-hidden transition-[width] duration-200 lg:flex",
        collapsed ? "w-[76px]" : "w-[224px]",
      )}
      style={DESKTOP_SHELL_SURFACE_STYLE}
    >
      <div
        className={cn(
          "relative py-4",
          collapsed ? "flex flex-col items-center gap-2 px-3" : "px-3",
        )}
      >
        <Link
          href="/home"
          className={cn(
            "rounded-ordilo-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            collapsed && "flex justify-center",
          )}
          aria-label="Ordilo Startseite"
        >
          {collapsed ? (
            <OrdiloMark size={28} className="text-[var(--petrol)]" />
          ) : (
            <OrdiloWordmark mascotSize={28} labelClassName="text-sm font-semibold text-foreground" />
          )}
        </Link>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"}
          aria-pressed={collapsed}
          className={cn(
            "flex size-10 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-[var(--sand-warm)] hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            !collapsed && "absolute right-2 top-2.5",
          )}
        >
          {collapsed ? (
            <ChevronsRight className="size-4" aria-hidden="true" />
          ) : (
            <ChevronsLeft className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <div
        className={cn(
          "overflow-hidden px-3 text-sm leading-tight transition-[max-height,opacity,padding-bottom] duration-200 ease-out",
          collapsed || !greeting || !displayName
            ? "max-h-0 pb-0 opacity-0"
            : "max-h-12 pb-4 opacity-100",
        )}
      >
        <span className="text-muted-foreground">{greeting},</span>
        <br />
        <span className="font-medium text-foreground">{displayName}</span>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-3">
        <ul className="space-y-px">
          {NAV_TABS.map((tab) => {
            const active = isTabActive(tab, pathname);
            const selected = active && !hasActiveCollection;
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={selected ? "page" : undefined}
                  title={collapsed ? tab.label : undefined}
                  className={cn(
                    "group flex min-h-10 items-center rounded-ordilo-sm px-3 py-2 transition-colors duration-150",
                    collapsed ? "justify-center" : "justify-start",
                    selected
                      ? "bg-[color-mix(in_srgb,var(--petrol)_8%,var(--sand-light))] font-medium text-[var(--petrol)]"
                      : "text-muted-foreground hover:bg-[var(--sand-warm)] hover:text-foreground",
                  )}
                >
                  <Icon
                    className="size-5 shrink-0 transition-colors"
                    aria-hidden="true"
                    strokeWidth={selected ? 2.1 : 1.75}
                  />
                  <span
                    className={cn(
                      "overflow-hidden whitespace-nowrap text-sm font-normal transition-[max-width,opacity,margin-left] duration-200 ease-out",
                      collapsed
                        ? "ml-0 max-w-0 opacity-0"
                        : "ml-3 max-w-[7rem] opacity-100",
                    )}
                  >
                    {tab.label}
                  </span>
                  {!collapsed && selected && (
                    <span
                      className="ml-auto size-1.5 rounded-full bg-[var(--apricot)] animate-nav-dot"
                      aria-hidden="true"
                    />
                  )}
                </Link>
                {tab.children && !collapsed && (
                  <ul className="mt-px space-y-px">
                    {tab.children.map((child) => {
                      const childActive =
                        selected &&
                        isSubItemActive(child, pathname, currentTab);
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            className={cn(
                              "flex min-h-9 items-center rounded-ordilo-sm py-1.5 pl-11 pr-3 text-sm transition-colors duration-150",
                              childActive
                                ? "font-medium text-[var(--petrol)]"
                                : "text-muted-foreground hover:bg-[var(--sand-warm)] hover:text-foreground",
                            )}
                          >
                            {child.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
          <li>
            <Link
              href="/suche?history=1"
              title={collapsed ? "Chat-Verlauf" : undefined}
              className={cn(
                "flex min-h-10 items-center rounded-ordilo-sm px-3 py-2 text-muted-foreground transition-colors hover:bg-[var(--sand-warm)] hover:text-foreground",
                collapsed ? "justify-center" : "justify-start",
              )}
              data-testid="sidebar-chat-history-link"
            >
              <History className="size-5 shrink-0" aria-hidden="true" strokeWidth={1.75} />
              <span
                className={cn(
                  "overflow-hidden whitespace-nowrap text-sm font-normal transition-[max-width,opacity,margin-left] duration-200 ease-out",
                  collapsed ? "ml-0 max-w-0 opacity-0" : "ml-3 max-w-[7rem] opacity-100",
                )}
              >
                Chat-Verlauf
              </span>
            </Link>
          </li>
        </ul>

        <SidebarCollections
          activePathname={pathname}
          collapsed={collapsed}
        />
      </div>

      <SidebarScenery timeOfDay={timeOfDay} collapsed={collapsed} />
      <SidebarFooter profile={profile} collapsed={collapsed} />
    </aside>
  );
}
