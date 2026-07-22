import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createClient: vi.fn(),
}));

import { POST } from "@/app/api/documents/[id]/source/route";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";

const DOCUMENT_ID = "550e8400-e29b-41d4-a716-446655440000";

function params(id: string = DOCUMENT_ID) {
  return { params: Promise.resolve({ id }) };
}

function mockServerClient({
  user = { id: "user-1" },
  pages = [],
}: {
  user?: { id: string } | null;
  pages?: { page_number: number; layout_json: unknown }[];
} = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      if (table === "documents") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: DOCUMENT_ID, file_url: "family/file.jpg" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "document_pages") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: pages, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

function mockAdminClient() {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: DOCUMENT_ID } }),
        }),
      }),
    })),
  };
}

describe("POST /api/documents/[id]/source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a normalized OCR location for one uniquely matched value", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({
        pages: [
          {
            page_number: 1,
            layout_json: {
              bbox: [0, 0, 220, 120],
              children: [
                {
                  html: "<p>Familieneigenanteil 11,00 Euro</p>",
                  bbox: [10, 20, 210, 60],
                },
                {
                  html: "<p>Weitere Angaben</p>",
                  bbox: [10, 80, 210, 120],
                },
              ],
            },
          },
        ],
      }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient(),
    );

    const response = await POST(
      new Request(`http://localhost/api/documents/${DOCUMENT_ID}/source`, {
        method: "POST",
        body: JSON.stringify({ text: "11,00 Euro" }),
      }),
      params(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      location: {
        pageNumber: 1,
        bounds: {
          left: 0.045454545454545456,
          top: 0.16666666666666666,
          width: 0.9090909090909091,
          height: 0.3333333333333333,
        },
      },
    });
  });

  it("returns 401 without a session", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ user: null }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient(),
    );

    const response = await POST(
      new Request(`http://localhost/api/documents/${DOCUMENT_ID}/source`, {
        method: "POST",
        body: JSON.stringify({ text: "11" }),
      }),
      params(),
    );

    expect(response.status).toBe(401);
  });
});
