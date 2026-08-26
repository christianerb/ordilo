// expo-speech-recognition is a native module — mock it so Jest can import
// the pure function without a native runtime.
jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    requestPermissionsAsync: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
  },
  useSpeechRecognitionEvent: jest.fn(),
}));

// eslint-disable-next-line import/first -- jest.mock must run before the import
import { voiceErrorMessage } from "../lib/voice-input";

describe("voiceErrorMessage", () => {
  it("maps known error codes to German user messages", () => {
    expect(voiceErrorMessage("not-allowed")).toBe(
      "Kein Zugriff auf das Mikrofon. Bitte erlaube den Zugriff in den Einstellungen.",
    );
    expect(voiceErrorMessage("audio-capture")).toBe(
      "Das Mikrofon ist nicht erreichbar. Bitte prüfe dein Gerät.",
    );
    expect(voiceErrorMessage("network")).toBe(
      "Keine Verbindung für die Spracherkennung. Bitte prüfe dein Internet.",
    );
    expect(voiceErrorMessage("no-speech")).toBe(
      "Ich konnte nichts hören. Bitte versuch es nochmal.",
    );
    expect(voiceErrorMessage("busy")).toBe(
      "Die Spracherkennung ist beschäftigt. Bitte versuch es gleich nochmal.",
    );
  });

  it("returns a generic German fallback for unknown or missing codes", () => {
    expect(voiceErrorMessage(undefined)).toBe(
      "Die Spracheingabe hat nicht geklappt. Bitte versuch es nochmal.",
    );
    // "aborted" is a known code but has no specific message — falls through
    // to the generic fallback.
    expect(voiceErrorMessage("aborted")).toBe(
      "Die Spracheingabe hat nicht geklappt. Bitte versuch es nochmal.",
    );
  });

  it("never returns an empty string", () => {
    const codes = [
      "not-allowed",
      "audio-capture",
      "network",
      "no-speech",
      "language-not-supported",
      "service-not-allowed",
      "busy",
      "aborted",
      "bad-grammar",
      "speech-timeout",
      undefined,
    ] as const;
    for (const code of codes) {
      expect(voiceErrorMessage(code)).toBeTruthy();
    }
  });
});
