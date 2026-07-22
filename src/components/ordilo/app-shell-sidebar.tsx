"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  LogOut,
  Plus,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { logout } from "@/app/(app)/actions";
import type { CollectionFormValues } from "@/components/ordilo/collection-form";
import { useCollections } from "@/lib/collections/collections-context";
import { OrdiloMascot, type OrdiloMascotMood } from "@/components/ordilo/mascot";
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
  isTabActive,
  NAV_TABS,
  type SidebarProfile,
  TIME_REFRESH_INTERVAL_MS,
} from "./app-shell-shared";

const CollectionForm = dynamic(() =>
  import("@/components/ordilo/collection-form").then((m) => m.CollectionForm),
);

function SidebarCollections({
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
  const [mascotMood, setMascotMood] = useState<OrdiloMascotMood>("idle");

  useMountEffect(() => {
    const refresh = () => {
      const now = new Date();
      setGreeting(getGreeting(now));
    };
    refresh();
    const interval = window.setInterval(refresh, TIME_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  });

  useMountEffect(() => {
    setMascotMood("greeting");
    const timer = window.setTimeout(() => setMascotMood("idle"), 1300);
    return () => window.clearTimeout(timer);
  });

  const displayName = profile ? getProfileDisplayName(profile) : null;
  const hasActiveCollection = pathname.startsWith("/sammlungen/");

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
          onMouseEnter={() => setMascotMood("greeting")}
          onMouseLeave={() => setMascotMood("idle")}
          className={cn(
            "flex items-center rounded-ordilo-sm transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            collapsed ? "justify-center" : "gap-2",
          )}
          aria-label="Ordilo Startseite"
        >
          <OrdiloMascot
            size={collapsed ? 26 : 28}
            mood={mascotMood}
            style={{ color: "var(--petrol)" }}
          />
          {!collapsed && (
            <span className="text-sm font-semibold text-foreground">
              Ordilo
            </span>
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
              </li>
            );
          })}
        </ul>

        <SidebarCollections
          activePathname={pathname}
          collapsed={collapsed}
        />
      </div>

      <SidebarFooter profile={profile} collapsed={collapsed} />
    </aside>
  );
}
