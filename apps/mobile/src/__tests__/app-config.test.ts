import { readFileSync } from "node:fs";
import { join } from "node:path";

type PluginEntry = string | [string, Record<string, unknown>];

const appConfig = JSON.parse(readFileSync(join(__dirname, "../../app.json"), "utf8")) as {
  expo: { ios?: { infoPlist?: Record<string, unknown> }; plugins: PluginEntry[] };
};

describe("app config", () => {
  // App Review rejects an "audio" background mode unless the app plays
  // audible content in the background (guideline 2.5.4). Dictation is
  // discarded and Live ends when Ordilo leaves the foreground, so nothing
  // needs it. expo-audio declares it by default, so it is switched off.
  it("declares no background audio", () => {
    const audio = appConfig.expo.plugins.find(
      (plugin): plugin is [string, Record<string, unknown>] =>
        Array.isArray(plugin) && plugin[0] === "expo-audio",
    );
    expect(audio?.[1].enableBackgroundPlayback).toBe(false);
    expect(audio?.[1].enableBackgroundRecording).not.toBe(true);
    expect(appConfig.expo.ios?.infoPlist?.UIBackgroundModes).toBeUndefined();
  });
});
