import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEffect } from "react";
import { render, screen, within } from "@testing-library/react";

// --- Mocks -----------------------------------------------------------------

// `next/navigation` must be mocked so we can control the pathname per test.
const mockUsePathname = vi.fn<() => string>();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
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

// --- Tests -----------------------------------------------------------------

describe("NAV_TABS", () => {
  it("exports exactly five tabs", () => {
    expect(NAV_TABS).toHaveLength(5);
  });

  it("has tabs in the correct order with correct labels and hrefs", () => {
    const expected = [
      { label: "Home", href: "/home" },
      { label: "Scan", href: "/scan" },
      { label: "Suche", href: "/suche" },
      { label: "Familie", href: "/familie" },
      { label: "Aufgaben", href: "/aufgaben" },
    ];
    expect(NAV_TABS.map((t) => ({ label: t.label, href: t.href }))).toEqual(
      expected,
    );
  });

  it("each tab has a distinct icon component", () => {
    const icons = NAV_TABS.map((t) => t.icon);
    const uniqueIcons = new Set(icons);
    expect(uniqueIcons.size).toBe(5);
  });
});

describe("AppShell", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
    mockUsePathname.mockReturnValue("/home");
  });

  it("renders the page content inside the shell", () => {
    renderShell("/home");
    expect(screen.getByTestId("page-content")).toBeDefined();
  });

  it("renders a bottom navigation with exactly five tab links", () => {
    renderShell("/home");
    const nav = screen.getByRole("navigation", { name: /navigation/i });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(5);
  });

  it("labels the nav so it is identifiable as navigation", () => {
    renderShell("/home");
    // The <nav> element should have an accessible label.
    const nav = screen.getByRole("navigation");
    expect(nav.getAttribute("aria-label")).toBeTruthy();
  });

  it("each tab link has the correct label text and href", () => {
    renderShell("/home");
    const nav = screen.getByRole("navigation");
    const links = within(nav).getAllByRole("link");

    const expected = [
      { label: "Home", href: "/home" },
      { label: "Scan", href: "/scan" },
      { label: "Suche", href: "/suche" },
      { label: "Familie", href: "/familie" },
      { label: "Aufgaben", href: "/aufgaben" },
    ];

    links.forEach((link, i) => {
      expect(link.getAttribute("href")).toBe(expected[i].href);
      expect(within(link).getByText(expected[i].label)).toBeDefined();
    });
  });

  it("marks the Home tab as active when on /home", () => {
    renderShell("/home");
    const nav = screen.getByRole("navigation");
    const homeLink = within(nav).getByText("Home").closest("a");
    expect(homeLink?.getAttribute("aria-current")).toBe("page");
  });

  it("marks the Aufgaben tab as active when on /aufgaben", () => {
    renderShell("/aufgaben");
    const nav = screen.getByRole("navigation");
    const aufgabenLink = within(nav).getByText("Aufgaben").closest("a");
    expect(aufgabenLink?.getAttribute("aria-current")).toBe("page");
  });

  it("updates the active tab when pathname changes", () => {
    const { rerender } = renderShell("/home");
    let nav = screen.getByRole("navigation");
    let homeLink = within(nav).getByText("Home").closest("a");
    let scanLink = within(nav).getByText("Scan").closest("a");
    expect(homeLink?.getAttribute("aria-current")).toBe("page");
    expect(scanLink?.getAttribute("aria-current")).toBeNull();

    mockUsePathname.mockReturnValue("/scan");
    rerender(
      <AppShell>
        <div data-testid="page-content">Seiteninhalt</div>
      </AppShell>,
    );
    nav = screen.getByRole("navigation");
    homeLink = within(nav).getByText("Home").closest("a");
    scanLink = within(nav).getByText("Scan").closest("a");
    expect(homeLink?.getAttribute("aria-current")).toBeNull();
    expect(scanLink?.getAttribute("aria-current")).toBe("page");
  });

  it("marks a tab active for nested routes (e.g. /familie/123)", () => {
    renderShell("/familie/123");
    const nav = screen.getByRole("navigation");
    const familieLink = within(nav).getByText("Familie").closest("a");
    expect(familieLink?.getAttribute("aria-current")).toBe("page");
  });

  it("only one tab is active at a time", () => {
    renderShell("/suche");
    const nav = screen.getByRole("navigation");
    const links = within(nav).getAllByRole("link");
    const activeCount = links.filter(
      (l) => l.getAttribute("aria-current") === "page",
    ).length;
    expect(activeCount).toBe(1);
  });

  it("hides the bottom navigation on /onboarding", () => {
    renderShell("/onboarding");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("hides the bottom navigation on nested onboarding routes", () => {
    renderShell("/onboarding/step-2");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("renders a logout affordance", () => {
    renderShell("/home");
    // The logout button should be present and labelled in German.
    const logoutButton = screen.getByRole("button", { name: /abmelden/i });
    expect(logoutButton).toBeDefined();
  });

  it("logout affordance is also present on onboarding (no nav but still exit)", () => {
    renderShell("/onboarding");
    expect(screen.getByRole("button", { name: /abmelden/i })).toBeDefined();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  // --- Page-fade animation retrigger (VAL-DESIGN-010) ---------------------

  it("applies the page-fade-in animation class to the content wrapper", () => {
    renderShell("/home");
    const main = screen.getByRole("main");
    const animatedWrapper = main.querySelector(".animate-page-fade-in");
    expect(animatedWrapper).not.toBeNull();
  });

  it("remounts the content wrapper when the pathname changes (pathname key)", () => {
    // A child that records how many times it has mounted. If the content
    // wrapper is keyed by pathname, changing the route unmounts and
    // remounts the subtree — incrementing the mount counter — which is
    // what causes the page-fade animation to replay on every tab switch.
    const mountCounter: { current: number } = { current: 0 };
    function MountTracker() {
      useEffect(() => {
        mountCounter.current += 1;
      }, []);
      return <div data-testid="mount-tracker">tracked</div>;
    }

    mockUsePathname.mockReturnValue("/home");
    const { rerender } = render(
      <AppShell>
        <MountTracker />
      </AppShell>,
    );
    expect(mountCounter.current).toBe(1);

    // Navigate to a different tab — the keyed wrapper must remount.
    mockUsePathname.mockReturnValue("/scan");
    rerender(
      <AppShell>
        <MountTracker />
      </AppShell>,
    );
    expect(mountCounter.current).toBe(2);

    // A third tab switch remounts again.
    mockUsePathname.mockReturnValue("/aufgaben");
    rerender(
      <AppShell>
        <MountTracker />
      </AppShell>,
    );
    expect(mountCounter.current).toBe(3);
  });
});
