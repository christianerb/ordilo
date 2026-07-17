"use client";

import Link from "next/link";
import {
  Camera,
  LogOut,
  Menu,
} from "lucide-react";
import { useState } from "react";
import { logout } from "@/app/(app)/actions";
import { OrdiloMascot } from "@/components/ordilo/mascot";
import { AISearchBar } from "@/components/ordilo/ai-search-bar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  isTabActive,
  NAV_TABS,
} from "./app-shell-shared";

export function Topbar({
  showNav,
  pathname,
}: {
  showNav: boolean;
  pathname: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      className={cn(
        "w-full lg:hidden",
        showNav &&
          "sticky top-0 z-30 border-b border-white/80 bg-[var(--wash-sage-soft)] shadow-card",
      )}
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pb-3 md:max-w-2xl md:px-6">
        <div
          className="flex items-center gap-3 pt-3"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Menü öffnen"
            className="flex size-9 shrink-0 items-center justify-center rounded-ordilo-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <Link
            href="/home"
            className="flex items-center gap-2 rounded-ordilo-sm text-sm font-semibold tracking-tight text-foreground transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="Ordilo Startseite"
          >
            <OrdiloMascot size={24} style={{ color: "var(--petrol)" }} />
            Ordilo
          </Link>
        </div>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="flex w-72 max-w-[80vw] flex-col p-0 lg:hidden">
          <SheetHeader className="border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <Link href="/home" className="flex items-center gap-2 transition-opacity hover:opacity-70" aria-label="Ordilo Startseite">
                <OrdiloMascot size={22} style={{ color: "var(--petrol)" }} />
                Ordilo
              </Link>
            </SheetTitle>
            <SheetDescription className="sr-only">Hauptmenü</SheetDescription>
          </SheetHeader>

          {showNav && (
            <nav aria-label="Hauptnavigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
              {NAV_TABS.map((tab) => {
                const active = isTabActive(tab, pathname);
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-ordilo-sm px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" strokeWidth={active ? 2.4 : 2} />
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          )}

          <SheetFooter className="border-t border-border">
            <form action={logout}>
              <button
                type="submit"
                className="inline-flex w-full items-center gap-2 rounded-ordilo-sm px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Abmelden
              </button>
            </form>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </header>
  );
}

export function MobileComposer({
  onSearch,
  onScan,
}: {
  onSearch: (query: string) => void;
  onScan: () => void;
}) {
  return (
    <div
      data-testid="mobile-composer"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-white/80 bg-[var(--surface-box)] px-4 pt-3 shadow-[0_-2px_8px_rgba(36,36,36,0.06)] lg:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex w-full max-w-md gap-2">
        <div className="min-w-0 flex-1">
          <AISearchBar
            onSubmit={onSearch}
            placeholder="Frage Ordilo oder suche nach Dokumenten…"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onScan}
          className="h-auto shrink-0 gap-1.5 rounded-full px-5"
        >
          <Camera className="size-4" aria-hidden="true" />
          <span>Scannen</span>
        </Button>
      </div>
    </div>
  );
}

export function DesktopBottomBar({
  collapsed,
  onSearch,
  onScan,
}: {
  collapsed: boolean;
  onSearch: (query: string) => void;
  onScan: () => void;
}) {
  return (
    <div
      data-testid="desktop-bottom-bar"
      className="pointer-events-none fixed bottom-4 right-4 z-30 hidden transition-[left] duration-200 lg:block"
      style={{
        left: collapsed ? 92 : 196,
      }}
    >
      <div
        data-testid="desktop-floating-dock"
        className="pointer-events-auto mx-auto flex w-full max-w-6xl gap-2 rounded-ordilo-md border border-white/80 bg-[var(--sand-light)] p-2 shadow-card-hover"
      >
        <div className="min-w-0 flex-1">
          <AISearchBar
            onSubmit={onSearch}
            placeholder="Frage Ordilo oder suche nach Dokumenten…"
            className="h-12 py-1"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onScan}
          className="h-12 shrink-0 gap-1.5 rounded-full px-5"
        >
          <Camera className="size-4" aria-hidden="true" />
          <span>Scannen</span>
        </Button>
      </div>
    </div>
  );
}
