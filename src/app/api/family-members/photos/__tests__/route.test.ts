import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase clients before importing the route.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createClient: vi.fn(),
}));

import { GET } from "@/app/api/family-members/photos/route";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";

const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

function createPhotosRequest(query = `family_id=${FAMILY_ID}`): Request {
  return new Request(`https://example.com/api/family-members/photos?${query}`);
}

function mockServerClient({
  user = { id: "user-1" } as { id: string } | null,
  members = [] as { id: string; photo_url: string | null }[],
  error = null as unknown,
} = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      if (table === "family_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: members, error }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as Awaited<ReturnType<typeof createServerClient>>;
}

function mockAdminClient(signedUrls: { path: string; signedUrl: string | null }[] = []) {
  const createSignedUrlsMock = vi.fn().mockResolvedValue({
    data: signedUrls,
    error: null,
  });
  return {
    storage: {
      from: vi.fn(() => ({ createSignedUrls: createSignedUrlsMock })),
    },
    __createSignedUrls: createSignedUrlsMock,
  } as unknown as ReturnType<typeof createAdminClient> & {
    __createSignedUrls: ReturnType<typeof vi.fn>;
  };
}

describe("GET /api/family-members/photos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ user: null }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const response = await GET(createPhotosRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHENTICATED");
  });

  it("returns 400 when family_id is missing", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient(),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const response = await GET(createPhotosRequest(""));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("MISSING_FAMILY_ID");
  });

  it("returns 500 when the member query fails", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ error: new Error("query failed") }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const response = await GET(createPhotosRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("QUERY_FAILED");
  });

  it("returns an empty map when no member has a photo", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        members: [
          { id: "member-1", photo_url: null },
          { id: "member-2", photo_url: null },
        ],
      }),
    );
    const admin = mockAdminClient();
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    const response = await GET(createPhotosRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.urls).toEqual({});
    expect(admin.__createSignedUrls).not.toHaveBeenCalled();
  });

  it("returns signed URLs keyed by member id for members with a photo", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        members: [
          { id: "member-1", photo_url: "family/member-1/photo.jpg" },
          { id: "member-2", photo_url: null },
        ],
      }),
    );
    const admin = mockAdminClient([
      { path: "family/member-1/photo.jpg", signedUrl: "https://cdn.example.com/1.jpg" },
    ]);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    const response = await GET(createPhotosRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.urls).toEqual({ "member-1": "https://cdn.example.com/1.jpg" });
  });
});
