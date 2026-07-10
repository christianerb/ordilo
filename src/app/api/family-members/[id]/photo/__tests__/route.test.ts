import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase clients before importing the route.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createClient: vi.fn(),
}));

import { POST, DELETE } from "@/app/api/family-members/[id]/photo/route";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { MAX_AVATAR_FILE_SIZE } from "@/lib/schemas/avatar";

const MEMBER_ID = "550e8400-e29b-41d4-a716-446655440000";
const FAMILY_ID = "660e8400-e29b-41d4-a716-446655440001";

function createParams(id: string = MEMBER_ID) {
  return { params: Promise.resolve({ id }) };
}

/**
 * Mock the RLS-scoped server client used by `requireUser` (auth) and by
 * the route's own member lookup / photo_url update.
 */
function mockServerClient({
  user = { id: "user-1" },
  member = { id: MEMBER_ID, family_id: FAMILY_ID, photo_url: null as string | null },
  memberError = null as unknown,
  updateError = null as unknown,
}: {
  user?: { id: string } | null;
  member?: { id: string; family_id: string; photo_url: string | null } | null;
  memberError?: unknown;
  updateError?: unknown;
} = {}) {
  const updateEq = vi.fn().mockResolvedValue({ error: updateError });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      if (table === "family_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: member, error: memberError }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: updateEq }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    __updateEq: updateEq,
  } as unknown as Awaited<ReturnType<typeof createServerClient>> & {
    __updateEq: ReturnType<typeof vi.fn>;
  };
}

/**
 * Mock the admin (service-role) client — storage upload/remove/signed URL.
 */
function mockAdminClient({
  uploadError = null as unknown,
  removeError = null as unknown,
  signedUrl = "https://storage.example.com/signed-url" as string | null,
  signError = null as unknown,
} = {}) {
  const uploadMock = vi
    .fn()
    .mockResolvedValue({ data: { path: "some/path" }, error: uploadError });
  const removeMock = vi.fn().mockResolvedValue({ data: [], error: removeError });
  const createSignedUrlMock = vi.fn().mockResolvedValue(
    signError ? { data: null, error: signError } : { data: { signedUrl }, error: null },
  );

  return {
    storage: {
      from: vi.fn(() => ({
        upload: uploadMock,
        remove: removeMock,
        createSignedUrl: createSignedUrlMock,
      })),
    },
    __upload: uploadMock,
    __remove: removeMock,
    __createSignedUrl: createSignedUrlMock,
  } as unknown as ReturnType<typeof createAdminClient> & {
    __upload: ReturnType<typeof vi.fn>;
    __remove: ReturnType<typeof vi.fn>;
    __createSignedUrl: ReturnType<typeof vi.fn>;
  };
}

const MAGIC_BYTES: Record<string, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/webp": [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x10, 0x00, 0x57, 0x45, 0x42, 0x50],
};

function createMockFile(name: string, type: string, size: number = 1024): File {
  const magic = MAGIC_BYTES[type] ?? [];
  const content = new Uint8Array(Math.max(size, magic.length));
  content.set(magic);
  return new File([content], name, { type });
}

function createPhotoRequest(file: File | null): Request {
  const formData = new FormData();
  if (file) formData.append("file", file);
  return {
    method: "POST",
    formData: async () => formData,
  } as unknown as Request;
}

describe("POST /api/family-members/[id]/photo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ user: null }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const file = createMockFile("photo.jpg", "image/jpeg");
    const response = await POST(createPhotoRequest(file), createParams());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHENTICATED");
  });

  it("returns 404 when the member does not exist or belongs to another family", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ member: null }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const file = createMockFile("photo.jpg", "image/jpeg");
    const response = await POST(createPhotoRequest(file), createParams());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe("MEMBER_NOT_FOUND");
  });

  it("returns 400 when no file is provided", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient(),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const response = await POST(createPhotoRequest(null), createParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("NO_FILE");
  });

  it("returns 400 for an unsupported file type", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient(),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const file = createMockFile("photo.pdf", "application/pdf");
    const response = await POST(createPhotoRequest(file), createParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("returns 413 when the file exceeds the size limit", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient(),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const file = createMockFile("photo.jpg", "image/jpeg", MAX_AVATAR_FILE_SIZE + 1);
    const response = await POST(createPhotoRequest(file), createParams());
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.code).toBe("FILE_TOO_LARGE");
  });

  it("returns 400 when the file content does not match its declared type", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient(),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const file = new File([new Uint8Array([0, 0, 0, 0])], "photo.jpg", {
      type: "image/jpeg",
    });
    const response = await POST(createPhotoRequest(file), createParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("FILE_SIGNATURE_MISMATCH");
  });

  it("returns 500 when the storage upload fails", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient(),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({ uploadError: new Error("upload failed") }),
    );

    const file = createMockFile("photo.jpg", "image/jpeg");
    const response = await POST(createPhotoRequest(file), createParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("STORAGE_UPLOAD_FAILED");
  });

  it("returns 500 and cleans up the uploaded object when the DB update fails", async () => {
    const server = mockServerClient({ updateError: new Error("db error") });
    const admin = mockAdminClient();
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(server);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    const file = createMockFile("photo.jpg", "image/jpeg");
    const response = await POST(createPhotoRequest(file), createParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("DB_UPDATE_FAILED");
    expect(admin.__remove).toHaveBeenCalled();
  });

  it("uploads the photo, replaces the old one, and returns a signed URL", async () => {
    const server = mockServerClient({
      member: { id: MEMBER_ID, family_id: FAMILY_ID, photo_url: "old/path.jpg" },
    });
    const admin = mockAdminClient({ signedUrl: "https://cdn.example.com/new.jpg" });
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(server);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    const file = createMockFile("photo.jpg", "image/jpeg");
    const response = await POST(createPhotoRequest(file), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe("https://cdn.example.com/new.jpg");
    expect(admin.__remove).toHaveBeenCalledWith(["old/path.jpg"]);
  });

  it("returns 500 when the signed URL cannot be created", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient(),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAdminClient({ signError: new Error("sign error") }),
    );

    const file = createMockFile("photo.jpg", "image/jpeg");
    const response = await POST(createPhotoRequest(file), createParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("SIGNED_URL_FAILED");
  });
});

describe("DELETE /api/family-members/[id]/photo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ user: null }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const response = await DELETE(createPhotoRequest(null), createParams());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHENTICATED");
  });

  it("returns 404 when the member does not exist or belongs to another family", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ member: null }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const response = await DELETE(createPhotoRequest(null), createParams());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe("MEMBER_NOT_FOUND");
  });

  it("clears photo_url and removes the storage object when a photo exists", async () => {
    const server = mockServerClient({
      member: { id: MEMBER_ID, family_id: FAMILY_ID, photo_url: "some/path.jpg" },
    });
    const admin = mockAdminClient();
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(server);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    const response = await DELETE(createPhotoRequest(null), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(admin.__remove).toHaveBeenCalledWith(["some/path.jpg"]);
  });

  it("clears photo_url without touching storage when there is no existing photo", async () => {
    const server = mockServerClient({
      member: { id: MEMBER_ID, family_id: FAMILY_ID, photo_url: null },
    });
    const admin = mockAdminClient();
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(server);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);

    const response = await DELETE(createPhotoRequest(null), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(admin.__remove).not.toHaveBeenCalled();
  });

  it("returns 500 on a database update failure", async () => {
    (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockServerClient({ updateError: new Error("db error") }),
    );
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient());

    const response = await DELETE(createPhotoRequest(null), createParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("DB_UPDATE_FAILED");
  });
});
