"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  History,
  LogOut,
  Settings,
} from "lucide-react";
import { useState, type ReactElement } from "react";
import { logout } from "@/app/(app)/actions";
import { OrdiloMark } from "@/components/ordilo/ordilo-mark";
import { OrdiloWordmark } from "@/components/ordilo/ordilo-wordmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

function CollapsedSidebarTooltip({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      {collapsed && (
        <TooltipContent side="right" sideOffset={10}>
          {label}
        </TooltipContent>
      )}
    </Tooltip>
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
              "flex w-full items-center rounded-ordilo-sm py-3 text-sm text-muted-foreground transition-colors hover:bg-[var(--sand-warm)] hover:text-foreground focus-ring",
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
            "group relative flex items-center rounded-ordilo-sm transition-colors focus-ring",
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
  const currentTab = useSearchParams().get("tab");

  return (
    <aside
      aria-label="Hauptnavigation"
      data-collapsed={collapsed}
      className={cn(
        "fixed left-0 top-0 z-50 hidden h-dvh w-[224px] flex-col overflow-hidden lg:flex",
        collapsed && "[clip-path:inset(0_148px_0_0)]",
      )}
    >
      <div
        className={cn(
          "sidebar-motion pointer-events-none absolute inset-0",
          collapsed && "-translate-x-[148px]",
        )}
        style={DESKTOP_SHELL_SURFACE_STYLE}
        aria-hidden="true"
      />
      <div
        className={cn(
          "relative z-10 py-4",
          collapsed ? "flex flex-col items-center gap-2 px-3" : "px-3",
        )}
      >
        <Link
          href="/home"
          className={cn(
            "rounded-ordilo-sm focus-ring",
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
            "flex size-10 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-[var(--sand-warm)] hover:text-foreground focus-ring",
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
          "sidebar-motion relative z-10 h-12 shrink-0 px-3 text-sm leading-tight",
          collapsed || !greeting || !displayName
            ? "-translate-x-2 opacity-0"
            : "translate-x-0 opacity-100",
        )}
      >
        <span className="text-muted-foreground">{greeting},</span>
        <br />
        <span className="font-medium text-foreground">{displayName}</span>
      </div>

      <div className="relative z-10 min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-3">
        <ul className="space-y-px">
          {NAV_TABS.map((tab) => {
            const selected = isTabActive(tab, pathname);
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <CollapsedSidebarTooltip label={tab.label} collapsed={collapsed}>
                  <Link
                    href={tab.href}
                    aria-current={selected ? "page" : undefined}
                    className={cn(
                      "group relative block min-h-10 rounded-ordilo-sm py-2 transition-colors duration-150",
                      collapsed ? "w-[52px]" : "w-full",
                      selected
                        ? "bg-[color-mix(in_srgb,var(--petrol)_8%,var(--sand-light))] font-medium text-[var(--petrol)]"
                        : "text-muted-foreground hover:bg-[var(--sand-warm)] hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "sidebar-motion absolute top-1/2 flex size-5 -translate-y-1/2 items-center justify-center",
                        collapsed ? "left-4" : "left-3",
                      )}
                      data-testid={`sidebar-nav-icon-${tab.label}`}
                    >
                      <Icon
                        className="size-5 transition-colors"
                        aria-hidden="true"
                        strokeWidth={selected ? 2.1 : 1.75}
                      />
                    </span>
                    <span
                      className={cn(
                        "sidebar-motion block whitespace-nowrap pl-11 pr-6 text-sm font-normal",
                        collapsed
                          ? "-translate-x-2 opacity-0"
                          : "translate-x-0 opacity-100",
                      )}
                    >
                      {tab.label}
                    </span>
                    {selected && (
                      <span
                        className={cn(
                          "sidebar-motion absolute size-1.5 rounded-full bg-[var(--apricot)]",
                          collapsed
                            ? "right-1.5 top-1.5 opacity-100"
                            : "right-3 top-1/2 -translate-y-1/2 opacity-100",
                        )}
                        aria-hidden="true"
                        data-testid="sidebar-active-dot"
                      />
                    )}
                  </Link>
                </CollapsedSidebarTooltip>
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
            <CollapsedSidebarTooltip label="Chat-Verlauf" collapsed={collapsed}>
              <Link
                href="/suche?history=1"
                className={cn(
                  "relative block min-h-10 rounded-ordilo-sm py-2 text-muted-foreground transition-colors hover:bg-[var(--sand-warm)] hover:text-foreground",
                  collapsed ? "w-[52px]" : "w-full",
                )}
                data-testid="sidebar-chat-history-link"
              >
                <span
                  className={cn(
                    "sidebar-motion absolute top-1/2 flex size-5 -translate-y-1/2 items-center justify-center",
                    collapsed ? "left-4" : "left-3",
                  )}
                  data-testid="sidebar-chat-history-icon"
                >
                  <History className="size-5" aria-hidden="true" strokeWidth={1.75} />
                </span>
                <span
                  className={cn(
                    "sidebar-motion block whitespace-nowrap pl-11 pr-3 text-sm font-normal",
                    collapsed
                      ? "-translate-x-2 opacity-0"
                      : "translate-x-0 opacity-100",
                  )}
                >
                  Chat-Verlauf
                </span>
              </Link>
            </CollapsedSidebarTooltip>
          </li>
        </ul>

      </div>

      <div className="relative z-10">
        <SidebarScenery timeOfDay={timeOfDay} collapsed={collapsed} />
        <SidebarFooter profile={profile} collapsed={collapsed} />
      </div>
    </aside>
  );
}
