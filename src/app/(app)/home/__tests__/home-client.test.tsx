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
 * needing to know about the provider.
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
  upcomingTasks,
  recentDocuments,
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HomeClient — Family Display", () => {
  it("shows the family name", () => {
    render(<HomeClient {...defaultProps} />);
    expect(screen.getByText("Erb")).toBeDefined();
  });

  it("shows family member avatars with accessible names", () => {
    render(<HomeClient {...defaultProps} />);
    const memberList = screen.getByTestId("member-list");
    expect(memberList.querySelector('[aria-label="Emma"]')).not.toBeNull();
    expect(memberList.querySelector('[aria-label="Christian"]')).not.toBeNull();
    expect(memberList.querySelector('[aria-label="Hanna"]')).not.toBeNull();
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

  it("shows the next tasks in priority order: overdue first", () => {
    render(<HomeClient {...defaultProps} />);
    const list = screen.getByTestId("home-tasks-next");
    const titles = within(list)
      .getAllByText(/Alter Task|Rechnung bezahlen|Anmeldung Kita/)
      .map((el) => el.textContent);
    // Overdue ("Alter Task") sorts before this week ("Rechnung bezahlen")
    // before later ("Anmeldung Kita").
    expect(titles).toEqual([
      "Alter Task",
      "Rechnung bezahlen",
      "Anmeldung Kita",
    ]);
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
    expect(within(list).getByText("Alter Task")).toBeDefined();
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
});

describe("HomeClient — Zum Durchsehen", () => {
  it("renders the section heading", () => {
    render(<HomeClient {...defaultProps} />);
    expect(
      screen.getByText("Zum Durchsehen"),
    ).toBeDefined();
  });

  it("shows analyzed documents with a review affordance", () => {
    render(<HomeClient {...defaultProps} />);
    const section = screen
      .getByText("Zum Durchsehen")
      .closest("[data-testid='home-section-review-docs']");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByText("Kita-Brief für Emma"),
    ).toBeDefined();
    expect(
      within(section as HTMLElement).getByText("Stromrechnung Juli"),
    ).toBeDefined();
  });

  it("shows an empty state with a scan CTA when there are no analyzed documents", () => {
    render(
      <HomeClient
        {...defaultProps}
        analyzedDocuments={[]}
      />,
    );
    const section = screen
      .getByText("Zum Durchsehen")
      .closest("[data-testid='home-section-review-docs']");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByText("Alles durchgesehen — fein"),
    ).toBeDefined();
    // VAL-HOME-007: empty state must include a scan CTA
    expect(
      within(section as HTMLElement).getByRole("button", { name: "Dokument scannen" }),
    ).toBeDefined();
  });
});

describe("HomeClient — Zuletzt gescannt", () => {
  it("renders the 'Zuletzt gescannt' section heading", () => {
    render(<HomeClient {...defaultProps} />);
    expect(screen.getByText("Zuletzt gescannt")).toBeDefined();
  });

  it("shows recently scanned documents", () => {
    render(<HomeClient {...defaultProps} />);
    expect(screen.getByText("Arztbrief")).toBeDefined();
    expect(screen.getByText("Versicherungsschreiben")).toBeDefined();
  });

  it("shows an empty state with a scan CTA when there are no documents", () => {
    render(
      <HomeClient
        {...defaultProps}
        recentDocuments={[]}
      />,
    );
    const section = screen
      .getByText("Zuletzt gescannt")
      .closest("[data-testid='home-section-recent-docs']");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByText("Noch keine Dokumente"),
    ).toBeDefined();
    // VAL-HOME-007: empty state must include a scan CTA
    expect(
      within(section as HTMLElement).getByRole("button", { name: "Dokument scannen" }),
    ).toBeDefined();
  });

  it("does not show failed documents in 'Zuletzt gescannt' (VAL-CROSS-013)", () => {
    // The server query already excludes failed docs, but the client must
    // also not render them if any slip through.
    render(
      <HomeClient
        {...defaultProps}
        recentDocuments={[
          {
            id: "doc-ok",
            title: "Arztbrief",
            original_filename: "arzt.pdf",
            mime_type: "application/pdf",
            status: "confirmed",
            created_at: "2026-07-06T14:30:00Z",
          },
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
      .getByText("Zuletzt gescannt")
      .closest("[data-testid='home-section-recent-docs']");
    expect(section).not.toBeNull();
    // Non-failed document still appears
    expect(
      within(section as HTMLElement).getByText("Arztbrief"),
    ).toBeDefined();
    // Failed document must NOT appear
    expect(
      within(section as HTMLElement).queryByText("Fehlgeschlagenes Dokument"),
    ).toBeNull();
  });
});

describe("HomeClient — Layout", () => {
  it("renders all sections in the correct order", () => {
    render(<HomeClient {...defaultProps} />);
    const sections = screen.getAllByTestId(/^home-section-/);
    const sectionIds = sections.map((s) => s.getAttribute("data-testid"));
    expect(sectionIds).toEqual([
      "home-section-aufgaben",
      "home-section-review-docs",
      "home-section-recent-docs",
    ]);
  });
});

describe("HomeClient — Task Interaction", () => {
  it("marks a task as done from the home dashboard", async () => {
    render(<HomeClient {...defaultProps} />);

    // Click the checkbox for the first task in "Heute wichtig"
    const checkboxes = screen.getAllByTestId("task-checkbox");
    expect(checkboxes.length).toBeGreaterThan(0);
    fireEvent.click(checkboxes[0]);

    // The update should have been called with status "done"
    expect(mockUpdate).toHaveBeenCalledWith({ status: "done" });
  });

  it("shows a success toast immediately when a task is marked done", () => {
    render(<HomeClient {...defaultProps} />);
    const checkboxes = screen.getAllByTestId("task-checkbox");
    fireEvent.click(checkboxes[0]);
    expect(toast.success).toHaveBeenCalledWith("Erledigt — gut gemacht!");
  });
});

describe("HomeClient — Bento stat tiles", () => {
  it("shows both the Aufgaben stat tile and the Scan tile when there are open tasks", () => {
    render(<HomeClient {...defaultProps} />);
    const statTile = screen.getByTestId("home-stat-tasks");
    expect(within(statTile).getByText("3")).toBeDefined();
    expect(within(statTile).getByText("Aufgaben offen")).toBeDefined();
    expect(screen.getByTestId("home-stat-scan")).toBeDefined();
  });

  it("shows both stat tiles with a calm zero-state when there are no open tasks", () => {
    render(<HomeClient {...defaultProps} upcomingTasks={[]} />);
    const statTile = screen.getByTestId("home-stat-tasks");
    expect(within(statTile).getByText("0")).toBeDefined();
    expect(within(statTile).getByText("Keine Aufgaben offen")).toBeDefined();
    expect(screen.getByTestId("home-stat-scan")).toBeDefined();
  });

  it("Scan tile opens the scan wizard overlay", async () => {
    render(<HomeClient {...defaultProps} />);
    fireEvent.click(screen.getByTestId("home-stat-scan"));
    await waitFor(() => {
      expect(screen.getByTestId("scan-wizard")).toBeDefined();
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

describe("HomeClient — BentoDocTile status", () => {
  it("does not show a status dot/label in 'Zum Durchsehen' (status is always 'analyzed')", () => {
    render(<HomeClient {...defaultProps} />);
    const section = screen
      .getByText("Zum Durchsehen")
      .closest("[data-testid='home-section-review-docs']") as HTMLElement;
    expect(within(section).queryByText("Bereit zum Durchsehen")).toBeNull();
  });

  it("shows a visible status label alongside the dot in 'Zuletzt gescannt'", () => {
    render(<HomeClient {...defaultProps} />);
    const section = screen
      .getByText("Zuletzt gescannt")
      .closest("[data-testid='home-section-recent-docs']") as HTMLElement;
    expect(
      within(section).getAllByText("Im Familienbuch").length,
    ).toBeGreaterThan(0);
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
  });
});

describe("HomeClient — Empty State Scan CTA", () => {
  it("scan CTA in 'Zuletzt gescannt' empty state opens the scan wizard", async () => {
    render(
      <HomeClient
        {...defaultProps}
        recentDocuments={[]}
      />,
    );
    const section = screen
      .getByText("Zuletzt gescannt")
      .closest("[data-testid='home-section-recent-docs']");
    const cta = within(section as HTMLElement).getByRole("button", {
      name: "Dokument scannen",
    });
    fireEvent.click(cta);
    await waitFor(() => {
      expect(screen.getByTestId("scan-wizard")).toBeDefined();
    });
  });

  it("scan CTA in 'Zum Durchsehen' empty state opens the scan wizard", async () => {
    render(
      <HomeClient
        {...defaultProps}
        analyzedDocuments={[]}
      />,
    );
    const section = screen
      .getByText("Zum Durchsehen")
      .closest("[data-testid='home-section-review-docs']");
    const cta = within(section as HTMLElement).getByRole("button", {
      name: "Dokument scannen",
    });
    fireEvent.click(cta);
    await waitFor(() => {
      expect(screen.getByTestId("scan-wizard")).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

// (within from @testing-library/react is used directly in tests above)
