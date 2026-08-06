"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Topbar, MobileComposer, DesktopBottomBar } from "@/components/ordilo/app-shell-navigation";
import { SidebarNav } from "@/components/ordilo/app-shell-sidebar";
import { ComposerActionSheet } from "@/components/ordilo/composer-action-sheet";
import {
  getProfileDisplayName,
  readCollapsedPreference,
  shouldShowNav,
  type SidebarProfile,
  writeCollapsedPreference,
} from "@/components/ordilo/app-shell-shared";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { ScanProvider } from "@/lib/scan/scan-context";
import {
  CollectionsProvider,
  type CollectionInfo,
} from "@/lib/collections/collections-context";
import { ActiveSearchProvider, useActiveSearch } from "@/lib/search/active-search-context";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export { NAV_TABS } from "@/components/ordilo/app-shell-shared";
export { isTabActive, shouldShowNav } from "@/components/ordilo/app-shell-shared";

/**
 * App Shell — wraps all authenticated `(app)` routes.
 *
 * Provides:
 * - A minimal top bar with a logout affordance (German: "Abmelden").
 * - A centered, mobile-first content column (max-w-md).
 * - Desktop sidebar navigation plus a persistent search and scan composer.
 *
 * The bottom nav is hidden on `/onboarding` so users cannot bypass the
 * onboarding flow via tab navigation.
 */
export function AppShell({
  children,
  profile,
  initialCollections,
  recentQueries,
}: {
  children: React.ReactNode;
  /**
   * Sidebar profile resolved by the server layout. When server data is
   * provided (see `initialCollections`), the client-side profile fetch is
   * skipped — even when this is undefined (no family yet).
   */
  profile?: SidebarProfile;
  /**
   * Collections resolved by the server layout. Its mere presence (even an
   * empty array) marks server-data mode: the providers skip their
   * client-side mount fetches. Omitted in unit tests, which exercise the
   * client-fetch fallback.
   */
  initialCollections?: CollectionInfo[];
  /**
   * Recent conversation titles (newest first), resolved by the server
   * layout — surfaced as suggestion chips in the mobile composer's
   * zoomed-in overlay. Omitted when there is no family yet (onboarding).
   */
  recentQueries?: string[];
}) {
  const hasServerData = initialCollections !== undefined;
  return (
    <ActiveSearchProvider>
      <ScanProvider>
        <CollectionsProvider initialCollections={initialCollections}>
          <AppShellContent
            profile={profile}
            hasServerData={hasServerData}
            recentQueries={recentQueries ?? []}
          >
            {children}
          </AppShellContent>
        </CollectionsProvider>
      </ScanProvider>
    </ActiveSearchProvider>
  );
}

function AppShellContent({
  children,
  profile: initialProfile,
  hasServerData,
  recentQueries,
}: {
  children: React.ReactNode;
  profile?: SidebarProfile;
  hasServerData: boolean;
  recentQueries: string[];
}) {
  const pathname = usePathname();
  const showNav = shouldShowNav(pathname);
  const { submitQuery, busy } = useActiveSearch();
  const [collapsed, setCollapsed] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  // The server layout hands the profile over as a prop (fetched in
  // parallel with the page's own queries) — no client-side Supabase
  // round-trips after hydration. Without server data (unit tests) the
  // client-side mount fetch below is the fallback.
  const [profile, setProfile] = useState<SidebarProfile | undefined>(initialProfile);

  // Adopt a refreshed server profile without an effect (render-time
  // adjustment): router.refresh() re-renders the layout with a new object.
  const [prevInitialProfile, setPrevInitialProfile] = useState(initialProfile);
  if (hasServerData && initialProfile !== prevInitialProfile) {
    setPrevInitialProfile(initialProfile);
    setProfile(initialProfile);
  }

  useMountEffect(() => {
    if (hasServerData) return; // profile came from the server layout
    const supabase = createClient();
    (async () => {
      // auth.getUser() and the families query don't depend on each
      // other — running them concurrently instead of sequentially
      // halves the round-trips on this initial fetch.
      const [
        {
          data: { user },
        },
        { data: family },
      ] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("families").select("id, name").limit(1).maybeSingle(),
      ]);
      if (family) {
        setProfile({
          familyName: family.name,
          email: user?.email ?? null,
        });
      }
    })();
  });

  // Restore the persisted collapsed preference on the client. Server render
  // is always expanded (false) to keep hydration deterministic.
  useMountEffect(() => {
    if (readCollapsedPreference()) {
      setCollapsed(true);
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsedPreference(next);
      return next;
    });
  };

  return (
    <div className="relative isolate h-dvh overflow-x-clip overflow-hidden bg-[var(--canvas-warm)]">
      <div
        className="pointer-events-none fixed -right-24 -top-20 h-72 w-80 rotate-12 rounded-[28px] bg-[var(--wash-sage-soft)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed -left-28 top-[34%] size-64 rounded-full bg-[var(--wash-blue)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed -bottom-32 right-[12%] h-64 w-80 -rotate-6 rounded-[28px] bg-[var(--wash-apricot)]"
        aria-hidden="true"
      />

      {/* Desktop sidebar navigation — hidden on mobile, shown on lg+ */}
      {showNav && (
        <SidebarNav
          pathname={pathname}
          profile={profile}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
      )}

      {/* Content area — offset for the desktop sidebar. Mobile remains a
          flat page; the desktop border separates content from the shared
          sidebar surface. */}
      <div
        className={cn(
          "relative z-10 flex h-dvh flex-col",
          showNav && "transition-[padding] duration-200",
          showNav && (collapsed ? "lg:pl-[76px]" : "lg:pl-[224px]"),
        )}
      >
        <Topbar showNav={showNav} pathname={pathname} />

        <div data-testid="app-content-surface" className="flex min-h-0 flex-1 flex-col">
          <div className="mx-auto flex h-full min-h-0 w-full max-w-md flex-col md:max-w-2xl lg:max-w-none">
            {/* Page content */}
            <main
              className={cn(
                "flex flex-1 flex-col overflow-y-auto px-4 pt-5 md:px-6 md:pt-6 lg:px-8 lg:pt-8",
                // The mobile composer publishes its live height, so the
                // scroll container keeps clearing it even when the textarea
                // grows past what a fixed pb-28 would have covered. The
                // fallback covers the resting height (~127px) for the moment
                // before hydration sets the variable.
                showNav
                  ? "pb-[calc(var(--composer-height,8.5rem)+0.75rem)] lg:pb-24"
                  : "pb-8",
              )}
            >
              {children}
            </main>
          </div>
        </div>
      </div>

      {/* Bottom composer — the primary "Frage Ordilo" entry point, always
          in reach at the bottom of the screen instead of buried at the
          top (ChatGPT-style), on both mobile and desktop, on every route
          including /suche (one consistent composer everywhere — /suche no
          longer renders its own inline one; submitting here hands the
          query straight to the live conversation via
          `ActiveSearchProvider` when /suche happens to be mounted). Mobile
          has no sidebar to host it next to, so it spans the full viewport
          width; desktop offsets it past the sidebar instead. */}
      {showNav && (
        <>
          <MobileComposer
            onSearch={submitQuery}
            onOpenActions={() => setActionsOpen(true)}
            isLoading={busy}
            recentQueries={recentQueries}
            greetingName={profile ? getProfileDisplayName(profile) : undefined}
            // Zooming into "ask anything" makes no sense while already
            // inside the fullscreen /suche conversation — keep the pill a
            // plain inline composer there instead.
            enableOverlay={pathname !== "/suche"}
          />
          <DesktopBottomBar
            collapsed={collapsed}
            onSearch={submitQuery}
            onOpenActions={() => setActionsOpen(true)}
            isLoading={busy}
          />
          <ComposerActionSheet open={actionsOpen} onOpenChange={setActionsOpen} />
        </>
      )}
    </div>
  );
}


