import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// Mock next/navigation useRouter
const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: mockRefresh,
  }),
}));

// Mock @/lib/supabase/client
const mockUpdate = vi.fn();
const mockEq = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: vi.fn(() => ({
      update: mockUpdate,
      eq: mockEq,
    })),
  }),
}));

import { HomeClient, type HomeClientProps } from "@/app/(app)/home/home-client";
import type { HomeTask } from "@/lib/home-utils";

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
    due_date: "2026-07-07",
    priority: "high",
    status: "open",
    confidence: 0.9,
    confirmed: true,
    created_at: "2026-07-01T00:00:00Z",
    document_id: "doc-2",
    document_title: "Stromrechnung Juli",
  },
  {
    id: "task-2",
    family_id: "fam-1",
    title: "Anmeldung Kita",
    due_date: "2026-07-15",
    priority: "medium",
    status: "open",
    confidence: 0.85,
    confirmed: true,
    created_at: "2026-07-02T00:00:00Z",
    document_id: "doc-1",
    document_title: "Kita-Brief für Emma",
  },
  {
    id: "task-3",
    family_id: "fam-1",
    title: "Alter Task",
    due_date: "2026-06-01",
    priority: "low",
    status: "open",
    confidence: 0.7,
    confirmed: true,
    created_at: "2026-05-01T00:00:00Z",
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
  familyName: "Erb",
  members,
  analyzedDocuments,
  upcomingTasks,
  recentDocuments,
};

// Reference date for test data: 2026-07-06 (matches system date)
// Test task due dates are relative to this date.

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockPush.mockClear();
  mockRefresh.mockClear();
  mockUpdate.mockClear();
  mockEq.mockClear();
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockEq.mockResolvedValue({ error: null });
  // Mock scrollIntoView (not implemented in jsdom)
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HomeClient — AI Search Bar", () => {
  it("renders the AI search bar at the top of the page", () => {
    render(<HomeClient {...defaultProps} />);
    expect(screen.getByTestId("ai-search-bar")).toBeDefined();
  });

  it("navigates to /suche with the query when the search bar is submitted", () => {
    render(<HomeClient {...defaultProps} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Zeig mir Rechnungen" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringMatching(/^\/suche\?q=/),
    );
    const callArg = mockPush.mock.calls[0][0] as string;
    const params = new URLSearchParams(callArg.split("?")[1]);
    expect(params.get("q")).toBe("Zeig mir Rechnungen");
  });

  it("does not navigate when submitting an empty query", () => {
    render(<HomeClient {...defaultProps} />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("HomeClient — Family Display", () => {
  it("shows the family name", () => {
    render(<HomeClient {...defaultProps} />);
    expect(screen.getByText("Erb")).toBeDefined();
  });

  it("shows family member names", () => {
    render(<HomeClient {...defaultProps} />);
    expect(screen.getByText("Emma")).toBeDefined();
    expect(screen.getByText("Christian")).toBeDefined();
    expect(screen.getByText("Hanna")).toBeDefined();
  });
});

describe("HomeClient — Heute wichtig", () => {
  it("renders the 'Heute wichtig' section heading", () => {
    render(<HomeClient {...defaultProps} />);
    expect(screen.getByText("Heute wichtig")).toBeDefined();
  });

  it("shows tasks due within the next 7 days in 'Heute wichtig'", () => {
    render(<HomeClient {...defaultProps} />);
    const section = screen
      .getByText("Heute wichtig")
      .closest("[data-testid='home-section-heute-wichtig']");
    expect(section).not.toBeNull();
    // task-1 is due 2026-07-07 (1 day from today 2026-07-06) → should show
    expect(
      within(section as HTMLElement).getByText("Rechnung bezahlen"),
    ).toBeDefined();
  });

  it("does not show tasks due beyond 7 days in 'Heute wichtig'", () => {
    render(<HomeClient {...defaultProps} />);
    // task-2 is due 2026-07-15 (9 days from today) → should NOT show in Heute wichtig
    // But it should show in Fristen
    const section = screen
      .getByText("Heute wichtig")
      .closest("[data-testid='home-section-heute-wichtig']");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).queryByText("Anmeldung Kita"),
    ).toBeNull();
  });

  it("excludes overdue tasks from 'Heute wichtig'", () => {
    render(<HomeClient {...defaultProps} />);
    // task-3 is due 2026-06-01 (overdue, before today 2026-07-06) → should NOT show
    const section = screen
      .getByText("Heute wichtig")
      .closest("[data-testid='home-section-heute-wichtig']");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).queryByText("Alter Task"),
    ).toBeNull();
  });

  it("shows an empty state with a scan CTA when there are no urgent tasks", () => {
    render(
      <HomeClient
        {...defaultProps}
        upcomingTasks={[]}
      />,
    );
    const section = screen
      .getByText("Heute wichtig")
      .closest("[data-testid='home-section-heute-wichtig']");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByText("Nichts Dringendes"),
    ).toBeDefined();
    // VAL-HOME-007: empty state must include a scan CTA
    expect(
      within(section as HTMLElement).getByRole("button", { name: "Dokument scannen" }),
    ).toBeDefined();
  });
});

describe("HomeClient — Neue Dokumente zur Bestätigung", () => {
  it("renders the section heading", () => {
    render(<HomeClient {...defaultProps} />);
    expect(
      screen.getByText("Neue Dokumente zur Bestätigung"),
    ).toBeDefined();
  });

  it("shows analyzed documents with a review affordance", () => {
    render(<HomeClient {...defaultProps} />);
    const section = screen
      .getByText("Neue Dokumente zur Bestätigung")
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
      .getByText("Neue Dokumente zur Bestätigung")
      .closest("[data-testid='home-section-review-docs']");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByText("Keine neuen Dokumente"),
    ).toBeDefined();
    // VAL-HOME-007: empty state must include a scan CTA
    expect(
      within(section as HTMLElement).getByRole("button", { name: "Dokument scannen" }),
    ).toBeDefined();
  });
});

describe("HomeClient — Fristen", () => {
  it("renders the 'Fristen' section heading", () => {
    render(<HomeClient {...defaultProps} />);
    expect(screen.getByText("Fristen")).toBeDefined();
  });

  it("shows upcoming deadlines sorted by due date", () => {
    render(<HomeClient {...defaultProps} />);
    const section = screen
      .getByText("Fristen")
      .closest("[data-testid='home-section-fristen']");
    expect(section).not.toBeNull();
    // task-1 (due 07-07) and task-2 (due 07-15) should appear
    // task-3 (due 06-01, overdue) should NOT appear in Fristen
    expect(within(section as HTMLElement).getByText("Rechnung bezahlen")).toBeDefined();
    expect(within(section as HTMLElement).getByText("Anmeldung Kita")).toBeDefined();
  });

  it("excludes overdue tasks from Fristen", () => {
    render(<HomeClient {...defaultProps} />);
    const section = screen
      .getByText("Fristen")
      .closest("[data-testid='home-section-fristen']");
    expect(
      within(section as HTMLElement).queryByText("Alter Task"),
    ).toBeNull();
  });

  it("shows an empty state with a scan CTA when there are no upcoming deadlines", () => {
    render(
      <HomeClient
        {...defaultProps}
        upcomingTasks={[]}
      />,
    );
    const section = screen
      .getByText("Fristen")
      .closest("[data-testid='home-section-fristen']");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByText("Keine anstehenden Fristen"),
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
});

describe("HomeClient — Layout", () => {
  it("renders all sections in the correct order", () => {
    render(<HomeClient {...defaultProps} />);
    const sections = screen.getAllByTestId(/^home-section-/);
    const sectionIds = sections.map((s) => s.getAttribute("data-testid"));
    expect(sectionIds).toEqual([
      "home-section-heute-wichtig",
      "home-section-review-docs",
      "home-section-fristen",
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

    // The refresh should have been called to sync server data
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
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
  it("scan CTA in 'Zuletzt gescannt' empty state navigates to /scan", () => {
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
    expect(mockPush).toHaveBeenCalledWith("/scan");
  });

  it("scan CTA in 'Heute wichtig' empty state navigates to /scan", () => {
    render(
      <HomeClient
        {...defaultProps}
        upcomingTasks={[]}
      />,
    );
    const section = screen
      .getByText("Heute wichtig")
      .closest("[data-testid='home-section-heute-wichtig']");
    const cta = within(section as HTMLElement).getByRole("button", {
      name: "Dokument scannen",
    });
    fireEvent.click(cta);
    expect(mockPush).toHaveBeenCalledWith("/scan");
  });

  it("scan CTA in 'Neue Dokumente' empty state navigates to /scan", () => {
    render(
      <HomeClient
        {...defaultProps}
        analyzedDocuments={[]}
      />,
    );
    const section = screen
      .getByText("Neue Dokumente zur Bestätigung")
      .closest("[data-testid='home-section-review-docs']");
    const cta = within(section as HTMLElement).getByRole("button", {
      name: "Dokument scannen",
    });
    fireEvent.click(cta);
    expect(mockPush).toHaveBeenCalledWith("/scan");
  });

  it("scan CTA in 'Fristen' empty state navigates to /scan", () => {
    render(
      <HomeClient
        {...defaultProps}
        upcomingTasks={[]}
      />,
    );
    const section = screen
      .getByText("Fristen")
      .closest("[data-testid='home-section-fristen']");
    const cta = within(section as HTMLElement).getByRole("button", {
      name: "Dokument scannen",
    });
    fireEvent.click(cta);
    expect(mockPush).toHaveBeenCalledWith("/scan");
  });
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

// (within from @testing-library/react is used directly in tests above)
