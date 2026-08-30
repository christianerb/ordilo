import {
  removeVoiceRecording,
  transcribeVoiceRecording,
} from "../lib/voice";

const mockGetSession = jest.fn();
const mockFetch = jest.fn();
const mockDelete = jest.fn();
let mockFileExists = true;

jest.mock("expo-file-system", () => ({
  File: class MockVoiceFile extends Blob {
    readonly uri: string;

    constructor(uri: string) {
      super(["voice"], { type: "audio/m4a" });
      this.uri = uri;
    }

    get exists() {
      return mockFileExists;
    }

    delete() {
      mockDelete();
    }
  },
}));

jest.mock("../lib/native-fetch", () => ({
  nativeFetch: (...args: Parameters<typeof fetch>) => mockFetch(...args),
}));

jest.mock("../lib/supabase", () => ({
  getSupabase: () => ({ auth: { getSession: mockGetSession } }),
}));

describe("voice recording client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFileExists = true;
    process.env.EXPO_PUBLIC_API_URL = "https://ordilo.example.com";
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "access-token-1" } },
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ text: "  Wann ist der Elternabend?  " }),
    });
  });

  it("uploads an authenticated recording and returns trimmed draft text", async () => {
    await expect(
      transcribeVoiceRecording({
        familyId: "family-1",
        uri: "file:///cache/question.m4a",
      }),
    ).resolves.toBe("Wann ist der Elternabend?");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://ordilo.example.com/api/realtime/transcribe",
      expect.objectContaining({
        headers: { Authorization: "Bearer access-token-1" },
        method: "POST",
      }),
    );
  });

  it("does not upload without an authenticated session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await expect(
      transcribeVoiceRecording({ familyId: "family-1", uri: "file:///cache/a.m4a" }),
    ).rejects.toThrow("Nicht angemeldet");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("surfaces only the safe server error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Tageslimit für Spracheingaben erreicht." }),
    });

    await expect(
      transcribeVoiceRecording({ familyId: "family-1", uri: "file:///cache/a.m4a" }),
    ).rejects.toThrow("Tageslimit für Spracheingaben erreicht.");
  });

  it("maps transport failures to a German message", async () => {
    mockFetch.mockRejectedValue(new TypeError("Network request failed"));

    await expect(
      transcribeVoiceRecording({ familyId: "family-1", uri: "file:///cache/a.m4a" }),
    ).rejects.toThrow(
      "Keine Verbindung. Bitte prüfe dein Internet und versuch es nochmal.",
    );
  });

  it("deletes cached audio when it exists and never throws during cleanup", () => {
    removeVoiceRecording("file:///cache/a.m4a");
    expect(mockDelete).toHaveBeenCalledTimes(1);

    mockFileExists = false;
    removeVoiceRecording("file:///cache/missing.m4a");
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});
