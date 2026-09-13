/* global jest, describe, it, expect, beforeEach, afterEach */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { StyleSheet, Text } from "react-native";
import { LiveConversationBar } from "../components/live-conversation-bar";

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: {
    View: require("react-native").View,
    Text: require("react-native").Text,
  },
  useReducedMotion: () => false,
}));
jest.mock("../theme/motion", () => ({
  contentEntering: () => "fade-in",
  feedbackExiting: () => "fade-out",
  durations: { fast: 150 },
  cssEaseOut: "strong-ease-out",
}));
jest.mock("../components/ordilo-mark", () => ({ OrdiloMark: "OrdiloMark" }));
jest.mock("../components/ui", () => ({ SpringPressable: "SpringPressable" }));
jest.mock("lucide-react-native", () => new Proxy({}, {
  get: (_target, name) => name === "__esModule" ? true : String(name),
}));

const trees = [];
beforeEach(() => {
  jest.spyOn(require("react-native"), "useWindowDimensions").mockReturnValue({
    width: 320, height: 568, scale: 2, fontScale: 1,
  });
});
async function render(props = {}) {
  let tree;
  await act(async () => {
    tree = renderer.create(
      <LiveConversationBar
        lastTranscript=""
        muted={false}
        onStop={() => {}}
        onToggleMute={() => {}}
        previousTranscript=""
        status="listening"
        {...props}
      />,
    );
  });
  trees.push(tree);
  return tree;
}
afterEach(async () => {
  for (const tree of trees.splice(0)) await act(async () => tree.unmount());
  jest.restoreAllMocks();
});

const muteButton = (tree) => tree.root.findAllByType("SpringPressable")
  .find((node) => node.props.accessibilityLabel?.startsWith("Mikrofon "));

describe("Live conversation mute control", () => {
  it("toggles mute through one accessible 44pt button", async () => {
    const onToggleMute = jest.fn();
    const tree = await render({ onToggleMute });
    const button = muteButton(tree);
    expect(button.props.accessibilityLabel).toBe("Mikrofon ausschalten. Mikrofon ist an");
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({ width: 44, height: 44 });
    act(() => button.props.onPress());
    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });

  it("shows a clear muted state: icon swap, selected state, spoken hint", async () => {
    const tree = await render({ muted: true, lastTranscript: "Wann läuft der Vertrag ab?" });
    const button = muteButton(tree);
    expect(button.props.accessibilityLabel).toBe("Mikrofon einschalten. Mikrofon ist aus");
    expect(button.findAllByType("MicOff")).toHaveLength(1);
    const copy = tree.root.findAllByType(Text).map((node) => node.props.children);
    expect(copy).toContain("Mikrofon aus. Tippe auf das Mikrofon, um weiterzusprechen.");
    // The muted hint replaces the transcript prompt, not the status label.
    expect(copy).not.toContain("„Wann läuft der Vertrag ab?“");
    const liveRegion = tree.root.findByProps({ accessibilityLiveRegion: "polite" });
    expect(liveRegion.props.accessibilityLabel).toBe("Ordilo hört zu");
  });

  it("unmuted shows the Mic glyph and the transcript again", async () => {
    const tree = await render({ lastTranscript: "Hallo Ordilo" });
    expect(muteButton(tree).findAllByType("Mic")).toHaveLength(1);
    expect(tree.root.findAllByType(Text).map((node) => node.props.children))
      .toContain("„Hallo Ordilo“");
  });

  it("cannot be muted before the session is ready", async () => {
    for (const status of ["connecting", "ending"]) {
      const tree = await render({ status });
      expect(muteButton(tree).props.disabled).toBe(true);
    }
  });
});

describe("Live conversation transcript pair", () => {
  it("shows the previous turn above the current one in the quieter timestamp style", async () => {
    const tree = await render({
      lastTranscript: "Und was kostet das?",
      previousTranscript: "Wann läuft der Vertrag ab?",
    });
    const previous = tree.root.findByProps({ testID: "live-previous-transcript" });
    expect(previous.props.children).toBe("„Wann läuft der Vertrag ab?“");
    expect(StyleSheet.flatten(previous.props.style)).toMatchObject({
      color: "#625D54",
      fontSize: 14,
    });
    const texts = tree.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts.indexOf("„Wann läuft der Vertrag ab?“"))
      .toBeLessThan(texts.indexOf("„Und was kostet das?“"));
  });

  it("keeps the first turn alone when there is no previous one", async () => {
    const tree = await render({ lastTranscript: "Erste Frage" });
    expect(tree.root.findAllByProps({ testID: "live-previous-transcript" })).toHaveLength(0);
  });
});
