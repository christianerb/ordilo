import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

// --- Mocks -----------------------------------------------------------------

// `next/navigation` must be mocked so we can control the pathname per test.
const mockUsePathname = vi.fn<() => string>();
const mockSearchParamsGet = vi.fn<(key: string) => string | null>(() => null);
const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => ({ get: mockSearchParamsGet }),
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
  it("exports exactly four tabs (Heute, Meine Ablage, Familienplaner, Familie)", () => {
    expect(NAV_TABS).toHaveLength(4);
  });

  it("has tabs in the correct order with correct labels and hrefs", () => {
    const expected = [
      { label: "Heute", href: "/home" },
      { label: "Meine Ablage", href: "/dokumente" },
      { label: "Familienplaner", href: "/aufgaben" },
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

  it("nests Aufgaben and Planer under Familienplaner", () => {
    const planner = NAV_TABS.find((tab) => tab.label === "Familienplaner");
    expect(planner?.children).toEqual([
      { label: "Aufgaben", href: "/aufgaben", icon: expect.anything() },
      { label: "Planer", href: "/aufgaben?tab=planer", icon: expect.anything() },
    ]);
  });

  it("nests Dokumente, Notizen, and Kontakte under Meine Ablage", () => {
    const filing = NAV_TABS.find((tab) => tab.label === "Meine Ablage");
    expect(filing?.children).toEqual([
      { label: "Dokumente", href: "/dokumente", icon: expect.anything() },
      {
        label: "Notizen",
        href: "/dokumente?tab=notizen",
        icon: expect.anything(),
      },
      {
        label: "Kontakte",
        href: "/dokumente?tab=kontakte",
        icon: expect.anything(),
      },
    ]);
  });
});

describe("AppShell", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
    mockUsePathname.mockReturnValue("/home");
    mockSearchParamsGet.mockReset();
    mockSearchParamsGet.mockReturnValue(null);
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

  it("renders a nav drawer with the primary links, sub-items, and chat history", () => {
    renderShell("/home");
    openMobileMenu();
    const nav = screen.getByRole("navigation", { name: /navigation/i });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(10);
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
      { label: "Meine Ablage", href: "/dokumente" },
      { label: "Dokumente", href: "/dokumente" },
      { label: "Notizen", href: "/dokumente?tab=notizen" },
      { label: "Kontakte", href: "/dokumente?tab=kontakte" },
      { label: "Familienplaner", href: "/aufgaben" },
      { label: "Aufgaben", href: "/aufgaben" },
      { label: "Planer", href: "/aufgaben?tab=planer" },
      { label: "Familie", href: "/familie" },
      { label: "Chat-Verlauf", href: "/suche?history=1" },
    ];

    links.forEach((link, i) => {
      expect(link.getAttribute("href")).toBe(expected[i].href);
      expect(within(link).getByText(expected[i].label)).toBeDefined();
    });
  });

  it("marks Meine Ablage as active when on /dokumente", () => {
    renderShell("/dokumente");
    openMobileMenu();
    const nav = screen.getByRole("navigation");
    const filingLink = within(nav).getByText("Meine Ablage").closest("a");
    expect(filingLink?.getAttribute("aria-current")).toBe("page");
  });

  it("keeps Meine Ablage active on /sammlungen (collections live under it)", () => {
    renderShell("/sammlungen/col-1");
    openMobileMenu();
    const nav = screen.getByRole("navigation");
    const filingLink = within(nav).getByText("Meine Ablage").closest("a");
    expect(filingLink?.getAttribute("aria-current")).toBe("page");
  });

  it("updates the active tab when pathname changes", () => {
    const { rerender } = renderShell("/dokumente");
    openMobileMenu();
    let nav = screen.getByRole("navigation");
    let filingLink = within(nav).getByText("Meine Ablage").closest("a");
    let familieLink = within(nav).getByText("Familie").closest("a");
    expect(filingLink?.getAttribute("aria-current")).toBe("page");
    expect(familieLink?.getAttribute("aria-current")).toBeNull();

    mockUsePathname.mockReturnValue("/familie");
    rerender(
      <AppShell>
        <div data-testid="page-content">Seiteninhalt</div>
      </AppShell>,
    );
    nav = screen.getByRole("navigation");
    filingLink = within(nav).getByText("Meine Ablage").closest("a");
    familieLink = within(nav).getByText("Familie").closest("a");
    expect(filingLink?.getAttribute("aria-current")).toBeNull();
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

  it("marks Familienplaner active on /aufgaben", () => {
    renderShell("/aufgaben");
    openMobileMenu();
    const nav = screen.getByRole("navigation");
    const heuteLink = within(nav).getByText("Heute").closest("a");
    const plannerLink = within(nav).getByText("Familienplaner").closest("a");
    expect(heuteLink?.getAttribute("aria-current")).toBeNull();
    expect(plannerLink?.getAttribute("aria-current")).toBe("page");
  });

  it("marks no tab active on /suche (fullscreen answer mode, not a place)", () => {
    renderShell("/suche");
    openMobileMenu();
    const nav = screen.getByRole("navigation");
    const activeLinks = nav.querySelectorAll('a[aria-current="page"]');
    expect(activeLinks.length).toBe(0);
  });

  it("closes the drawer and navigates when the filing link is clicked", () => {
    renderShell("/home");
    openMobileMenu();
    const nav = screen.getByRole("navigation");
    fireEvent.click(within(nav).getByText("Meine Ablage"));
    // Sheet content unmounts once closed (Radix default, no forceMount).
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("hides the hamburger menu button entirely on /onboarding (drawer would be empty)", () => {
    renderShell("/onboarding");
    expect(screen.queryByRole("button", { name: /menü öffnen/i })).toBeNull();
  });

  it("hides the hamburger menu button on nested onboarding routes", () => {
    renderShell("/onboarding/step-2");
    expect(screen.queryByRole("button", { name: /menü öffnen/i })).toBeNull();
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

  it("the mobile drawer's logout affordance is unreachable during onboarding (menu button hidden)", () => {
    renderShell("/onboarding");
    expect(screen.queryByRole("button", { name: /menü öffnen/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /abmelden/i })).toBeNull();
  });

  it("offers a direct link to the chat history from the mobile drawer, not just via the composer", () => {
    renderShell("/home");
    openMobileMenu();
    const link = screen.getByTestId("topbar-chat-history-link");
    expect(link.getAttribute("href")).toBe("/suche?history=1");
  });

  it("offers a direct link to the chat history from the desktop sidebar", () => {
    renderShell("/home");
    const link = screen.getByTestId("sidebar-chat-history-link");
    expect(link.getAttribute("href")).toBe("/suche?history=1");
  });

  // --- Global search + scan bottom bars (VAL-NAV) -------------------------

  it("renders both the mobile composer and the desktop bottom bar (search + actions) on every tab, including /suche", () => {
    for (const pathname of ["/home", "/dokumente", "/suche", "/familie", "/aufgaben"]) {
      // Mobile composer + desktop bottom bar both exist in jsdom (only
      // Tailwind breakpoints hide one or the other visually). /suche shares
      // this same global bottom bar rather than rendering its own inline
      // composer — a single unified bar is used on every route.
      const { unmount } = renderShell(pathname);
      expect(screen.getByTestId("mobile-composer")).toBeDefined();
      expect(screen.getByTestId("desktop-bottom-bar")).toBeDefined();
      expect(screen.getAllByTestId("ai-search-bar")).toHaveLength(2);
      // Scanning now lives behind the shared + action sheet instead of an
      // inline button — one + per surface (mobile pill, desktop dock).
      expect(screen.getAllByRole("button", { name: /^aktionen$/i })).toHaveLength(2);
      unmount();
    }
  });

  it("does not zoom into the fullscreen overlay on /suche (already inside the chat)", () => {
    renderShell("/suche");
    const [pill] = screen.getAllByRole("textbox");
    fireEvent.focus(pill);
    expect(screen.queryByTestId("composer-overlay")).toBeNull();
  });

  it("still zooms into the fullscreen overlay on other tabs", () => {
    renderShell("/home");
    const [pill] = screen.getAllByRole("textbox");
    fireEvent.focus(pill);
    expect(screen.getByTestId("composer-overlay")).toBeDefined();
  });

  it("renders the desktop composer as a rounded floating dock", () => {
    renderShell("/home");
    const dock = screen.getByTestId("desktop-floating-dock");
    expect(dock.className).toContain("rounded-ordilo-md");
    expect(dock.className).toContain("shadow-card-hover");
    expect(screen.queryByTestId("desktop-shell-elbow")).toBeNull();
  });

  it("does not render the search+actions row on /onboarding", () => {
    renderShell("/onboarding");
    expect(screen.queryByTestId("ai-search-bar")).toBeNull();
    expect(screen.queryByRole("button", { name: /^aktionen$/i })).toBeNull();
  });

  it("navigates to /suche with the query when submitted from a non-suche tab", () => {
    renderShell("/dokumente");
    const [input] = screen.getAllByRole("textbox") as HTMLTextAreaElement[];
    const [sendButton] = screen.getAllByRole("button", { name: /senden/i });
    fireEvent.change(input, { target: { value: "Zeig mir Rechnungen" } });
    fireEvent.click(sendButton);

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
    const [sendButton] = screen.getAllByRole("button", { name: /senden/i });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(sendButton);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("opens the native upload picker via the + action sheet", async () => {
    renderShell("/dokumente");
    const uploadInput = screen.getByTestId("wizard-gallery-input");
    const click = vi.spyOn(uploadInput, "click");
    const [actionsButton] = screen.getAllByRole("button", { name: /^aktionen$/i });
    fireEvent.click(actionsButton);
    const uploadAction = await screen.findByTestId("composer-action-upload");
    fireEvent.click(uploadAction);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("opens the create-note sheet via the + action sheet", async () => {
    renderShell("/dokumente");
    const [actionsButton] = screen.getAllByRole("button", { name: /^aktionen$/i });
    fireEvent.click(actionsButton);
    const noteAction = await screen.findByTestId("composer-action-note");
    fireEvent.click(noteAction);
    await waitFor(() => {
      expect(screen.getByTestId("create-note-sheet")).toBeDefined();
    });
  });

  it("swaps the + action sheet to the collection form for 'Neue Sammlung'", async () => {
    renderShell("/dokumente");
    const [actionsButton] = screen.getAllByRole("button", { name: /^aktionen$/i });
    fireEvent.click(actionsButton);
    const collectionAction = await screen.findByTestId("composer-action-collection");
    fireEvent.click(collectionAction);
    expect(
      screen.getByText("Gib der Sammlung einen Namen, ein Icon und eine Farbe."),
    ).toBeDefined();
    expect(await screen.findByLabelText("Name")).toBeDefined();
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
    mockUsePathname.mockReturnValue("/home");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  it("shows the time-aware family scene only while the sidebar is expanded", () => {
    mockSupabaseData();
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );

    expect(screen.getByTestId("sidebar-scenery")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Seitenleiste einklappen"));
    expect(screen.queryByTestId("sidebar-scenery")).toBeNull();
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
    await waitFor(() => {
      const greetingEl = screen.getByText(/Guten (Morgen|Tag|Abend)|Gute Nacht/);
      // The greeting is calculated in a post-render effect, so wait for its
      // visible state rather than just the independently rendered profile.
      const greetingContainer = greetingEl.closest("div");
      expect(greetingContainer?.className).toContain("opacity-100");
      expect(greetingContainer?.textContent).toContain("Familie Müller");
    });
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

});

// ---------------------------------------------------------------------------
// Server-provided shell data (profile + collections from the server layout)
// ---------------------------------------------------------------------------

describe("AppShell server-provided data", () => {
  const serverCollections = [
    { id: "col-1", name: "Rechnungen", icon: "receipt", color: "petrol" },
    { id: "col-2", name: "Schule", icon: "graduation-cap", color: "apricot" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/home");
    mockSupabaseData();
  });

  it("renders the server-provided profile immediately", () => {
    render(
      <AppShell
        profile={{ familyName: "Familie Server", email: "server@example.com" }}
        initialCollections={serverCollections}
      >
        <div>content</div>
      </AppShell>,
    );
    // No async fetch needed — the data is there on first render.
    // (Collections are no longer listed in the nav; they still hydrate the
    // shared provider for /dokumente and the "+" sheet.)
    expect(screen.getAllByText("Familie Server").length).toBeGreaterThanOrEqual(1);
  });

  it("skips the client-side profile and collections fetches when server data is given", async () => {
    render(
      <AppShell
        profile={{ familyName: "Familie Server", email: "server@example.com" }}
        initialCollections={serverCollections}
      >
        <div>content</div>
      </AppShell>,
    );
    await screen.findAllByText("Familie Server");
    // The profile fetch (auth.getUser) and the collections query must not
    // fire — the server layout already resolved both. (ScanProvider still
    // resolves the family id via from("families"), which is fine.)
    expect(mockAuthGetUser).not.toHaveBeenCalled();
    const queriedTables = mockFrom.mock.calls.map((call) => call[0]);
    expect(queriedTables).not.toContain("collections");
  });

  it("does not fall back to a client fetch when the server profile is undefined (no family)", async () => {
    render(
      <AppShell profile={undefined} initialCollections={[]}>
        <div>content</div>
      </AppShell>,
    );
    // Server-data mode is active (initialCollections given, empty): the
    // client fetch must stay off even though there is no profile.
    expect(mockAuthGetUser).not.toHaveBeenCalled();
    const queriedTables = mockFrom.mock.calls.map((call) => call[0]);
    expect(queriedTables).not.toContain("collections");
  });
});
