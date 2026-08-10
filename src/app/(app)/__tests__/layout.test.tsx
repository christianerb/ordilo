import { describe, it, expect, vi, beforeEach } from "vitest";

// The server layout fetches the sidebar profile + collections and hands
// them to the AppShell as props. Mock the Supabase server module and the
// AppShell (a heavy client component) so we can inspect the props the
// layout passes down — the returned JSX element carries them directly.

const mockGetMiddlewareFamily = vi.fn();
const mockGetMiddlewareUserEmail = vi.fn();
const mockAuthGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
  getMiddlewareFamily: () => mockGetMiddlewareFamily(),
  getMiddlewareUserEmail: () => mockGetMiddlewareUserEmail(),
}));

vi.mock("@/components/ordilo/app-shell", () => ({
  AppShell: vi.fn(),
}));

vi.mock("@/lib/ai/chat-history", () => ({
  listConversations: vi.fn().mockResolvedValue([]),
}));

import AppLayout from "@/app/(app)/layout";

interface AppShellProps {
  profile?: { familyName: string; email: string | null };
  initialCollections?: { id: string; name: string; icon: string | null; color: string | null }[];
  familyId?: string | null;
  children?: React.ReactNode;
}

/** Render the async layout and return the props passed to <AppShell>. */
async function renderLayout(): Promise<AppShellProps> {
  const element = await AppLayout({ children: null });
  return element.props as AppShellProps;
}

/** Configure the from() mock for the families + collections queries. */
function mockTables(options: {
  family?: { id: string; name: string } | null;
  collections?: { id: string; name: string; icon: string; color: string }[];
}) {
  const { family = null, collections = [] } = options;
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
      return {
        select: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({ data: collections, error: null }),
        })),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("AppLayout (server-provided shell data)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthGetUser.mockResolvedValue({
      data: { user: { email: "anna@example.com" } },
    });
  });

  it("builds the profile from middleware headers without any auth/families round-trip", async () => {
    mockGetMiddlewareFamily.mockResolvedValue({ id: "fam-1", name: "Familie Müller" });
    mockGetMiddlewareUserEmail.mockResolvedValue("anna@example.com");
    mockTables({
      collections: [{ id: "col-1", name: "Rechnungen", icon: "receipt", color: "petrol" }],
    });

    const props = await renderLayout();

    expect(props.profile).toEqual({
      familyName: "Familie Müller",
      email: "anna@example.com",
    });
    expect(props.familyId).toBe("fam-1");
    expect(props.initialCollections).toEqual([
      { id: "col-1", name: "Rechnungen", icon: "receipt", color: "petrol" },
    ]);
    // The middleware already resolved user + family — no fallback queries.
    expect(mockAuthGetUser).not.toHaveBeenCalled();
    expect(mockFrom.mock.calls.map((c) => c[0])).not.toContain("families");
  });

  it("falls back to its own queries when the middleware forwarded nothing (RSC refresh)", async () => {
    mockGetMiddlewareFamily.mockResolvedValue(null);
    mockGetMiddlewareUserEmail.mockResolvedValue(null);
    mockTables({
      family: { id: "fam-1", name: "Familie Fallback" },
      collections: [],
    });

    const props = await renderLayout();

    expect(mockAuthGetUser).toHaveBeenCalled();
    expect(props.profile).toEqual({
      familyName: "Familie Fallback",
      email: "anna@example.com",
    });
    expect(props.initialCollections).toEqual([]);
  });

  it("passes no profile and skips the collections query when there is no family", async () => {
    mockGetMiddlewareFamily.mockResolvedValue(null);
    mockGetMiddlewareUserEmail.mockResolvedValue(null);
    mockTables({ family: null });

    const props = await renderLayout();

    expect(props.profile).toBeUndefined();
    // Empty array (not undefined) so the shell stays in server-data mode.
    expect(props.initialCollections).toEqual([]);
    expect(mockFrom.mock.calls.map((c) => c[0])).not.toContain("collections");
  });
});
