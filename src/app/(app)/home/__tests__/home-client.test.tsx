import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
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
    summary: "Elternabend am 12.07. und neues Essensgeld",
  },
  {
    id: "doc-2",
    title: "Stromrechnung Juli",
    original_filename: "strom.pdf",
    mime_type: "application/pdf",
    status: "analyzed",
    created_at: "2026-07-05T14:00:00Z",
    summary: null,
  },
];

const upcomingTasks: HomeTask[] = [
  {
    id: "task-1",
    family_id: "fam-1",
    title: "Rechnung bezahlen",
    description: null,
    due_date: "2026-07-07",
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
    summary: "Blutwerte unauffällig, Kontrolle in 6 Monaten",
  },
  {
    id: "doc-4",
    title: "Versicherungsschreiben",
    original_filename: "vers.pdf",
    mime_type: "application/pdf",
    status: "confirmed",
    created_at: "2026-07-04T09:00:00Z",
    summary: null,
  },
];

const defaultProps: HomeClientProps = {
  familyId: "family-1",
  greeting: "Guten Abend",
  familyName: "Familie Erb",
  members,
  analyzedDocuments,
  unconfirmedDocCount: 2,
  journalDocCount: 6,
  confirmedDocumentCount: 2,
  upcomingTasks,
  recentDocuments,
  thumbUrls: {},
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

  it("keeps the greeting free of repeated facts", () => {
    render(<HomeClient {...defaultProps} />);
    // The briefing sentence was cut in the distill pass: the hero card and
    // the journal header already carry the overdue task and the waiting
    // documents — a third telling is noise, not warmth.
    expect(screen.queryByTestId("home-briefing")).toBeNull();
  });

  it("dates the day like a journal entry", () => {
    render(<HomeClient {...defaultProps} />);
    // System time is 2026-07-06 — the dateline anchors the day (weekday
    // varies with the runner's timezone, so assert day + month only).
    expect(screen.getByTestId("home-dateline").textContent).toMatch(
      /6\. Juli/,
    );
  });

  it("groups the greeting and the immediate priority in one card", () => {
    render(<HomeClient {...defaultProps} />);
    const card = screen.getByTestId("home-priority-card");
    expect(within(card).getByTestId("today-hero")).toBeDefined();
    expect(within(card).getByText("Familie Erb")).toBeDefined();
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

  it("marks the hero task as done via the hero action", () => {
    render(<HomeClient {...defaultProps} />);
    fireEvent.click(screen.getByTestId("today-hero-done"));
    expect(mockUpdate).toHaveBeenCalledWith({ status: "done" });
    // No toast on hero completions — the Erledigt beat in the card is the
    // confirmation; a toast on top would be the same signal twice.
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("holds an Erledigt beat before the next hero arrives", () => {
    render(<HomeClient {...defaultProps} />);
    fireEvent.click(screen.getByTestId("today-hero-done"));
    // The completed hero stays visible for a moment: checked, struck
    // through, labelled — the save already fired (no fake delay).
    const button = screen.getByTestId("today-hero-done");
    expect(button.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("today-hero-label").textContent).toContain(
      "Erledigt",
    );
    // After the beat, the latch releases and the next hero renders.
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(
      screen.getByTestId("today-hero-label").textContent,
    ).not.toContain("Erledigt");
  });

  it("gives hero actions a one-thumb target", () => {
    render(<HomeClient {...defaultProps} />);
    const hero = screen.getByTestId("today-hero");
    // 48px circular hit area, generous for one-thumb use in the day card.
    expect(within(hero).getByTestId("today-hero-done").className).toContain(
      "size-12",
    );
    // Details stays a real deep link that opens the task on the board
    const details = within(hero).getByRole("link", { name: "Details" });
    expect(details.getAttribute("href")).toMatch(/^\/aufgaben\?task=.+/);
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

  it("shows only the three newest documents, then a Mehr anzeigen link", () => {
    render(<HomeClient {...defaultProps} />);
    const section = screen
      .getByText("Deine Dokumente")
      .closest("[data-testid='home-section-journal']") as HTMLElement;
    // 2 awaiting confirmation + 1 most recent confirmed = the 3-row cap.
    expect(within(section).getByText("Arztbrief")).toBeDefined();
    // The 4th document stays on /dokumente, reachable via the footer link.
    expect(within(section).queryByText("Versicherungsschreiben")).toBeNull();
    const moreLink = within(section).getByText("Mehr anzeigen");
    expect(moreLink.getAttribute("href")).toBe("/dokumente");
  });

  it("hides Mehr anzeigen when everything fits", () => {
    render(
      <HomeClient
        {...defaultProps}
        recentDocuments={[]}
        journalDocCount={2}
      />,
    );
    const section = screen
      .getByText("Deine Dokumente")
      .closest("[data-testid='home-section-journal']") as HTMLElement;
    expect(within(section).queryByText("Mehr anzeigen")).toBeNull();
  });

  it("shows the AI one-liner as the row subtitle", () => {
    render(<HomeClient {...defaultProps} />);
    const section = screen
      .getByText("Deine Dokumente")
      .closest("[data-testid='home-section-journal']") as HTMLElement;
    expect(
      within(section).getByText("Blutwerte unauffällig, Kontrolle in 6 Monaten"),
    ).toBeDefined();
    expect(
      within(section).getByText("Elternabend am 12.07. und neues Essensgeld"),
    ).toBeDefined();
  });

  it("shows the confirmation count as a compact journal header badge", () => {
    render(<HomeClient {...defaultProps} />);
    const section = screen
      .getByText("Deine Dokumente")
      .closest("[data-testid='home-section-journal']") as HTMLElement;
    // Unconfirmed docs exist → the compact badge leads with what needs attention.
    expect(
      within(section).getByText("2 warten auf dein OK"),
    ).toBeDefined();
  });

  it("reassures when nothing waits for confirmation", () => {
    render(
      <HomeClient
        {...defaultProps}
        analyzedDocuments={[]}
        unconfirmedDocCount={0}
      />,
    );
    const section = screen
      .getByText("Deine Dokumente")
      .closest("[data-testid='home-section-journal']") as HTMLElement;
    expect(
      within(section).getByText("6 Dokumente im Familienbuch"),
    ).toBeDefined();
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
            summary: null,
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
      "home-section-journal",
      "home-section-aufgaben",
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
    expect(within(memberList).getByText("+3")).toBeDefined();
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
