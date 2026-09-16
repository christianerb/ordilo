import {
  AI_CONSENT_REQUIRED_CODE,
  fetchAiDataSharingStatus,
  parseAiDataSharingStatus,
  recordAiDataSharingDecision,
} from "../lib/ai-consent";

const mockApiJson = jest.fn();
jest.mock("../lib/api", () => ({
  apiJson: (...args: unknown[]) => mockApiJson(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("parseAiDataSharingStatus", () => {
  it("accepts only the two recorded decisions", () => {
    expect(parseAiDataSharingStatus("granted")).toBe("granted");
    expect(parseAiDataSharingStatus("declined")).toBe("declined");
  });

  it("treats anything else as never asked", () => {
    expect(parseAiDataSharingStatus("maybe")).toBeNull();
    expect(parseAiDataSharingStatus(undefined)).toBeNull();
    expect(parseAiDataSharingStatus(null)).toBeNull();
    expect(parseAiDataSharingStatus(42)).toBeNull();
  });
});

describe("fetchAiDataSharingStatus", () => {
  it("reads the recorded decision from the consent endpoint", async () => {
    mockApiJson.mockResolvedValue({ ai_data_sharing: "granted" });

    await expect(fetchAiDataSharingStatus()).resolves.toBe("granted");
    expect(mockApiJson).toHaveBeenCalledWith("/api/me/ai-consent");
  });

  it("maps a missing decision to null (never asked)", async () => {
    mockApiJson.mockResolvedValue({ ai_data_sharing: null });

    await expect(fetchAiDataSharingStatus()).resolves.toBeNull();
  });

  it("lets ApiError failures bubble up to the caller", async () => {
    mockApiJson.mockRejectedValue(new Error("offline"));

    await expect(fetchAiDataSharingStatus()).rejects.toThrow("offline");
  });
});

describe("recordAiDataSharingDecision", () => {
  it("posts the decision and returns the server's record", async () => {
    mockApiJson.mockResolvedValue({ ai_data_sharing: "declined" });

    await expect(recordAiDataSharingDecision("declined")).resolves.toBe(
      "declined",
    );
    expect(mockApiJson).toHaveBeenCalledWith(
      "/api/me/ai-consent",
      expect.objectContaining({ method: "POST" }),
    );
    const init = mockApiJson.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ decision: "declined" });
  });

  it("falls back to the sent decision when the response carries none", async () => {
    mockApiJson.mockResolvedValue({});

    await expect(recordAiDataSharingDecision("granted")).resolves.toBe(
      "granted",
    );
  });
});

it("exposes the server's refusal code for failure mapping", () => {
  expect(AI_CONSENT_REQUIRED_CODE).toBe("AI_CONSENT_REQUIRED");
});
