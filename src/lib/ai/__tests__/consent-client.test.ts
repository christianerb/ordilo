import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  AI_CONSENT_REQUIRED_CODE,
  fetchAiDataSharingStatus,
  isAiConsentRequiredBody,
  parseAiDataSharingStatus,
  recordAiDataSharingDecision,
} from "@/lib/ai/consent-client";

const mockFetch = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("parseAiDataSharingStatus", () => {
  it("accepts only the two recorded decisions", () => {
    expect(parseAiDataSharingStatus("granted")).toBe("granted");
    expect(parseAiDataSharingStatus("declined")).toBe("declined");
  });

  it("treats anything else as never asked", () => {
    expect(parseAiDataSharingStatus("maybe")).toBeNull();
    expect(parseAiDataSharingStatus(undefined)).toBeNull();
    expect(parseAiDataSharingStatus(null)).toBeNull();
  });
});

describe("isAiConsentRequiredBody", () => {
  it("recognizes the refusal code in an error body", () => {
    expect(isAiConsentRequiredBody({ code: AI_CONSENT_REQUIRED_CODE })).toBe(
      true,
    );
    expect(isAiConsentRequiredBody({ code: "RATE_LIMITED" })).toBe(false);
    expect(isAiConsentRequiredBody(null)).toBe(false);
  });
});

describe("fetchAiDataSharingStatus", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("reads the recorded decision from the consent endpoint", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ai_data_sharing: "granted" }));

    await expect(fetchAiDataSharingStatus()).resolves.toBe("granted");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/me/ai-consent",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("maps a missing decision to null (never asked)", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ai_data_sharing: null }));

    await expect(fetchAiDataSharingStatus()).resolves.toBeNull();
  });

  it("throws a German error when the read fails", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 503));

    await expect(fetchAiDataSharingStatus()).rejects.toThrow(
      "Deine Einstellung konnte nicht geladen werden.",
    );
  });
});

describe("recordAiDataSharingDecision", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("posts the decision and returns the server's record", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ai_data_sharing: "declined" }));

    await expect(recordAiDataSharingDecision("declined")).resolves.toBe(
      "declined",
    );
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/me/ai-consent");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ decision: "declined" });
  });

  it("falls back to the sent decision when the response carries none", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));

    await expect(recordAiDataSharingDecision("granted")).resolves.toBe(
      "granted",
    );
  });

  it("throws a German error when the save fails", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 500));

    await expect(recordAiDataSharingDecision("granted")).rejects.toThrow(
      "Deine Einstellung konnte nicht gespeichert werden.",
    );
  });
});
