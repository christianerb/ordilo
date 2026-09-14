import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/actions/result", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/actions/result")>();
  return { ...actual, getUserFamily: vi.fn() };
});

import { getUserFamily } from "@/lib/actions/result";
import { exportFamilyData } from "@/lib/account/export-family-data";
import { createClient } from "@/lib/supabase/server";

type TableValue = Record<string, unknown> | Record<string, unknown>[];

function project(value: TableValue, columns: string): TableValue {
  const names = columns.split(",").map((column) => column.trim());
  const projectRow = (row: Record<string, unknown>) =>
    Object.fromEntries(names.map((name) => [name, row[name]]));
  return Array.isArray(value) ? value.map(projectRow) : projectRow(value);
}

function mockClient(values: Record<string, TableValue>) {
  const selected = new Map<string, string>();
  const ranges = new Map<string, Array<[number, number]>>();
  const from = vi.fn((table: string) => ({
    select: vi.fn((columns: string) => {
      selected.set(table, columns);
      let value = project(values[table] ?? [], columns);
      const result = () => ({ data: value, error: null });
      const chain = {
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range: vi.fn(async (from: number, to: number) => {
          ranges.set(table, [...(ranges.get(table) ?? []), [from, to]]);
          return {
            data: Array.isArray(value) ? value.slice(from, to + 1) : value,
            error: null,
          };
        }),
        single: vi.fn(async () => result()),
        maybeSingle: vi.fn(async () => {
          if (Array.isArray(value)) value = value[0] ?? {};
          return result();
        }),
        then: (
          resolve: (result: { data: TableValue; error: null }) => unknown,
        ) => Promise.resolve(result()).then(resolve),
      };
      return chain;
    }),
  }));
  return { client: { from }, selected, ranges };
}

const USER = {
  id: "user-1",
  email: "familie@example.test",
  created_at: "2026-08-01T10:00:00.000Z",
  last_sign_in_at: "2026-09-08T09:00:00.000Z",
} as User;

describe("exportFamilyData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports portable family content without storage paths or secret fields", async () => {
    vi.mocked(getUserFamily).mockResolvedValue({
      data: {
        id: "family-1",
        name: "Familie Beispiel",
        onboarding_completed_at: "2026-08-02T10:00:00.000Z",
        isOwner: true,
        introSeenAt: null,
      },
      error: null,
    });
    const { client, selected } = mockClient({
      families: {
        id: "family-1",
        name: "Familie Beispiel",
        created_at: "2026-08-01T10:00:00.000Z",
        onboarding_completed_at: "2026-08-02T10:00:00.000Z",
        created_by: "should-not-export",
      },
      family_memberships: {
        role: "owner",
        created_at: "2026-08-01T10:00:00.000Z",
        intro_seen_at: null,
        user_id: "should-not-export",
      },
      documents: [
        {
          id: "document-1",
          title: "Schulbrief",
          ocr_text: "Elternabend am Dienstag",
          file_url: "family-1/private.pdf",
          secret: "encrypted-envelope",
          upload_key: "private-upload-key",
        },
      ],
      document_pages: [
        {
          id: "page-1",
          document_id: "document-1",
          page_number: 1,
          ocr_markdown: "Elternabend am Dienstag",
          image_url: "family-1/private-page.jpg",
        },
      ],
      tasks: [{ id: "task-1", title: "Antwort abgeben" }],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await exportFamilyData(USER);
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      format: "ordilo-data-export",
      formatVersion: 1,
      account: { id: USER.id, email: USER.email },
      family: {
        id: "family-1",
        name: "Familie Beispiel",
        currentAccountRole: "owner",
      },
      contents: {
        documents: [
          {
            id: "document-1",
            title: "Schulbrief",
            ocr_text: "Elternabend am Dienstag",
          },
        ],
        documentPages: [
          {
            id: "page-1",
            document_id: "document-1",
            page_number: 1,
            ocr_markdown: "Elternabend am Dienstag",
          },
        ],
        tasks: [{ id: "task-1", title: "Antwort abgeben" }],
      },
      files: { included: false },
    });
    expect(serialized).not.toContain("private.pdf");
    expect(serialized).not.toContain("private-page.jpg");
    expect(serialized).not.toContain("encrypted-envelope");
    expect(serialized).not.toContain("private-upload-key");
    expect(selected.get("documents")).not.toMatch(
      /\b(file_url|secret|upload_key)\b/,
    );
    expect(selected.get("document_pages")).not.toMatch(/\bimage_url\b/);
  });

  it("returns only account data when the user has no family", async () => {
    vi.mocked(getUserFamily).mockResolvedValue({ data: null, error: null });
    const { client } = mockClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await exportFamilyData(USER);

    expect(result.family).toBeNull();
    expect(result.contents).toEqual({});
    expect(client.from).not.toHaveBeenCalled();
  });

  it("paginates large tables instead of silently truncating the export", async () => {
    vi.mocked(getUserFamily).mockResolvedValue({
      data: {
        id: "family-1",
        name: "Familie Beispiel",
        onboarding_completed_at: null,
        isOwner: true,
        introSeenAt: null,
      },
      error: null,
    });
    const tasks = Array.from({ length: 501 }, (_, index) => ({
      id: `task-${index.toString().padStart(3, "0")}`,
      title: `Aufgabe ${index}`,
    }));
    const { client, ranges } = mockClient({
      families: {
        id: "family-1",
        name: "Familie Beispiel",
        created_at: "2026-08-01T10:00:00.000Z",
        onboarding_completed_at: null,
      },
      family_memberships: {
        role: "owner",
        created_at: "2026-08-01T10:00:00.000Z",
        intro_seen_at: null,
      },
      tasks,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await exportFamilyData(USER);

    expect(result.contents.tasks).toHaveLength(501);
    expect(ranges.get("tasks")).toEqual([
      [0, 499],
      [500, 999],
    ]);
  });

  it("fails instead of returning a partial export after a read error", async () => {
    vi.mocked(getUserFamily).mockResolvedValue({
      data: {
        id: "family-1",
        name: "Familie Beispiel",
        onboarding_completed_at: null,
        isOwner: false,
        introSeenAt: null,
      },
      error: null,
    });
    const { client } = mockClient({});
    client.from = vi.fn(() => ({
      select: vi.fn(() => {
        const failed = {
          eq: vi.fn(() => failed),
          in: vi.fn(() => failed),
          order: vi.fn(() => failed),
          range: vi.fn(async () => ({
            data: null,
            error: new Error("db"),
          })),
          single: vi.fn(async () => ({ data: null, error: new Error("db") })),
          maybeSingle: vi.fn(async () => ({
            data: null,
            error: new Error("db"),
          })),
          then: (
            resolve: (result: { data: null; error: Error }) => unknown,
          ) =>
            Promise.resolve({ data: null, error: new Error("db") }).then(
              resolve,
            ),
        };
        return failed;
      }),
    })) as never;
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(exportFamilyData(USER)).rejects.toThrow(
      "Etwas ist schiefgelaufen",
    );
  });
});
