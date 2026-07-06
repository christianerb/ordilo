"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ScanLine,
  Search,
  Users,
  ListTodo,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/(app)/actions";
import { cn } from "@/lib/utils";

/**
 * A single tab definition for the bottom navigation.
 */
export interface NavTab {
  /** German label shown in the nav bar. */
  label: string;
  /** Route the tab navigates to. */
  href: string;
  /** Lucide icon component. */
  icon: LucideIcon;
}

/**
 * The five primary app tabs in display order.
 *
 * Order: Home, Scan, Suche, Familie, Aufgaben — as specified in the feature
 * requirements and validation contract (VAL-NAV-001).
 */
export const NAV_TABS: NavTab[] = [
  { label: "Home", href: "/home", icon: Home },
  { label: "Scan", href: "/scan", icon: ScanLine },
  { label: "Suche", href: "/suche", icon: Search },
  { label: "Familie", href: "/familie", icon: Users },
  { label: "Aufgaben", href: "/aufgaben", icon: ListTodo },
];

/**
 * Determine whether a tab is the active tab for a given pathname.
 *
 * A tab is active when the pathname exactly matches the tab's href OR is a
 * nested route beneath it (e.g. `/familie/123` → Familie tab is active).
 */
export function isTabActive(tab: NavTab, pathname: string): boolean {
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

/**
 * Determine whether the bottom navigation should be shown for a pathname.
 *
 * The nav is shown on the five primary app routes (and their nested routes).
 * It is hidden on `/onboarding` — the onboarding flow is a pre-app,
 * full-screen conversational experience and should not expose app navigation
 * (consistent with VAL-ONBOARD-011).
 */
export function shouldShowNav(pathname: string): boolean {
  return NAV_TABS.some((tab) => isTabActive(tab, pathname));
}

/**
 * App Shell — wraps all authenticated `(app)` routes.
 *
 * Provides:
 * - A minimal top bar with a logout affordance (German: "Abmelden").
 * - A centered, mobile-first content column (max-w-md).
 * - A fixed bottom tab navigation with a dark petrol background (#193232)
 *   and five tabs. The active tab is indicated by apricot-colored icon and
 *   label plus `aria-current="page"`.
 *
 * The bottom nav is hidden on `/onboarding` so users cannot bypass the
 * onboarding flow via tab navigation.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNav = shouldShowNav(pathname);

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
        {/* Top bar — minimal, logout only */}
        <header className="flex items-center justify-end px-4 py-3">
          <form action={logout}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-ordilo-sm px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Abmelden
            </button>
          </form>
        </header>

        {/* Page content */}
        <main
          className={cn(
            "flex-1 px-4 animate-page-fade-in",
            showNav ? "pb-28" : "pb-8",
          )}
        >
          {children}
        </main>
      </div>

      {/* Bottom tab navigation — dark petrol, fixed, centered */}
      {showNav && (
        <nav
          aria-label="Hauptnavigation"
          className="fixed bottom-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 border-t border-white/10"
          style={{ backgroundColor: "var(--petrol-darker)" }}
        >
          <ul className="flex items-stretch justify-around">
            {NAV_TABS.map((tab) => {
              const active = isTabActive(tab, pathname);
              const Icon = tab.icon;
              return (
                <li key={tab.href} className="flex-1">
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2.5 transition-colors",
                      active
                        ? "text-[var(--apricot)]"
                        : "text-white/55 hover:text-white/80",
                    )}
                  >
                    <Icon
                      className="h-5 w-5"
                      aria-hidden="true"
                      strokeWidth={active ? 2.4 : 2}
                    />
                    <span className="text-[11px] font-medium leading-none">
                      {tab.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
