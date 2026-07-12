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
  it("exports exactly three tabs (Heute, Familienbuch, Familie)", () => {
    expect(NAV_TABS).toHaveLength(3);
  });

  it("has tabs in the correct order with correct labels and hrefs", () => {
    const expected = [
      { label: "Heute", href: "/home" },
      { label: "Familienbuch", href: "/dokumente" },
      { label: "Familie", href: "/familie" },
    ];
    expect(NAV_TABS.map((t) => ({ label: t.label, href: t.href }))).toEqual(
      expected,
    );
  });

  it("each tab has a distinct icon component", () => {
    const icons = NAV_TABS.map((t) => t.icon);
    const uniqueIcons = new Set(icons);
    expect(uniqueIcons.size).toBe(3);
  });
});

describe("AppShell", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
    mockUsePathname.mockReturnValue("/home");
    mockPush.mockClear();
    mockSupabaseData();
  });

  it("renders the page content inside the shell", () => {
    renderShell("/home");
    expect(screen.getByTestId("page-content")).toBeDefined();
  });

  it("renders a nav drawer with exactly three tab links", () => {
    renderShell("/home");
    openMobileMenu();
    const nav = screen.getByRole("navigation", { name: /navigation/i });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(3);
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
      { label: "Familienbuch", href: "/dokumente" },
      { label: "Familie", href: "/familie" },
    ];

    links.forEach((link, i) => {
      expect(link.getAttribute("href")).toBe(expected[i].href);
      expect(within(link).getByText(expected[i].label)).toBeDefined();
    });
  });

  it("marks the Heute tab as active when on /home", () => {
    renderShell("/home");
    openMobileMenu();
    const nav = screen.getByRole("navigation");
    const heuteLink = within(nav).getByText("Heute").closest("a");
    expect(heuteLink?.getAttribute("aria-current")).toBe("page");
  });

  it("keeps Heute active on /aufgaben (tasks live under Heute now)", () => {
    renderShell("/aufgaben");
    openMobileMenu();
    const nav = screen.getByRole("navigation");
    const heuteLink = within(nav).getByText("Heute").closest("a");
    expect(heuteLink?.getAttribute("aria-current")).toBe("page");
  });

  it("keeps Familienbuch active on /sammlungen (collections live under it)", () => {
    renderShell("/sammlungen/col-1");
    openMobileMenu();
    const nav = screen.getByRole("navigation");
    const buchLink = within(nav).getByText("Familienbuch").closest("a");
    expect(buchLink?.getAttribute("aria-current")).toBe("page");
  });

  it("updates the active tab when pathname changes", () => {
    const { rerender } = renderShell("/aufgaben");
    openMobileMenu();
    let nav = screen.getByRole("navigation");
    let heuteLink = within(nav).getByText("Heute").closest("a");
    let buchLink = within(nav).getByText("Familienbuch").closest("a");
    expect(heuteLink?.getAttribute("aria-current")).toBe("page");
    expect(buchLink?.getAttribute("aria-current")).toBeNull();

    mockUsePathname.mockReturnValue("/dokumente");
    rerender(
      <AppShell>
        <div data-testid="page-content">Seiteninhalt</div>
      </AppShell>,
    );
    nav = screen.getByRole("navigation");
    heuteLink = within(nav).getByText("Heute").closest("a");
    buchLink = within(nav).getByText("Familienbuch").closest("a");
    expect(heuteLink?.getAttribute("aria-current")).toBeNull();
    expect(buchLink?.getAttribute("aria-current")).toBe("page");
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
    fireEvent.click(within(nav).getByText("Familienbuch"));
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

  it("renders the family name and derived display name when a profile is given", async () => {
    mockSupabaseData({
      family: { id: "fam-1", name: "Familie Müller" },
      userEmail: "anna@example.com",
    });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    expect(await screen.findByText("anna")).toBeDefined();
    expect(screen.getByText("Familie Müller")).toBeDefined();
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
    // Wait for profile to load and display name to appear
    await screen.findByText("anna");
    // jsdom has no native PointerEvent, so the Radix trigger's pointerdown
    // handler can't be exercised reliably here — use its Enter-key handler
    // instead, which opens the menu the same way for keyboard users.
    fireEvent.keyDown(screen.getByRole("button", { name: /anna/i }), {
      key: "Enter",
    });
    expect(screen.getByRole("menuitem", { name: /^Familie$/i })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: /Abmelden/i })).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Sidebar visual polish — ambient gradient, greeting, colored dots/rows,
// time-of-day scenery
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
    // Wait for profile to load, then check greeting is visible (opacity-100)
    await screen.findByText("anna");
    const greetingEl = screen.getByText(/Guten (Morgen|Tag|Abend)|Gute Nacht/);
    expect(greetingEl.className).toContain("opacity-100");
    expect(greetingEl.textContent).toContain("anna");
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
      expect(greetingEl.className).toContain("opacity-0");
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

  it("tints each collection row with its own color", async () => {
    mockSupabaseData({ family: { id: "fam-1", name: "Test" }, collections });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    const link = await screen.findByRole("link", { name: /Rechnungen/i });
    expect(link.getAttribute("style")).toContain("color-mix");
  });

  it("adds a starry sky to the scenery illustration at night", async () => {
    // Use fake timers only for Date to control time-of-day, but let
    // Promises/useEffect run normally.
    vi.useFakeTimers({ now: new Date("2024-01-01T23:00:00"), toFake: ["Date"] });
    mockSupabaseData();
    const { container } = render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    // Let effects run
    await vi.waitFor(() => {
      const stars = container.querySelectorAll('aside svg g[opacity="0.7"] circle');
      expect(stars.length).toBe(4);
    });
  });

  it("renders no stars in the scenery illustration during the day", async () => {
    vi.useFakeTimers({ now: new Date("2024-01-01T13:00:00"), toFake: ["Date"] });
    mockSupabaseData();
    const { container } = render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    await vi.waitFor(() => {
      const stars = container.querySelectorAll('aside svg g[opacity="0.7"] circle');
      expect(stars.length).toBe(0);
    });
  });
});
