import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

// --- Mocks -----------------------------------------------------------------

// `next/navigation` must be mocked so we can control the pathname per test.
const mockUsePathname = vi.fn<() => string>();
const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: mockRefresh,
  }),
  // Link is a real Next component but in unit tests we use a plain anchor.
  Link: ({ href, children, className, ...props }: { href: string; children: React.ReactNode; className?: string; [key: string]: unknown }) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
}));

// The logout server action cannot run in a unit-test environment — stub it.
vi.mock("@/app/(app)/actions", () => ({
  logout: vi.fn(),
}));

// The collections server actions cannot run in a unit-test environment
// (they use the Supabase server client) — stub them.
vi.mock("@/app/(app)/sammlungen/actions", () => ({
  createCollection: vi.fn(),
}));

// AppShell now mounts ScanProvider internally, which resolves the family
// ID via the browser Supabase client on mount. AppShellContent also fetches
// collections + profile client-side. We provide a configurable mock so
// individual tests can supply specific data.
const mockAuthGetUser = vi.fn();
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
}));

/** Configure the Supabase mock to return specific family/collections/user data. */
function mockSupabaseData(options: {
  family?: { id: string; name: string } | null;
  collections?: { id: string; name: string; icon: string; color: string }[];
  userEmail?: string | null;
  documents?: unknown[];
} = {}) {
  const {
    family = null,
    collections = [],
    userEmail = null,
    documents = [],
  } = options;

  mockAuthGetUser.mockResolvedValue({
    data: { user: userEmail ? { email: userEmail } : null },
  });

  mockFrom.mockImplementation((table: string) => {
    if (table === "families") {
      return {
        select: vi.fn(() => ({
          limit: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: family, error: null }),
          })),
        })),
      };
    }
    if (table === "collections") {
      // CollectionsProvider queries select(...).order(...) directly (RLS
      // scopes to the family — no explicit eq filter).
      return {
        select: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({ data: collections, error: null }),
          eq: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: collections, error: null }),
          })),
        })),
      };
    }
    // Default: return empty data (for ScanProvider's document queries, etc.)
    return {
      select: vi.fn(() => ({
        limit: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
        eq: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({ data: documents, error: null }),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
          neq: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: documents, error: null }),
          })),
        })),
      })),
    };
  });
}
vi.mock("@/lib/upload", () => ({ uploadFile: vi.fn() }));
vi.mock("@/lib/ocr", () => ({ triggerOcr: vi.fn() }));

// --- System under test -----------------------------------------------------

// Import AFTER mocks are registered.
import { AppShell, NAV_TABS } from "@/components/ordilo/app-shell";
import { createCollection } from "@/app/(app)/sammlungen/actions";

// --- Helpers ---------------------------------------------------------------

/** Render the shell with a given pathname and simple children. */
function renderShell(pathname: string) {
  mockUsePathname.mockReturnValue(pathname);
  return render(
    <AppShell>
      <div data-testid="page-content">Seiteninhalt</div>
    </AppShell>,
  );
}

/**
 * Open the mobile hamburger drawer (nav now lives behind it instead of a
 * permanent bottom tab bar — VAL-NAV). Mounts the drawer's contents
 * (nav list + logout) into the DOM.
 */
function openMobileMenu() {
  fireEvent.click(screen.getByRole("button", { name: /menü öffnen/i }));
}

// --- Tests -----------------------------------------------------------------

describe("NAV_TABS", () => {
  it("exports exactly four tabs (Heute, Dokumente, Aufgaben, Familie)", () => {
    expect(NAV_TABS).toHaveLength(4);
  });

  it("has tabs in the correct order with correct labels and hrefs", () => {
    const expected = [
      { label: "Heute", href: "/home" },
      { label: "Dokumente", href: "/dokumente" },
      { label: "Aufgaben", href: "/aufgaben" },
      { label: "Familie", href: "/familie" },
    ];
    expect(NAV_TABS.map((t) => ({ label: t.label, href: t.href }))).toEqual(
      expected,
    );
  });

  it("each tab has a distinct icon component", () => {
    const icons = NAV_TABS.map((t) => t.icon);
    const uniqueIcons = new Set(icons);
    expect(uniqueIcons.size).toBe(4);
  });
});

describe("AppShell", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
    mockUsePathname.mockReturnValue("/home");
    mockPush.mockClear();
    mockSupabaseData();
    // Pretend prefers-reduced-motion is active so the CameraStep's
    // auto-capture sampler doesn't call canvas.getContext (not
    // implemented in jsdom) when the scan wizard opens.
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the page content inside the shell", () => {
    renderShell("/home");
    expect(screen.getByTestId("page-content")).toBeDefined();
  });

  it("keeps the app content flat instead of wrapping it in a card", () => {
    renderShell("/home");
    const surface = screen.getByTestId("app-content-surface");
    expect(surface.className).not.toContain("rounded-");
    expect(surface.className).not.toContain("shadow-");
    expect(surface.className).not.toContain("border");
  });

  it("renders a nav drawer with exactly four tab links", () => {
    renderShell("/home");
    openMobileMenu();
    const nav = screen.getByRole("navigation", { name: /navigation/i });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(4);
  });

  it("labels the drawer nav so it is identifiable as navigation", () => {
    renderShell("/home");
    openMobileMenu();
    // The <nav> element should have an accessible label.
    const nav = screen.getByRole("navigation");
    expect(nav.getAttribute("aria-label")).toBeTruthy();
  });

  it("each tab link has the correct label text and href", () => {
    renderShell("/home");
    openMobileMenu();
    const nav = screen.getByRole("navigation");
    const links = within(nav).getAllByRole("link");

    const expected = [
      { label: "Heute", href: "/home" },
      { label: "Dokumente", href: "/dokumente" },
      { label: "Aufgaben", href: "/aufgaben" },
      { label: "Familie", href: "/familie" },
    ];

    links.forEach((link, i) => {
      expect(link.getAttribute("href")).toBe(expected[i].href);
      expect(within(link).getByText(expected[i].label)).toBeDefined();
    });
  });

  it("marks the Dokumente tab as active when on /dokumente", () => {
    renderShell("/dokumente");
    openMobileMenu();
    const nav = screen.getByRole("navigation");
    const dokumenteLink = within(nav).getByText("Dokumente").closest("a");
    expect(dokumenteLink?.getAttribute("aria-current")).toBe("page");
  });

  it("keeps Dokumente active on /sammlungen (collections live under it)", () => {
    renderShell("/sammlungen/col-1");
    openMobileMenu();
    const nav = screen.getByRole("navigation");
    const dokumenteLink = within(nav).getByText("Dokumente").closest("a");
    expect(dokumenteLink?.getAttribute("aria-current")).toBe("page");
  });

  it("updates the active tab when pathname changes", () => {
    const { rerender } = renderShell("/dokumente");
    openMobileMenu();
    let nav = screen.getByRole("navigation");
    let dokumenteLink = within(nav).getByText("Dokumente").closest("a");
    let familieLink = within(nav).getByText("Familie").closest("a");
    expect(dokumenteLink?.getAttribute("aria-current")).toBe("page");
    expect(familieLink?.getAttribute("aria-current")).toBeNull();

    mockUsePathname.mockReturnValue("/familie");
    rerender(
      <AppShell>
        <div data-testid="page-content">Seiteninhalt</div>
      </AppShell>,
    );
    nav = screen.getByRole("navigation");
    dokumenteLink = within(nav).getByText("Dokumente").closest("a");
    familieLink = within(nav).getByText("Familie").closest("a");
    expect(dokumenteLink?.getAttribute("aria-current")).toBeNull();
    expect(familieLink?.getAttribute("aria-current")).toBe("page");
  });

  it("marks a tab active for nested routes (e.g. /familie/123)", () => {
    renderShell("/familie/123");
    openMobileMenu();
    const nav = screen.getByRole("navigation");
    const familieLink = within(nav).getByText("Familie").closest("a");
    expect(familieLink?.getAttribute("aria-current")).toBe("page");
  });

  it("only one tab is active at a time", () => {
    renderShell("/dokumente");
    openMobileMenu();
    const nav = screen.getByRole("navigation");
    const links = within(nav).getAllByRole("link");
    const activeCount = links.filter(
      (l) => l.getAttribute("aria-current") === "page",
    ).length;
    expect(activeCount).toBe(1);
  });

  it("marks Heute active on /home", () => {
    const { unmount } = renderShell("/home");
    openMobileMenu();
    const nav = screen.getByRole("navigation");
    const heuteLink = within(nav).getByText("Heute").closest("a");
    expect(heuteLink?.getAttribute("aria-current")).toBe("page");
    unmount();
  });

  it("marks only Aufgaben active on /aufgaben", () => {
    renderShell("/aufgaben");
    openMobileMenu();
    const nav = screen.getByRole("navigation");
    const heuteLink = within(nav).getByText("Heute").closest("a");
    const aufgabenLink = within(nav).getByText("Aufgaben").closest("a");
    expect(heuteLink?.getAttribute("aria-current")).toBeNull();
    expect(aufgabenLink?.getAttribute("aria-current")).toBe("page");
  });

  it("marks no tab active on /suche (fullscreen answer mode, not a place)", () => {
    renderShell("/suche");
    openMobileMenu();
    const nav = screen.getByRole("navigation");
    const activeLinks = nav.querySelectorAll('a[aria-current="page"]');
    expect(activeLinks.length).toBe(0);
  });

  it("closes the drawer and navigates when a tab link is clicked", () => {
    renderShell("/home");
    openMobileMenu();
    const nav = screen.getByRole("navigation");
    fireEvent.click(within(nav).getByText("Dokumente"));
    // Sheet content unmounts once closed (Radix default, no forceMount).
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("hides the tab list in the drawer on /onboarding (no nav, but still exit)", () => {
    renderShell("/onboarding");
    openMobileMenu();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByRole("button", { name: /abmelden/i })).toBeDefined();
  });

  it("hides the tab list in the drawer on nested onboarding routes", () => {
    renderShell("/onboarding/step-2");
    openMobileMenu();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("renders a logout affordance", () => {
    renderShell("/home");
    openMobileMenu();
    // The logout button should be present and labelled in German, inside
    // the mobile drawer (the desktop sidebar's own logout lives behind a
    // separate, closed-by-default dropdown, tested elsewhere).
    const logoutButtons = screen.getAllByRole("button", { name: /abmelden/i });
    expect(logoutButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("logout affordance is also present on onboarding (no nav but still exit)", () => {
    renderShell("/onboarding");
    openMobileMenu();
    expect(screen.getByRole("button", { name: /abmelden/i })).toBeDefined();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  // --- Global search + scan bottom bars (VAL-NAV) -------------------------

  it("renders both the mobile composer and the desktop bottom bar (search + scan) on every tab, including /suche", () => {
    for (const pathname of ["/home", "/dokumente", "/suche", "/familie", "/aufgaben"]) {
      // Mobile composer + desktop bottom bar both exist in jsdom (only
      // Tailwind breakpoints hide one or the other visually). /suche shares
      // this same global bottom bar rather than rendering its own inline
      // composer — a single unified bar is used on every route.
      const { unmount } = renderShell(pathname);
      expect(screen.getByTestId("mobile-composer")).toBeDefined();
      expect(screen.getByTestId("desktop-bottom-bar")).toBeDefined();
      expect(screen.getAllByTestId("ai-search-bar")).toHaveLength(2);
      expect(screen.getAllByRole("button", { name: /scannen/i })).toHaveLength(2);
      unmount();
    }
  });

  it("renders the desktop composer as a rounded floating dock", () => {
    renderShell("/home");
    const dock = screen.getByTestId("desktop-floating-dock");
    expect(dock.className).toContain("rounded-ordilo-md");
    expect(dock.className).toContain("shadow-card-hover");
    expect(screen.queryByTestId("desktop-shell-elbow")).toBeNull();
  });

  it("does not render the search+scan row on /onboarding", () => {
    renderShell("/onboarding");
    expect(screen.queryByTestId("ai-search-bar")).toBeNull();
    expect(screen.queryByRole("button", { name: /^scannen$/i })).toBeNull();
  });

  it("navigates to /suche with the query when submitted from a non-suche tab", () => {
    renderShell("/dokumente");
    const [input] = screen.getAllByRole("textbox") as HTMLTextAreaElement[];
    fireEvent.change(input, { target: { value: "Zeig mir Rechnungen" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringMatching(/^\/suche\?q=/),
    );
    const callArg = mockPush.mock.calls[0][0] as string;
    expect(new URLSearchParams(callArg.split("?")[1]).get("q")).toBe(
      "Zeig mir Rechnungen",
    );
  });

  it("does not navigate when submitting an empty query", () => {
    renderShell("/home");
    const [input] = screen.getAllByRole("textbox") as HTMLTextAreaElement[];
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("opens the scan wizard overlay when the Scannen button is clicked", async () => {
    renderShell("/dokumente");
    const [scanButton] = screen.getAllByRole("button", { name: /scannen/i });
    fireEvent.click(scanButton);
    await waitFor(() => {
      expect(screen.getByTestId("scan-wizard")).toBeDefined();
    });
  });

  // --- Navigation performance (no remount on route change) ---------------

  it("does not remount the content when the pathname changes (no key)", () => {
    // The content wrapper must NOT be keyed by pathname — remounting on
    // every route change causes slow, janky navigation because React
    // destroys and rebuilds the entire subtree (state, effects, DOM).
    const mountCounter: { current: number } = { current: 0 };
    function MountTracker() {
      useMountEffect(() => {
        mountCounter.current += 1;
      });
      return <div data-testid="mount-tracker">tracked</div>;
    }

    mockUsePathname.mockReturnValue("/home");
    const { rerender } = render(
      <AppShell>
        <MountTracker />
      </AppShell>,
    );
    expect(mountCounter.current).toBe(1);

    // Navigate to a different tab — the content must NOT remount.
    mockUsePathname.mockReturnValue("/dokumente");
    rerender(
      <AppShell>
        <MountTracker />
      </AppShell>,
    );
    expect(mountCounter.current).toBe(1);

    // A third tab switch — still no remount.
    mockUsePathname.mockReturnValue("/aufgaben");
    rerender(
      <AppShell>
        <MountTracker />
      </AppShell>,
    );
    expect(mountCounter.current).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Sidebar Sammlungen (collections) section
// ---------------------------------------------------------------------------

describe("AppShell sidebar collections", () => {
  const collections = [
    { id: "col-1", name: "Rechnungen", icon: "receipt", color: "petrol" },
    { id: "col-2", name: "Schule", icon: "graduation-cap", color: "apricot" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/home");
    mockSupabaseData({ family: { id: "fam-1", name: "Test" }, collections });
  });

  it("renders a Sammlungen heading and one link per collection", async () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    expect(await screen.findByText("Sammlungen")).toBeDefined();
    expect(screen.getByRole("link", { name: /Rechnungen/i }).getAttribute("href")).toBe(
      "/sammlungen/col-1",
    );
    expect(screen.getByRole("link", { name: /Schule/i }).getAttribute("href")).toBe(
      "/sammlungen/col-2",
    );
  });

  it("marks a collection link active when its detail route is current", async () => {
    mockUsePathname.mockReturnValue("/sammlungen/col-1");
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    expect(
      (await screen.findByRole("link", { name: /Rechnungen/i })).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: /Schule/i }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("renders no collection links when the list is empty", async () => {
    mockSupabaseData({ family: { id: "fam-1", name: "Test" }, collections: [] });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    expect(await screen.findByText("Sammlungen")).toBeDefined();
    expect(screen.queryByRole("link", { name: /Rechnungen/i })).toBeNull();
  });

  it("opens the add-collection sheet when clicking 'Sammlung hinzufügen'", async () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    await screen.findByText("Sammlungen");
    fireEvent.click(screen.getByRole("button", { name: /Sammlung hinzufügen/i }));
    expect(screen.getByText("Gib der Sammlung einen Namen, ein Icon und eine Farbe.")).toBeDefined();
    expect(await screen.findByLabelText("Name")).toBeDefined();
  });

  it("creates a collection and appends it to the sidebar list on success", async () => {
    (createCollection as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { id: "col-3", name: "Verträge", icon: "shield", color: "blue-soft" },
    });

    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    await screen.findByText("Sammlungen");

    fireEvent.click(screen.getByRole("button", { name: /Sammlung hinzufügen/i }));
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Verträge" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Sammlung hinzufügen$/ }));

    await waitFor(() => {
      expect(createCollection).toHaveBeenCalledWith({
        name: "Verträge",
        icon: expect.any(String),
        color: expect.any(String),
      });
    });
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Verträge/i })).toBeDefined();
    });
  });

  it("shows a German server error and keeps the sheet open on failure", async () => {
    (createCollection as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "Diese Sammlung gibt es schon.",
    });

    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    await screen.findByText("Sammlungen");

    fireEvent.click(screen.getByRole("button", { name: /Sammlung hinzufügen/i }));
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Rechnungen" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Sammlung hinzufügen$/ }));

    await waitFor(() => {
      expect(screen.getByText("Diese Sammlung gibt es schon.")).toBeDefined();
    });
    // Sheet stays open — the name input is still present.
    expect(screen.getByLabelText("Name")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Sidebar profile footer
// ---------------------------------------------------------------------------

describe("AppShell sidebar profile footer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/home");
  });

  it("falls back to a plain logout button when no profile is given", () => {
    mockSupabaseData();
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    const logoutButtons = screen.getAllByRole("button", { name: /abmelden/i });
    expect(logoutButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the family name as display name when a profile is given", async () => {
    mockSupabaseData({
      family: { id: "fam-1", name: "Familie Müller" },
      userEmail: "anna@example.com",
    });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    // The greeting and footer both use the family name, not the email prefix.
    const familyNameEls = await screen.findAllByText("Familie Müller");
    expect(familyNameEls.length).toBeGreaterThanOrEqual(1);
  });

  it("falls back to the family name as display name when there is no email", async () => {
    mockSupabaseData({
      family: { id: "fam-1", name: "Familie Müller" },
      userEmail: null,
    });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    expect((await screen.findAllByText("Familie Müller")).length).toBeGreaterThanOrEqual(1);
  });

  it("opens a dropdown with 'Familie' and 'Abmelden' options", async () => {
    mockSupabaseData({
      family: { id: "fam-1", name: "Familie Müller" },
      userEmail: "anna@example.com",
    });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    // Wait for profile to load — the family name appears in the footer.
    await screen.findAllByText("Familie Müller");
    // jsdom has no native PointerEvent, so the Radix trigger's pointerdown
    // handler can't be exercised reliably here — use its Enter-key handler
    // instead, which opens the menu the same way for keyboard users.
    fireEvent.keyDown(screen.getByRole("button", { name: /Familie Müller/i }), {
      key: "Enter",
    });
    expect(screen.getByRole("menuitem", { name: /^Familie$/i })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: /Abmelden/i })).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Sidebar visual polish — ambient surface, greeting, and focused active states
// ---------------------------------------------------------------------------

describe("AppShell sidebar personality touches", () => {
  const collections = [
    { id: "col-1", name: "Rechnungen", icon: "receipt", color: "petrol" },
    { id: "col-2", name: "Schule", icon: "graduation-cap", color: "apricot" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/home");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies an ambient gradient background to the sidebar surface", () => {
    mockSupabaseData();
    const { container } = render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    const aside = container.querySelector("aside");
    expect(aside?.getAttribute("style")).toContain("gradient");
  });

  it("shows a time-appropriate greeting with the display name when a profile is given", async () => {
    mockSupabaseData({
      family: { id: "fam-1", name: "Familie Müller" },
      userEmail: "anna@example.com",
    });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    // Wait for profile to load — the family name appears in the greeting.
    await screen.findAllByText("Familie Müller");
    const greetingEl = screen.getByText(/Guten (Morgen|Tag|Abend)|Gute Nacht/);
    // The opacity class lives on the greeting container div, not the span.
    const greetingContainer = greetingEl.closest("div");
    expect(greetingContainer?.className).toContain("opacity-100");
    expect(greetingContainer?.textContent).toContain("Familie Müller");
  });

  it("does not render a greeting when no profile is given", () => {
    mockSupabaseData();
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    // Greeting element exists in DOM but is CSS-hidden (opacity-0).
    // jsdom doesn't compute Tailwind styles, so check the class directly.
    const greetingEl = screen.queryByText(/Guten (Morgen|Tag|Abend)|Gute Nacht/);
    if (greetingEl) {
      expect(greetingEl.closest("div")?.className).toContain("opacity-0");
    }
  });

  it("uses apricot for the active nav indicator dot", () => {
    mockUsePathname.mockReturnValue("/dokumente");
    mockSupabaseData();
    const { container } = render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    const activeLink = container.querySelector('aside a[aria-current="page"]');
    const dot = activeLink?.querySelector(".animate-nav-dot");
    expect(dot?.className).toContain("bg-[var(--apricot)]");
  });

  it("shows an apricot dot on the active collection row", async () => {
    mockUsePathname.mockReturnValue("/sammlungen/col-1");
    mockSupabaseData({ family: { id: "fam-1", name: "Test" }, collections });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    const activeCollectionLink = await screen.findByRole("link", { name: /Rechnungen/i });
    const dot = activeCollectionLink.querySelector(".animate-nav-dot");
    expect(dot?.className).toContain("bg-[var(--apricot)]");
  });

  it("keeps inactive collection rows flat", async () => {
    mockSupabaseData({ family: { id: "fam-1", name: "Test" }, collections });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    const link = await screen.findByRole("link", { name: /Rechnungen/i });
    expect(link.getAttribute("style") ?? "").not.toContain("background-color");
  });

  it("uses one current-page marker when a collection is active", async () => {
    mockUsePathname.mockReturnValue("/sammlungen/col-1");
    mockSupabaseData({ family: { id: "fam-1", name: "Test" }, collections });
    const { container } = render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    await screen.findByRole("link", { name: /Rechnungen/i });
    const currentLinks = container.querySelectorAll(
      'aside a[aria-current="page"]',
    );
    expect(currentLinks).toHaveLength(1);
    expect(currentLinks[0]?.textContent).toContain("Rechnungen");
  });
});
