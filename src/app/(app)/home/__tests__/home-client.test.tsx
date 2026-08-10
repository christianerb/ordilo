import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render as rtlRender,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";

// Mock next/navigation useRouter
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock @/lib/supabase/client. Also backs useFamilyId's `families` lookup
// (used by ScanProvider, which HomeClient now reads scan state from) —
// resolving to no family short-circuits the provider's document fetch.
const mockUpdate = vi.fn();
const mockEq = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: vi.fn(() => ({
      update: mockUpdate,
      eq: mockEq,
      select: vi.fn(() => ({
        limit: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  }),
}));
vi.mock("@/lib/upload", () => ({ uploadFile: vi.fn() }));
vi.mock("@/lib/ocr", () => ({ triggerOcr: vi.fn() }));

// Mock sonner so we can assert on toast calls without mounting a <Toaster/>.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";
import { HomeClient, type HomeClientProps } from "@/app/(app)/home/home-client";
import type { HomeTask } from "@/lib/home-utils";
import { ScanProvider } from "@/lib/scan/scan-context";

/**
 * HomeClient reads shared scan actions from ScanProvider —
 * wrap every render in it so those hooks resolve without every call site
 * needing to know about the provider. The suggestion-chips hook needs no
 * provider (the default context is a no-op).
 */
function render(ui: ReactElement, options?: Parameters<typeof rtlRender>[1]) {
  return rtlRender(<ScanProvider>{ui}</ScanProvider>, options);
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const members = [
  { id: "m1", name: "Emma", role: "Kind", avatar_color: "#E46018" },
  { id: "m2", name: "Christian", role: "Vater", avatar_color: "#305460" },
  { id: "m3", name: "Hanna", role: "Kind", avatar_color: "#F0B4A0" },
];

const analyzedDocuments = [
  {
    id: "doc-1",
    title: "Kita-Brief für Emma",
    original_filename: "kita.pdf",
    mime_type: "application/pdf",
    status: "analyzed",
    created_at: "2026-07-06T10:00:00Z",
  },
  {
    id: "doc-2",
    title: "Stromrechnung Juli",
    original_filename: "strom.pdf",
    mime_type: "application/pdf",
    status: "analyzed",
    created_at: "2026-07-05T14:00:00Z",
  },
];

const upcomingTasks: HomeTask[] = [
  {
    id: "task-1",
    family_id: "fam-1",
    title: "Rechnung bezahlen",
    description: null,
    due_date: "2026-07-07",
    priority: "high",
    status: "open",
    confidence: 0.9,
    confirmed: true,
    created_at: "2026-07-01T00:00:00Z",
    tags: [],
    document_id: "doc-2",
    document_title: "Stromrechnung Juli",
  },
  {
    id: "task-2",
    family_id: "fam-1",
    title: "Anmeldung Kita",
    description: null,
    due_date: "2026-07-15",
    priority: "medium",
    status: "open",
    confidence: 0.85,
    confirmed: true,
    created_at: "2026-07-02T00:00:00Z",
    tags: [],
    document_id: "doc-1",
    document_title: "Kita-Brief für Emma",
  },
  {
    id: "task-3",
    family_id: "fam-1",
    title: "Alter Task",
    description: null,
    due_date: "2026-06-01",
    priority: "low",
    status: "open",
    confidence: 0.7,
    confirmed: true,
    created_at: "2026-05-01T00:00:00Z",
    tags: [],
    document_id: null,
    document_title: null,
  },
];

const recentDocuments = [
  {
    id: "doc-3",
    title: "Arztbrief",
    original_filename: "arzt.pdf",
    mime_type: "application/pdf",
    status: "confirmed",
    created_at: "2026-07-06T14:30:00Z",
  },
  {
    id: "doc-4",
    title: "Versicherungsschreiben",
    original_filename: "vers.pdf",
    mime_type: "application/pdf",
    status: "confirmed",
    created_at: "2026-07-04T09:00:00Z",
  },
];

const defaultProps: HomeClientProps = {
  greeting: "Guten Abend",
  familyName: "Erb",
  members,
  analyzedDocuments,
  unconfirmedDocCount: 2,
  upcomingTasks,
  recentDocuments,
  thumbUrls: {},
  insights: [],
};

// Reference date for test data: 2026-07-06 (matches system date)
// Test task due dates are relative to this date.

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockPush.mockClear();
  mockUpdate.mockClear();
  mockEq.mockClear();
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockEq.mockResolvedValue({ error: null });
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  // Mock scrollIntoView (not implemented in jsdom)
  Element.prototype.scrollIntoView = vi.fn();
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HomeClient — Family Display", () => {
  it("references the family name in the member link", () => {
    render(<HomeClient {...defaultProps} />);
    expect(screen.getByLabelText("Familie Erb")).toBeDefined();
  });

  it("shows family member avatars with accessible names", () => {
    render(<HomeClient {...defaultProps} />);
    const memberList = screen.getByTestId("member-list");
    expect(memberList.querySelector('[aria-label="Emma"]')).not.toBeNull();
    expect(memberList.querySelector('[aria-label="Christian"]')).not.toBeNull();
    expect(memberList.querySelector('[aria-label="Hanna"]')).not.toBeNull();
  });
});

describe("HomeClient — Briefing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the daily briefing under the greeting", () => {
    render(<HomeClient {...defaultProps} />);
    const briefing = screen.getByTestId("home-briefing");
    // Reference date 2026-07-06: "Alter Task" (due 2026-06-01) is overdue,
    // and 2 documents wait for confirmation.
    expect(briefing.textContent).toBe(
      "„Alter Task\" ist überfällig — am besten heute erledigen. " +
        "Außerdem warten 2 Dokumente auf dein OK.",
    );
  });

  it("has a warm calm state when nothing is going on", () => {
    render(
      <HomeClient
        {...defaultProps}
        upcomingTasks={[]}
        unconfirmedDocCount={0}
        analyzedDocuments={[]}
      />,
    );
    expect(screen.getByTestId("home-briefing").textContent).toBe(
      "Alles erledigt — die Woche sieht ruhig aus.",
    );
  });
});

describe("HomeClient — Heute hero", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the most overdue task with an 'Überfällig' label", () => {
    render(<HomeClient {...defaultProps} />);
    const hero = screen.getByTestId("today-hero");
    expect(within(hero).getByTestId("today-hero-label").textContent).toContain(
      "Überfällig",
    );
    expect(within(hero).getByText("Alter Task")).toBeDefined();
  });

  it("marks the hero task as done via the hero action", async () => {
    render(<HomeClient {...defaultProps} />);
    fireEvent.click(screen.getByTestId("today-hero-done"));
    expect(mockUpdate).toHaveBeenCalledWith({ status: "done" });
    // vi.waitFor (not waitFor): it advances the fake timers this describe
    // block installs instead of deadlocking on them.
    await vi.waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Erledigt — gut gemacht!");
    });
  });

  it("gives hero actions a one-thumb target", () => {
    render(<HomeClient {...defaultProps} />);
    const hero = screen.getByTestId("today-hero");
    expect(within(hero).getByTestId("today-hero-done").className).toContain(
      "h-11",
    );
    expect(within(hero).getByText("Details").className).toContain("h-11");
  });

  it("labels a task due today as 'Heute fällig'", () => {
    render(
      <HomeClient
        {...defaultProps}
        upcomingTasks={[
          { ...upcomingTasks[0], id: "task-today", due_date: "2026-07-06" },
        ]}
      />,
    );
    const hero = screen.getByTestId("today-hero");
    expect(within(hero).getByTestId("today-hero-label").textContent).toContain(
      "Heute fällig",
    );
    expect(within(hero).getByText("Rechnung bezahlen")).toBeDefined();
  });

  it("promotes an urgent insight when no task is close", () => {
    const urgentInsight = {
      id: "ins-1",
      icon: "alert" as const,
      title: "Frist läuft in 2 Tagen ab",
      detail: "Schulranzen kaufen",
      href: "/aufgaben",
      tone: "urgent" as const,
    };
    render(
      <HomeClient
        {...defaultProps}
        upcomingTasks={[]}
        insights={[urgentInsight]}
      />,
    );
    const hero = screen.getByTestId("today-hero");
    expect(within(hero).getByText("Frist läuft in 2 Tagen ab")).toBeDefined();
    // The hero insight is not duplicated in the Hinweise section.
    expect(screen.queryByTestId("home-section-insights")).toBeNull();
  });

  it("shows the calm hero when nothing is going on", () => {
    render(
      <HomeClient
        {...defaultProps}
        upcomingTasks={[]}
        unconfirmedDocCount={0}
        analyzedDocuments={[]}
      />,
    );
    expect(
      within(screen.getByTestId("today-hero")).getByText(
        "Alles im grünen Bereich",
      ),
    ).toBeDefined();
  });
});

describe("HomeClient — Aufgaben timeline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the 'Als Nächstes' section heading", () => {
    render(<HomeClient {...defaultProps} />);
    expect(screen.getByText("Als Nächstes")).toBeDefined();
  });

  it("starts the list after the task the hero already shows", () => {
    render(<HomeClient {...defaultProps} />);
    const list = screen.getByTestId("home-tasks-next");
    const titles = within(list)
      .getAllByText(/Alter Task|Rechnung bezahlen|Anmeldung Kita/)
      .map((el) => el.textContent);
    // The hero covers "Alter Task" (overdue) — the list continues with
    // the next tasks in due-date order.
    expect(titles).toEqual(["Rechnung bezahlen", "Anmeldung Kita"]);
    expect(within(list).queryByText("Alter Task")).toBeNull();
  });

  it("caps the list at three tasks and links to the full list", () => {
    // Extra this-week tasks push the "later" task ("Anmeldung Kita")
    // past the cap.
    const extra = Array.from({ length: 3 }, (_, i) => ({
      ...upcomingTasks[0],
      id: `task-extra-${i}`,
      title: `Extra-Aufgabe ${i}`,
      due_date: "2026-07-08",
    }));
    render(
      <HomeClient
        {...defaultProps}
        upcomingTasks={[...upcomingTasks, ...extra]}
      />,
    );
    const list = screen.getByTestId("home-tasks-next");
    // Only the top 3 render …
    expect(within(list).getByText("Rechnung bezahlen")).toBeDefined();
    expect(within(list).queryByText("Anmeldung Kita")).toBeNull();
    // … and the rest are one tap away.
    const showAll = screen.getByTestId("home-tasks-show-all");
    // The full, uncapped count — home derives it from the whole task
    // list, not from the capped display slice.
    expect(showAll.textContent).toContain("Alle 6 Aufgaben anzeigen");
    expect(showAll.getAttribute("href")).toBe("/aufgaben");
  });

  it("hides the show-all link when everything already fits", () => {
    render(<HomeClient {...defaultProps} />);
    expect(screen.queryByTestId("home-tasks-show-all")).toBeNull();
  });

  it("does not render the Aufgaben section when there are no tasks", () => {
    render(
      <HomeClient
        {...defaultProps}
        upcomingTasks={[]}
      />,
    );
    expect(screen.queryByTestId("home-section-aufgaben")).toBeNull();
  });

  it("hides the section when the hero covers the only task", () => {
    render(
      <HomeClient
        {...defaultProps}
        upcomingTasks={[upcomingTasks[2]]} // only "Alter Task" (overdue → hero)
      />,
    );
    expect(screen.queryByTestId("home-section-aufgaben")).toBeNull();
    expect(
      within(screen.getByTestId("today-hero")).getByText("Alter Task"),
    ).toBeDefined();
  });
});

describe("HomeClient — Deine Dokumente (journal)", () => {
  it("renders the journal section heading", () => {
    render(<HomeClient {...defaultProps} />);
    expect(screen.getByText("Deine Dokumente")).toBeDefined();
  });

  it("shows analyzed documents first with a 'Bitte bestätigen' chip", () => {
    render(<HomeClient {...defaultProps} />);
    const section = screen
      .getByText("Deine Dokumente")
      .closest("[data-testid='home-section-journal']") as HTMLElement;
    expect(
      within(section).getByText("Kita-Brief für Emma"),
    ).toBeDefined();
    expect(within(section).getByText("Stromrechnung Juli")).toBeDefined();
    expect(within(section).getAllByText("Bitte bestätigen")).toHaveLength(2);
  });

  it("shows recent documents with their status label", () => {
    render(<HomeClient {...defaultProps} />);
    const section = screen
      .getByText("Deine Dokumente")
      .closest("[data-testid='home-section-journal']") as HTMLElement;
    expect(within(section).getByText("Arztbrief")).toBeDefined();
    expect(within(section).getByText("Versicherungsschreiben")).toBeDefined();
    expect(
      within(section).getAllByText("Im Familienbuch").length,
    ).toBeGreaterThan(0);
  });

  it("renders a thumbnail image when a signed URL exists", () => {
    render(
      <HomeClient
        {...defaultProps}
        thumbUrls={{ "doc-3": "https://example.com/thumb.webp" }}
      />,
    );
    const section = screen
      .getByText("Deine Dokumente")
      .closest("[data-testid='home-section-journal']") as HTMLElement;
    const img = section.querySelector("img[src='https://example.com/thumb.webp']");
    expect(img).not.toBeNull();
  });

  it("does not show failed documents (VAL-CROSS-013)", () => {
    render(
      <HomeClient
        {...defaultProps}
        recentDocuments={[
          ...recentDocuments,
          {
            id: "doc-fail",
            title: "Fehlgeschlagenes Dokument",
            original_filename: "fail.pdf",
            mime_type: "application/pdf",
            status: "failed",
            created_at: "2026-07-06T15:00:00Z",
          },
        ]}
      />,
    );
    const section = screen
      .getByText("Deine Dokumente")
      .closest("[data-testid='home-section-journal']") as HTMLElement;
    expect(
      within(section).queryByText("Fehlgeschlagenes Dokument"),
    ).toBeNull();
  });

  it("shows an empty state with a scan CTA when there are no documents", () => {
    render(
      <HomeClient
        {...defaultProps}
        analyzedDocuments={[]}
        recentDocuments={[]}
      />,
    );
    const section = screen
      .getByText("Deine Dokumente")
      .closest("[data-testid='home-section-journal']") as HTMLElement;
    expect(within(section).getByText("Noch keine Dokumente")).toBeDefined();
    // VAL-HOME-007: empty state must include a scan CTA
    expect(
      within(section).getByRole("button", { name: "Dokument scannen" }),
    ).toBeDefined();
  });

  it("scan CTA in the empty state opens the scan wizard", async () => {
    render(
      <HomeClient
        {...defaultProps}
        analyzedDocuments={[]}
        recentDocuments={[]}
      />,
    );
    const section = screen
      .getByText("Deine Dokumente")
      .closest("[data-testid='home-section-journal']");
    const cta = within(section as HTMLElement).getByRole("button", {
      name: "Dokument scannen",
    });
    fireEvent.click(cta);
    await waitFor(() => {
      expect(screen.getByTestId("scan-wizard")).toBeDefined();
    });
  });
});

describe("HomeClient — Layout", () => {
  it("renders all sections in the correct order", () => {
    render(<HomeClient {...defaultProps} />);
    const sections = screen.getAllByTestId(/^home-section-/);
    const sectionIds = sections.map((s) => s.getAttribute("data-testid"));
    expect(sectionIds).toEqual([
      "home-section-aufgaben",
      "home-section-journal",
    ]);
  });
});

describe("HomeClient — Task Interaction", () => {
  it("marks a task as done from the home dashboard", async () => {
    render(<HomeClient {...defaultProps} />);

    // Click the checkbox for the first task in "Als Nächstes"
    const checkboxes = screen.getAllByTestId("task-checkbox");
    expect(checkboxes.length).toBeGreaterThan(0);
    fireEvent.click(checkboxes[0]);

    // The update should have been called with status "done"
    expect(mockUpdate).toHaveBeenCalledWith({ status: "done" });
  });

  it("shows a success toast after a task is marked done", async () => {
    render(<HomeClient {...defaultProps} />);
    const checkboxes = screen.getAllByTestId("task-checkbox");
    fireEvent.click(checkboxes[0]);
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Erledigt — gut gemacht!");
    });
  });
});

describe("HomeClient — Family avatar overflow", () => {
  it("shows a '+N' overflow pill when there are more than 5 family members", () => {
    const manyMembers = [
      ...members,
      { id: "m4", name: "Anna", role: "Kind", avatar_color: "#606060" },
      { id: "m5", name: "Ben", role: "Kind", avatar_color: "#606060" },
      { id: "m6", name: "Clara", role: "Kind", avatar_color: "#606060" },
    ];
    render(<HomeClient {...defaultProps} members={manyMembers} />);
    const memberList = screen.getByTestId("member-list");
    expect(within(memberList).getByText("+1")).toBeDefined();
  });
});

describe("HomeClient — German UI", () => {
  it("does not expose English UI text", () => {
    const { container } = render(<HomeClient {...defaultProps} />);
    // Check for common English strings that should not appear
    expect(container.textContent).not.toContain("Welcome");
    expect(container.textContent).not.toContain("Important today");
    expect(container.textContent).not.toContain("Deadlines");
    expect(container.textContent).not.toContain("Recently scanned");
    expect(container.textContent).not.toContain("Your documents");
  });
});
