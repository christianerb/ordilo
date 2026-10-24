import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/jobs", () => ({
  enqueueJob: vi.fn(async () => false),
  runPendingJobs: vi.fn(),
}));
vi.mock("@/lib/billing/quota", () => ({
  billingEntitlementsEnabled: vi.fn(() => false),
  reserveMonthlyUsage: vi.fn(),
  releaseMonthlyUsage: vi.fn(),
}));
vi.mock("@/lib/ai/consent", () => ({
  refuseWithoutAiConsent: vi.fn(async () => null),
}));

import { POST as finalizeUpload } from "@/app/api/documents/upload/route";
import { POST as createUploadUrl } from "@/app/api/documents/upload-url/route";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { documentIdForUploadKey } from "@/lib/api/storage";

const FAMILY_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "user-1";
const UPLOAD_KEY = "scan-key-12345";
const DOCUMENT_ID = documentIdForUploadKey(FAMILY_ID, USER_ID, UPLOAD_KEY);
const STORAGE_PATH = `${FAMILY_ID}/${DOCUMENT_ID}/Scan.pdf`;
const MB = 1024 * 1024;

function mockServerClient(options: { family?: { id: string } | null } = {}) {
  const family = "family" in options ? options.family : { id: FAMILY_ID };
  const insert = vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: DOCUMENT_ID }, error: null }),
  }));
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID, email: "test@ordilo.test" } },
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "families") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: family, error: null }),
          })),
        };
      }
      if (table === "documents") {
        return {
          insert,
          select: vi.fn(() => ({
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            gte: vi.fn().mockResolvedValue({ count: 0, data: null }),
          })),
        };
      }
      if (table === "product_events") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  return { client, insert };
}

function mockAdminClient(stored: Blob | null) {
  const storage = {
    exists: vi.fn().mockResolvedValue({ data: stored !== null, error: null }),
    upload: vi.fn(),
    remove: vi.fn().mockResolvedValue({ data: [], error: null }),
    download: vi.fn().mockResolvedValue(
      stored ? { data: stored, error: null } : { data: null, error: { message: "not found" } },
    ),
    createSignedUploadUrl: vi.fn().mockResolvedValue({
      data: { signedUrl: "https://storage.example/upload?token=abc", path: STORAGE_PATH, token: "abc" },
      error: null,
    }),
  };
  return { client: { storage: { from: vi.fn(() => storage) } }, storage };
}

function pdfBlob(size: number): Blob {
  const bytes = new Uint8Array(size);
  bytes.set([0x25, 0x50, 0x44, 0x46]);
  return new Blob([bytes], { type: "application/pdf" });
}

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify(body),
  });
}

const directBody = {
  family_id: FAMILY_ID,
  upload_key: UPLOAD_KEY,
  filename: "Scan.pdf",
  mime_type: "application/pdf",
  client: "mobile_scan",
};

function setup(stored: Blob | null, family?: { id: string } | null) {
  const server = mockServerClient(family === undefined ? {} : { family });
  const admin = mockAdminClient(stored);
  vi.mocked(createServerClient).mockResolvedValue(
    server.client as unknown as Awaited<ReturnType<typeof createServerClient>>,
  );
  vi.mocked(createAdminClient).mockReturnValue(
    admin.client as unknown as ReturnType<typeof createAdminClient>,
  );
  return { server, admin };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/documents/upload-url", () => {
  it("hands out a signed URL for the key's own Storage slot", async () => {
    const { admin } = setup(null);

    const response = await createUploadUrl(jsonRequest({ ...directBody, size: 12 * MB }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      signed_url: "https://storage.example/upload?token=abc",
      storage_path: STORAGE_PATH,
    });
    expect(admin.storage.createSignedUploadUrl).toHaveBeenCalledWith(STORAGE_PATH, { upsert: false });
  });

  it("never hands out a URL that could overwrite an already stored file", async () => {
    const { admin } = setup(pdfBlob(1024));

    const response = await createUploadUrl(jsonRequest(directBody));

    expect(await response.json()).toEqual({ storage_path: STORAGE_PATH, already_uploaded: true });
    expect(admin.storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects files above 20 MB before any upload", async () => {
    const { admin } = setup(null);

    const response = await createUploadUrl(jsonRequest({ ...directBody, size: 21 * MB }));

    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe("FILE_TOO_LARGE");
    expect(admin.storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses families the user does not belong to", async () => {
    const { admin } = setup(null, null);

    const response = await createUploadUrl(jsonRequest(directBody));

    expect(response.status).toBe(403);
    expect(admin.storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("requires an upload key so retries reuse the same slot", async () => {
    setup(null);
    const response = await createUploadUrl(
      jsonRequest({ ...directBody, upload_key: undefined }),
    );

    expect(response.status).toBe(400);
  });
});

describe("POST /api/documents/upload (direct finalize)", () => {
  it("accepts a stored 12 MB scan without re-uploading it", async () => {
    const { server, admin } = setup(pdfBlob(12 * MB));

    const response = await finalizeUpload(jsonRequest(directBody));

    expect(response.status).toBe(200);
    expect((await response.json()).document_id).toBe(DOCUMENT_ID);
    expect(admin.storage.download).toHaveBeenCalledWith(STORAGE_PATH);
    expect(admin.storage.upload).not.toHaveBeenCalled();
    expect(server.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: DOCUMENT_ID,
        file_url: STORAGE_PATH,
        original_filename: "Scan.pdf",
        mime_type: "application/pdf",
        upload_key: UPLOAD_KEY,
      }),
    );
  });

  it("asks for a retry when the file has not arrived in Storage", async () => {
    const { server } = setup(null);

    const response = await finalizeUpload(jsonRequest(directBody));

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("UPLOAD_NOT_FOUND");
    expect(server.insert).not.toHaveBeenCalled();
  });

  it("removes a stored file whose bytes do not match its type", async () => {
    const { server, admin } = setup(new Blob(["not a pdf at all"]));

    const response = await finalizeUpload(jsonRequest(directBody));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("FILE_SIGNATURE_MISMATCH");
    expect(admin.storage.remove).toHaveBeenCalledWith([STORAGE_PATH]);
    expect(server.insert).not.toHaveBeenCalled();
  });

  it("enforces the 20 MB limit on the stored bytes, not the claimed size", async () => {
    const { admin } = setup(pdfBlob(21 * MB));

    const response = await finalizeUpload(jsonRequest({ ...directBody, size: 1 }));

    expect(response.status).toBe(413);
    expect(admin.storage.remove).toHaveBeenCalledWith([STORAGE_PATH]);
  });

  it("never reads Storage for a family the user does not belong to", async () => {
    const { admin } = setup(pdfBlob(MB), null);

    const response = await finalizeUpload(jsonRequest(directBody));

    expect(response.status).toBe(403);
    expect(admin.storage.download).not.toHaveBeenCalled();
  });
});
