/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  restoreLiveAudioRoute,
  routeLiveAudioToSpeaker,
} from "../lib/live-audio-route";

const mockNative = { enableSpeaker: jest.fn(), restore: jest.fn() };
let mockModule: typeof mockNative | null = mockNative;
jest.mock("expo", () => ({
  requireOptionalNativeModule: () => mockModule,
}));

beforeEach(() => {
  mockNative.enableSpeaker.mockReset();
  mockNative.restore.mockReset();
  mockModule = mockNative;
});

describe("Live audio route", () => {
  it("switches the call to the loudspeaker and back", () => {
    routeLiveAudioToSpeaker();
    restoreLiveAudioRoute();
    expect(mockNative.enableSpeaker).toHaveBeenCalledTimes(1);
    expect(mockNative.restore).toHaveBeenCalledTimes(1);
  });

  it("keeps Live working on builds without the native module", () => {
    mockModule = null;
    expect(() => routeLiveAudioToSpeaker()).not.toThrow();
    expect(() => restoreLiveAudioRoute()).not.toThrow();
  });

  it("never lets a routing failure end the conversation", () => {
    mockNative.enableSpeaker.mockImplementation(() => {
      throw new Error("AVAudioSession refused");
    });
    expect(() => routeLiveAudioToSpeaker()).not.toThrow();
  });

  it("routes before the microphone opens and restores on cleanup", () => {
    const live = readFileSync(
      resolve(__dirname, "../lib/live-conversation.ts"),
      "utf8",
    );
    expect(live.indexOf("routeLiveAudioToSpeaker();")).toBeGreaterThan(-1);
    expect(live.indexOf("routeLiveAudioToSpeaker();")).toBeLessThan(
      live.indexOf("mediaDevices.getUserMedia"),
    );
    const cleanup = live.slice(
      live.indexOf("const cleanup = useCallback"),
      live.indexOf("const stopSession = useCallback"),
    );
    expect(cleanup).toContain("restoreLiveAudioRoute();");
  });
});
