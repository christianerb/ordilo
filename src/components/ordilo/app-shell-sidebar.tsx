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
import { useCallback, useLayoutEffect, useRef, useState } from "react";
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
  getTimeOfDay,
  isTabActive,
  NAV_TABS,
  type SidebarProfile,
  type TimeOfDay,
  TIME_REFRESH_INTERVAL_MS,
} from "./app-shell-shared";

const CollectionForm = dynamic(() =>
  import("@/components/ordilo/collection-form").then((m) => m.CollectionForm),
);

let cachedSidebarGrainUrl: string | null = null;
const SIDEBAR_GRAIN_TILE_CSS_PX = 128;
const SUNRISE_HOUR = 6;
const SUNSET_HOUR = 20;

function getSidebarGrainUrl(): string | null {
  if (typeof document === "undefined") return null;
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
    return null;
  }
  if (cachedSidebarGrainUrl) return cachedSidebarGrainUrl;

  const resolution = SIDEBAR_GRAIN_TILE_CSS_PX * 2;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const imageData = ctx.createImageData(resolution, resolution);
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = 36;
      imageData.data[i + 1] = 36;
      imageData.data[i + 2] = 36;
      imageData.data[i + 3] = Math.random() * 10;
    }
    ctx.putImageData(imageData, 0, 0);
    cachedSidebarGrainUrl = canvas.toDataURL();
    return cachedSidebarGrainUrl;
  } catch {
    return null;
  }
}

function useSlidingHighlight(activeKey: string, collapsed: boolean) {
  const containerRef = useRef<HTMLUListElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const [rect, setRect] = useState<{ top: number; height: number } | null>(null);

  const registerItem = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) itemRefs.current.set(key, el);
      else itemRefs.current.delete(key);
    },
    [],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    const active = itemRefs.current.get(activeKey);
    if (!container || !active) {
      setRect(null);
      return;
    }
    const containerBox = container.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    setRect({ top: activeBox.top - containerBox.top, height: activeBox.height });
    const timer = window.setTimeout(() => {
      const box = container.getBoundingClientRect();
      const activeNow = itemRefs.current.get(activeKey);
      if (activeNow) {
        const activeBoxNow = activeNow.getBoundingClientRect();
        setRect({ top: activeBoxNow.top - box.top, height: activeBoxNow.height });
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [activeKey, collapsed]);

  return { containerRef, registerItem, rect };
}

const SCENERY_PALETTES: Record<
  TimeOfDay,
  {
    skyTop: string;
    skyBottom: string;
    sunColor: string;
    sunOpacity: number;
    farHill: string;
    midHill: string;
    foreground: string;
    showStars: boolean;
  }
> = {
  morning: {
    skyTop: "#FDF0E1",
    skyBottom: "#EAF1EE",
    sunColor: "#F7C98A",
    sunOpacity: 0.9,
    farHill: "#BFD4C6",
    midHill: "#A6C4B2",
    foreground: "#8FB19B",
    showStars: false,
  },
  day: {
    skyTop: "#EAF1EE",
    skyBottom: "#DCE8E2",
    sunColor: "#F4C89A",
    sunOpacity: 0.85,
    farHill: "#BFD4C6",
    midHill: "#A6C4B2",
    foreground: "#8FB19B",
    showStars: false,
  },
  evening: {
    skyTop: "#F3DCC9",
    skyBottom: "#D9C7D0",
    sunColor: "#E8894C",
    sunOpacity: 0.9,
    farHill: "#B3C7BC",
    midHill: "#94AEA0",
    foreground: "#7DA08D",
    showStars: false,
  },
  night: {
    skyTop: "#25424A",
    skyBottom: "#193232",
    sunColor: "#EDF0F2",
    sunOpacity: 0.85,
    farHill: "#3C5A50",
    midHill: "#2F4B41",
    foreground: "#243A33",
    showStars: true,
  },
};

function getCelestialPosition(hour: number | null): { x: number; y: number } {
  const DEFAULT = { x: 116, y: 34 };
  if (hour === null) return DEFAULT;

  const isDaytime = hour >= SUNRISE_HOUR && hour < SUNSET_HOUR;
  const dayLength = SUNSET_HOUR - SUNRISE_HOUR;
  const nightLength = 24 - dayLength;

  const t = isDaytime
    ? (hour - SUNRISE_HOUR) / dayLength
    : ((hour >= SUNSET_HOUR ? hour - SUNSET_HOUR : hour + (24 - SUNSET_HOUR)) /
      nightLength);

  const x = 20 + t * (212 - 20);
  const horizonY = 60;
  const amplitude = 40;
  const y = horizonY - Math.sin(Math.PI * t) * amplitude;
  return { x, y };
}

function SidebarScenery({
  timeOfDay,
  hour,
}: {
  timeOfDay: TimeOfDay;
  hour: number | null;
}) {
  const palette = SCENERY_PALETTES[timeOfDay];
  const { x, y } = getCelestialPosition(hour);

  return (
    <div className="px-3 pb-2" aria-hidden="true">
      <svg
        viewBox="0 0 232 96"
        className="h-auto w-full overflow-hidden rounded-ordilo-sm"
        role="presentation"
        preserveAspectRatio="xMidYMax slice"
      >
        <defs>
          <linearGradient id="ordilo-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.skyTop} />
            <stop offset="100%" stopColor={palette.skyBottom} />
          </linearGradient>
        </defs>
        <rect width="232" height="96" fill="url(#ordilo-sky)" />
        {palette.showStars && (
          <g fill={palette.sunColor} opacity="0.7">
            <circle cx="46" cy="18" r="1.1" />
            <circle cx="80" cy="12" r="0.9" />
            <circle cx="150" cy="16" r="1" />
            <circle cx="190" cy="26" r="0.9" />
          </g>
        )}
        <g
          className="transition-transform duration-1000 ease-out"
          style={{ transform: `translate(${x}px, ${y}px)` }}
        >
          <circle r="14" fill={palette.sunColor} opacity={palette.sunOpacity} />
        </g>
        <path d="M0 70 Q58 44 116 62 T232 58 V96 H0 Z" fill={palette.farHill} />
        <path d="M0 80 Q70 60 140 74 T232 72 V96 H0 Z" fill={palette.midHill} />
        <g>
          <rect x="176" y="66" width="20" height="16" rx="1.5" fill="#EDE6DA" />
          <path d="M174 66 L186 56 L198 66 Z" fill="#5E7365" />
          <rect x="183" y="73" width="6" height="9" fill="#7E9483" />
        </g>
        <g>
          <rect x="41" y="66" width="3" height="14" rx="1" fill="#7B6B57" />
          <path d="M42.5 40 C31 48 34 66 42.5 66 C51 66 54 48 42.5 40 Z" fill="#6E8B72" />
        </g>
        <g>
          <rect x="70" y="70" width="2.5" height="12" rx="1" fill="#7B6B57" />
          <path d="M71 52 C62 58 64 72 71 72 C78 72 80 58 71 52 Z" fill="#82A184" />
        </g>
        <path d="M0 88 Q80 78 150 86 T232 84 V96 H0 Z" fill={palette.foreground} />
      </svg>
    </div>
  );
}

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
        <p className="px-3 text-xs font-medium tracking-wide text-muted-foreground/70">
          Sammlungen
        </p>
      )}
      <ul className="mt-1 space-y-0.5">
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
                  "flex items-center rounded-ordilo-sm py-2.5 px-3 transition-[background-color,box-shadow,color] duration-150",
                  collapsed ? "justify-center" : "justify-start",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:brightness-95",
                )}
                style={{
                  backgroundColor: `color-mix(in srgb, ${colorOption.bg} 55%, transparent)`,
                  boxShadow: active
                    ? `inset 0 0 0 1px color-mix(in srgb, ${colorOption.fg} 35%, transparent)`
                    : undefined,
                }}
              >
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-ordilo-sm"
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
                    "overflow-hidden truncate text-sm transition-[max-width,opacity,margin-left] duration-200 ease-out",
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
        title={collapsed ? "Sammlung hinzufügen" : undefined}
        className={cn(
          "mt-1 flex w-full items-center rounded-ordilo-sm py-2.5 px-3 text-sm text-muted-foreground transition-colors hover:bg-[var(--sand-warm)] hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
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
          Sammlung hinzufügen
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
    <div className="px-3 pb-3">
      <div className="relative overflow-hidden rounded-ordilo-sm border border-border/60 bg-[var(--sand-warm)]">
        <div
          className="pointer-events-none absolute -top-6 -right-6 size-20 rounded-full bg-[var(--petrol)] opacity-[0.06] blur-2xl animate-banner-glow"
          aria-hidden="true"
        />
        <div className="relative">{menu}</div>
      </div>
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
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("day");
  const [hour, setHour] = useState<number | null>(null);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [mascotMood, setMascotMood] = useState<OrdiloMascotMood>("idle");
  const [grainUrl, setGrainUrl] = useState<string | null>(null);

  useMountEffect(() => {
    const refresh = () => {
      const now = new Date();
      setTimeOfDay(getTimeOfDay(now));
      setGreeting(getGreeting(now));
      setHour(now.getHours() + now.getMinutes() / 60);
    };
    refresh();
    const interval = window.setInterval(refresh, TIME_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  });

  useMountEffect(() => {
    setGrainUrl(getSidebarGrainUrl());
  });

  useMountEffect(() => {
    setMascotMood("greeting");
    const timer = window.setTimeout(() => setMascotMood("idle"), 1300);
    return () => window.clearTimeout(timer);
  });

  const displayName = profile ? getProfileDisplayName(profile) : null;
  const activeTabHref =
    NAV_TABS.find((tab) => isTabActive(tab, pathname))?.href ?? "";
  const { containerRef: navListRef, registerItem: registerNavItem, rect: navPillRect } =
    useSlidingHighlight(activeTabHref, collapsed);

  return (
    <aside
      aria-label="Hauptnavigation"
      data-collapsed={collapsed}
      className={cn(
        "fixed left-0 top-0 z-50 hidden h-dvh flex-col overflow-hidden transition-[width] duration-200 lg:flex",
        collapsed ? "w-[76px]" : "w-[180px]",
      )}
      style={DESKTOP_SHELL_SURFACE_STYLE}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-500 ease-out"
        style={{
          backgroundImage: grainUrl ? `url(${grainUrl})` : undefined,
          backgroundSize: `${SIDEBAR_GRAIN_TILE_CSS_PX}px ${SIDEBAR_GRAIN_TILE_CSS_PX}px`,
          opacity: grainUrl ? 1 : 0,
        }}
      />

      <div
        className={cn(
          "relative py-5",
          collapsed ? "flex flex-col items-center gap-3 px-3" : "px-6",
        )}
      >
        <Link
          href="/home"
          onMouseEnter={() => setMascotMood("greeting")}
          onMouseLeave={() => setMascotMood("idle")}
          className="flex flex-col items-center gap-1 rounded-ordilo-sm transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Ordilo Startseite"
        >
          <OrdiloMascot
            size={collapsed ? 26 : 34}
            mood={mascotMood}
            style={{ color: "var(--petrol)" }}
          />
          {!collapsed && (
            <span className="text-base font-semibold tracking-tight text-foreground">
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
            "flex size-8 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-[var(--sand-warm)] hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            !collapsed && "absolute right-6 top-5",
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
          "-mt-1 overflow-hidden px-6 text-sm leading-tight transition-[max-height,opacity,padding-bottom] duration-200 ease-out",
          collapsed || !greeting || !displayName
            ? "max-h-0 pb-0 opacity-0"
            : "max-h-12 pb-3 opacity-100",
        )}
      >
        <span className="text-muted-foreground">{greeting},</span>
        <br />
        <span className="font-medium text-foreground">{displayName}</span>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pt-2 pb-3">
        <ul ref={navListRef} className="relative space-y-0.5">
          {navPillRect && (
            <span
              aria-hidden="true"
              className="absolute inset-x-0 rounded-ordilo-sm shadow-card transition-[transform,height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                transform: `translateY(${navPillRect.top}px)`,
                height: navPillRect.height,
                backgroundColor:
                  "color-mix(in srgb, var(--petrol) 8%, var(--sand-light) 92%)",
              }}
            />
          )}
          {NAV_TABS.map((tab) => {
            const active = isTabActive(tab, pathname);
            const Icon = tab.icon;
            return (
              <li key={tab.href} ref={registerNavItem(tab.href)}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? tab.label : undefined}
                  className={cn(
                    "group relative z-10 flex items-center rounded-ordilo-sm py-3 px-3 transition-colors duration-150",
                    collapsed ? "justify-center" : "justify-start",
                    active
                      ? "font-medium text-[var(--petrol)]"
                      : "text-muted-foreground hover:bg-[var(--sand-warm)] hover:text-foreground",
                  )}
                >
                  <Icon
                    className="size-5 shrink-0 transition-colors"
                    aria-hidden="true"
                    strokeWidth={active ? 2.2 : 1.75}
                  />
                  <span
                    className={cn(
                      "overflow-hidden whitespace-nowrap text-[14px] font-light transition-[max-width,opacity,margin-left] duration-200 ease-out",
                      collapsed
                        ? "ml-0 max-w-0 opacity-0"
                        : "ml-3 max-w-[7rem] opacity-100",
                    )}
                  >
                    {tab.label}
                  </span>
                  {!collapsed && active && (
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

      <div
        className={cn(
          "overflow-hidden transition-[max-height,opacity] duration-200 ease-out",
          collapsed ? "max-h-0 opacity-0" : "max-h-36 opacity-100",
        )}
      >
        <SidebarScenery timeOfDay={timeOfDay} hour={hour} />
      </div>

      <SidebarFooter profile={profile} collapsed={collapsed} />
    </aside>
  );
}
