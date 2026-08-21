"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  History,
  LogOut,
  Menu,
  Plus,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { logout } from "@/app/(app)/actions";
import { AISearchBar } from "@/components/ordilo/ai-search-bar";
import { ComposerOverlay } from "@/components/ordilo/composer-overlay";
import { OrdiloWordmark } from "@/components/ordilo/ordilo-wordmark";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { useRegisterComposerFocusHandler } from "@/lib/search/composer-focus-context";
import { ComposerSuggestionChips } from "@/components/ordilo/composer-suggestion-chips";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import {
  isSubItemActive,
  isTabActive,
  NAV_TABS,
} from "./app-shell-shared";

export function Topbar({
  showNav,
  pathname,
  profileName,
}: {
  showNav: boolean;
  pathname: string;
  /** Small personal anchor on mobile, matching the app's family feel. */
  profileName?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const currentTab = useSearchParams().get("tab");

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
          {showNav && (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Menü öffnen"
              className="flex size-11 shrink-0 items-center justify-center rounded-ordilo-sm text-foreground transition-colors hover:bg-accent focus-ring"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <Link
            href="/home"
            className="rounded-ordilo-sm text-sm font-semibold tracking-tight text-foreground focus-ring"
            aria-label="Ordilo Startseite"
          >
            <OrdiloWordmark mascotSize={24} />
          </Link>
          {profileName && (
            <Link
              href="/familie/einstellungen"
              aria-label={`Profil von ${profileName}`}
              className="relative ml-auto flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--petrol)] text-sm font-semibold text-white transition-colors hover:bg-[var(--petrol-dark)] focus-ring"
            >
              {profileName.charAt(0).toUpperCase()}
              <span
                className="absolute -right-0.5 top-0.5 size-2 rounded-full border-2 border-[var(--wash-sage-soft)] bg-[var(--apricot)]"
                aria-hidden="true"
              />
            </Link>
          )}
        </div>
      </div>

      {/*
        The navigation menu is the one drawer that is not a card surface, so it
        uses the primitive directly rather than an OrdiloDrawer variant: it
        comes from the left, floats inset with its own radius and shadow, and
        exists only below `lg`.
      */}
      <Drawer open={menuOpen} onOpenChange={setMenuOpen} direction="left">
        <DrawerContent className="inset-y-2! left-2! h-auto! w-[calc(100vw-1rem)]! max-w-[28rem]! rounded-ordilo-xl border border-white/80 bg-[var(--surface-box)] p-0 shadow-card lg:hidden">
          <div className="relative flex flex-col gap-1 px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
            <DrawerTitle className="flex items-center gap-2">
              <Link href="/home" className="rounded-ordilo-sm text-base font-semibold focus-ring" aria-label="Ordilo Startseite">
                <OrdiloWordmark mascotSize={28} />
              </Link>
            </DrawerTitle>
            <DrawerDescription className="sr-only">Hauptmenü</DrawerDescription>
            <DrawerClose
              aria-label="Menü schließen"
              className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex size-10 items-center justify-center rounded-full bg-[var(--sand)] text-foreground transition-colors hover:bg-[var(--sand-warm)] focus-ring"
            >
              <ChevronsLeft className="size-4" aria-hidden="true" />
            </DrawerClose>
          </div>

          {showNav && (
            <nav aria-label="Hauptnavigation" className="flex-1 space-y-2 overflow-y-auto px-4 pb-4">
              {NAV_TABS.map((tab) => {
                const active = isTabActive(tab, pathname);
                const Icon = tab.icon;
                return (
                  <div key={tab.href}>
                    <Link
                      href={tab.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex min-h-12 items-center gap-3 rounded-ordilo-sm px-3 text-sm font-medium transition-colors",
                        active
                          ? "bg-[color-mix(in_srgb,var(--petrol)_6%,var(--sand-light))] text-[var(--petrol)]"
                          : "text-foreground hover:bg-[var(--sand-warm)]",
                      )}
                    >
                      <NavIcon label={tab.label} active={active}>
                        <Icon className="size-5" aria-hidden="true" strokeWidth={active ? 2.2 : 1.8} />
                      </NavIcon>
                      <span className="flex-1">{tab.label}</span>
                      {tab.children ? (
                        <ChevronDown className="size-4 text-[var(--mist-dark)]" aria-hidden="true" />
                      ) : active ? (
                        <span className="size-1.5 rounded-full bg-[var(--apricot)] animate-nav-dot" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="size-4 text-[var(--mist-dark)]" aria-hidden="true" />
                      )}
                    </Link>
                    {tab.children && (
                      <div className="ml-10 mt-1 space-y-0.5 rounded-ordilo-sm bg-[var(--surface-story)] px-2 py-1">
                        {tab.children.map((child) => {
                          const childActive = isSubItemActive(child, pathname, currentTab);
                          const ChildIcon = child.icon;
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={() => setMenuOpen(false)}
                              className={cn(
                                "flex min-h-10 items-center gap-3 rounded-ordilo-sm px-2 text-sm transition-colors",
                                childActive
                                  ? "font-medium text-[var(--petrol)]"
                                  : "text-foreground hover:bg-[var(--sand-warm)]",
                              )}
                            >
                              <ChildIcon
                                className="size-4 text-[var(--petrol)]"
                                aria-hidden="true"
                              />
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              <Link
                href="/suche?history=1"
                onClick={() => setMenuOpen(false)}
                className="flex min-h-12 items-center gap-3 rounded-ordilo-sm px-3 text-sm font-medium text-foreground transition-colors hover:bg-[var(--sand-warm)] focus-ring"
                data-testid="topbar-chat-history-link"
              >
                <NavIcon label="Chat-Verlauf" active={false}>
                  <History className="size-5" aria-hidden="true" strokeWidth={1.8} />
                </NavIcon>
                <span className="flex-1">Chat-Verlauf</span>
                <ChevronRight className="size-4 text-[var(--mist-dark)]" aria-hidden="true" />
              </Link>
            </nav>
          )}

          <DrawerFooter className="border-t border-border/70 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
            <form action={logout}>
              <button
                type="submit"
                className="inline-flex w-full items-center gap-2 rounded-ordilo-sm px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-ring"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Abmelden
              </button>
            </form>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </header>
  );
}

function NavIcon({
  label,
  active,
  children,
}: {
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  const colors: Record<string, { backgroundColor: string; color: string }> = {
    Heute: {
      backgroundColor: "color-mix(in srgb, var(--petrol) 8%, var(--warm-white))",
      color: "var(--petrol)",
    },
    "Meine Ablage": {
      backgroundColor: "var(--wash-blue)",
      color: "var(--petrol)",
    },
    Familienplaner: {
      backgroundColor: "var(--wash-sage)",
      color: "var(--petrol)",
    },
    Familie: {
      backgroundColor: "var(--wash-apricot)",
      color: "var(--apricot-text)",
    },
    "Chat-Verlauf": {
      backgroundColor: "var(--wash-blue)",
      color: "var(--petrol)",
    },
  };

  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-ordilo-sm transition-transform",
        active && "scale-[1.03]",
      )}
      style={colors[label] ?? colors.Heute}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

/**
 * Contextual suggestion chips above the composer input. Pages register
 * them via SuggestionChipsProvider (currently /home, derived from the
 * daily briefing). Tapping a chip submits it like a typed question.
 */
export function MobileComposer({
  onSearch,
  onOpenActions,
  isLoading = false,
  recentQueries = [],
  greetingName,
  enableOverlay = true,
}: {
  onSearch: (query: string) => void;
  /** Opens the shared + action sheet (Scannen / Notiz / Sammlung). */
  onOpenActions: () => void;
  /** True while an answer is streaming — the bar must not swallow a second question. */
  isLoading?: boolean;
  /** Recent chat titles, newest first — surfaced as suggestions once zoomed in. */
  recentQueries?: string[];
  /** Family/display name for the zoomed-in greeting, when known. */
  greetingName?: string;
  /**
   * Zooming into "ask anything" makes sense as a global entry point, but
   * not while already inside the fullscreen /suche conversation — there
   * the pill should just behave like a plain inline composer. Set false
   * on /suche.
   */
  enableOverlay?: boolean;
}) {
  // The composer is fixed to the bottom and its height changes with the
  // textarea, so publish it: the scroll container pads by this value instead
  // of a hardcoded guess that a multi-line query grows past.
  const ref = useRef<HTMLDivElement>(null);
  useMountEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const publish = () =>
      document.documentElement.style.setProperty(
        "--composer-height",
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--composer-height");
    };
  });

  // Shared between the collapsed pill and the fullscreen overlay so a draft
  // survives zooming in and back out. Submitting from either place clears it
  // (AISearchBar's own controlled-mode contract).
  const [value, setValue] = useState("");
  const [expanded, setExpanded] = useState(false);

  // Lets any page (currently /home's "Fragen" quick action) ask the
  // composer to zoom into its fullscreen overlay, the same way focusing
  // the collapsed pill already does. A no-op on /suche, where the overlay
  // is disabled and the pill behaves like a plain inline composer.
  //
  // Memoized on enableOverlay so the registered handler updates when it
  // changes (see useRegisterComposerFocusHandler) instead of forever
  // running the check from whichever route this component first mounted
  // on — it is part of the persistent app shell, so it never remounts on
  // its own between /suche and everywhere else.
  const handleComposerFocusRequest = useCallback(() => {
    if (enableOverlay) setExpanded(true);
  }, [enableOverlay]);
  useRegisterComposerFocusHandler(handleComposerFocusRequest);

  return (
    <>
      <div
        ref={ref}
        data-testid="mobile-composer"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/80 bg-[var(--surface-box)] px-4 pt-3 shadow-[0_-2px_8px_rgba(36,36,36,0.06)] lg:hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {/* Collapsed: a plain "Ask anything" pill plus a separate + circle
            for everything else (scan, note, collection) — Granola-style.
            Focusing the pill zooms into the fullscreen overlay below instead
            of growing in place. */}
        <div className="mx-auto flex w-full max-w-md items-center gap-2">
          <div className="min-w-0 flex-1">
            <AISearchBar
              value={value}
              onValueChange={setValue}
              onSubmit={onSearch}
              onFocus={enableOverlay ? () => setExpanded(true) : undefined}
              isLoading={isLoading}
              placeholder="Frage Ordilo …"
            />
          </div>
          <button
            type="button"
            onClick={onOpenActions}
            disabled={isLoading}
            aria-label="Aktionen"
            data-testid="composer-actions-button"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--petrol)] text-white shadow-card transition-colors hover:bg-[var(--petrol-dark)] focus-ring disabled:opacity-50"
          >
            <Plus className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {enableOverlay && expanded && (
        <ComposerOverlay
          value={value}
          onValueChange={setValue}
          onSubmit={onSearch}
          isLoading={isLoading}
          onClose={() => setExpanded(false)}
          recentQueries={recentQueries}
          greetingName={greetingName}
        />
      )}
    </>
  );
}

export function DesktopBottomBar({
  collapsed,
  onSearch,
  onOpenActions,
  isLoading = false,
}: {
  collapsed: boolean;
  onSearch: (query: string) => void;
  /** Opens the shared + action sheet (Scannen / Notiz / Sammlung). */
  onOpenActions: () => void;
  isLoading?: boolean;
}) {
  const [composerActive, setComposerActive] = useState(false);
  const searchInputRef = useRef<HTMLTextAreaElement>(null);

  // Desktop has no fullscreen overlay to zoom into — its composer is
  // already fully visible in the floating dock, so a focus request just
  // focuses the real input directly (which also flips composerActive via
  // the existing onFocusCapture below, surfacing the suggestion chips).
  const handleComposerFocusRequest = useCallback(() => {
    searchInputRef.current?.focus();
  }, []);
  useRegisterComposerFocusHandler(handleComposerFocusRequest);

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
        className="pointer-events-auto mx-auto flex w-full max-w-6xl flex-col gap-1 rounded-ordilo-md border border-white/80 bg-[var(--sand-light)] p-2 shadow-card-hover"
      >
        <div
          className="space-y-2"
          onFocusCapture={() => setComposerActive(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setComposerActive(false);
            }
          }}
        >
          {composerActive && <ComposerSuggestionChips onSelect={onSearch} />}
          <div className="flex w-full items-center gap-2">
            <div className="min-w-0 flex-1">
              <AISearchBar
                ref={searchInputRef}
                onSubmit={onSearch}
                isLoading={isLoading}
                placeholder="Frage Ordilo oder suche nach Dokumenten…"
                className="py-1"
              />
            </div>
            <button
              type="button"
              onClick={onOpenActions}
              disabled={isLoading}
              aria-label="Aktionen"
              data-testid="composer-actions-button"
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--petrol)] text-white transition-colors hover:bg-[var(--petrol-dark)] focus-ring disabled:opacity-50"
            >
              <Plus className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
