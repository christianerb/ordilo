"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Topbar, MobileComposer, DesktopBottomBar } from "@/components/ordilo/app-shell-navigation";
import { SidebarNav } from "@/components/ordilo/app-shell-sidebar";
import {
  readCollapsedPreference,
  shouldShowNav,
  type SidebarCollection,
  type SidebarProfile,
  writeCollapsedPreference,
} from "@/components/ordilo/app-shell-shared";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { ScanProvider, useScanActions } from "@/lib/scan/scan-context";
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
 * - A fixed bottom tab navigation with a dark petrol background (#193232)
 *   and five tabs. The active tab is indicated by apricot-colored icon and
 *   label plus `aria-current="page"`.
 *
 * The bottom nav is hidden on `/onboarding` so users cannot bypass the
 * onboarding flow via tab navigation.
 */
export function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ActiveSearchProvider>
      <ScanProvider>
        <AppShellContent>{children}</AppShellContent>
      </ScanProvider>
    </ActiveSearchProvider>
  );
}

function AppShellContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const showNav = shouldShowNav(pathname);
  const { openWizard } = useScanActions();
  const { submitQuery } = useActiveSearch();
  const [collapsed, setCollapsed] = useState(false);

  // Collections + profile are fetched client-side (once on mount) instead
  // of in the server layout. This makes the layout a static pass-through,
  // eliminating 3 DB queries per navigation and making route transitions
  // much faster.
  const [collections, setCollections] = useState<SidebarCollection[]>([]);
  const [profile, setProfile] = useState<SidebarProfile | undefined>(undefined);

  useMountEffect(() => {
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
        const { data: collectionRows } = await supabase
          .from("collections")
          .select("id, name, icon, color")
          .eq("family_id", family.id)
          .order("sort_order", { ascending: true });
        if (collectionRows) {
          setCollections(collectionRows as SidebarCollection[]);
        }
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
    <div className="min-h-dvh bg-background lg:bg-[var(--sand)]">
      {/* Desktop sidebar navigation — hidden on mobile, shown on lg+ */}
      {showNav && (
        <SidebarNav
          pathname={pathname}
          collections={collections}
          profile={profile}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
      )}

      {/* Content area — offset for sidebar on desktop. The actual page
          content sits in its own warm-white "frame". The top-left corner
          (sidebar meets content) stays sharp; only the bottom-left corner
          (where the sidebar's column ends and the fixed DesktopBottomBar
          begins) is rounded, tucking into the sand shell's inner elbow
          there. The bottom bar itself stays a plain, straight-edged strip
          (no rounding of its own — see there). On mobile there's no
          sidebar to form that elbow, so this stays a flat page
          (bg-background throughout, no frame border/radius). */}
      <div
        className={cn(
          "flex min-h-dvh flex-col",
          showNav && "transition-[padding] duration-200",
          showNav && (collapsed ? "lg:pl-[76px]" : "lg:pl-[180px]"),
        )}
      >
        <Topbar showNav={showNav} pathname={pathname} />

        <div
          className={cn(
            "flex-1",
            showNav &&
              "lg:border-t lg:border-l lg:border-border lg:bg-background lg:shadow-card",
          )}
        >
          <div className="mx-auto flex h-full w-full max-w-md flex-col md:max-w-2xl lg:max-w-none">
            {/* Page content */}
            <main
              className={cn(
                "flex-1 px-4 pt-6 md:px-6 lg:px-8 lg:pt-10",
                showNav ? "pb-28 lg:pb-24" : "pb-8",
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
          <MobileComposer onSearch={submitQuery} onScan={openWizard} />
          <DesktopBottomBar
            collapsed={collapsed}
            onSearch={submitQuery}
            onScan={openWizard}
          />
        </>
      )}
    </div>
  );
}


