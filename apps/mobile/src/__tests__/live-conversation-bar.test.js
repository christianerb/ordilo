/* global jest, describe, it, expect, beforeEach, afterEach */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { StyleSheet, Text } from "react-native";
import { LiveConversationBar } from "../components/live-conversation-bar";

let mockReduced = false;
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: {
    View: require("react-native").View,
    Text: require("react-native").Text,
  },
  useReducedMotion: () => mockReduced,
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
      <LiveConversationBar lastTranscript="" onStop={() => {}} status="listening" {...props} />,
    );
  });
  trees.push(tree);
  return tree;
}
afterEach(async () => {
  for (const tree of trees.splice(0)) await act(async () => tree.unmount());
  mockReduced = false;
  jest.restoreAllMocks();
});

const labels = (tree) => tree.root.findAllByType(Text)
  .filter((node) => node.props.testID?.startsWith("live-label-"));

describe("Live conversation motion", () => {
  it("retargets persistent layers through quick interruptions without remounting", async () => {
    const tree = await render();
    const original = labels(tree);
    for (const status of ["thinking", "speaking", "listening", "speaking", "ending"]) {
      await act(async () => {
        tree.update(<LiveConversationBar lastTranscript="Eine Korrektur" onStop={() => {}} status={status} />);
      });
      const current = labels(tree);
      expect(current).toHaveLength(5);
      current.forEach((node, index) => {
        expect(node).toBe(original[index]);
        expect(StyleSheet.flatten(node.props.style)).toMatchObject({
          opacity: node.props.testID === `live-label-${status}` ? 1 : 0,
          transitionProperty: "opacity",
          transitionDuration: 150,
          transitionTimingFunction: "strong-ease-out",
        });
      });
    }
  });

  it("does not restart transitions when another transcript fragment arrives", async () => {
    const tree = await render();
    const original = labels(tree);
    await act(async () => {
      tree.update(<LiveConversationBar lastTranscript="Wann ist der Termin?" onStop={() => {}} status="listening" />);
    });
    labels(tree).forEach((node, index) => expect(node).toBe(original[index]));
    expect(tree.root.findAllByType(Text).map((node) => node.props.children))
      .toContain("„Wann ist der Termin?“");
  });

  it("keeps a scalable invisible title spacer and a stable 48pt stop target", async () => {
    const stop = jest.fn();
    const tree = await render({ onStop: stop });
    const spacer = tree.root.findAllByType(Text).find((node) =>
      node.props.children === "Ordilo verbindet sich …" && !node.props.testID);
    expect(StyleSheet.flatten(spacer.props.style).opacity).toBe(0);
    expect(spacer.props.numberOfLines).toBeUndefined();
    expect(spacer.props.allowFontScaling).not.toBe(false);
    const button = tree.root.findByType("SpringPressable");
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({ width: 48, height: 48 });
    act(() => button.props.onPress());
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("exposes only the current status to accessibility and keeps Stop separate", async () => {
    const tree = await render({ status: "thinking" });
    const liveRegion = tree.root.findByProps({ accessibilityLiveRegion: "polite" });
    expect(liveRegion.props.accessibilityLabel).toBe("Ordilo schaut nach …");
    labels(tree).forEach((node) => {
      expect(node.props.accessibilityElementsHidden).toBe(true);
      expect(node.props.importantForAccessibility).toBe("no-hide-descendants");
    });
    expect(tree.root.findByType("SpringPressable").props.accessibilityLabel)
      .toBe("Live-Gespräch beenden");
  });

  it("removes spatial movement under Reduce Motion but keeps a gentle crossfade", async () => {
    mockReduced = true;
    const tree = await render({ status: "connecting" });
    const halo = tree.root.findByProps({ testID: "live-state-halo" });
    expect(StyleSheet.flatten(halo.props.style).transform).toEqual([{ scale: 1 }]);
    expect(StyleSheet.flatten(labels(tree)[0].props.style).transitionProperty).toBe("opacity");
    const bar = tree.root.findByProps({ testID: "live-conversation-bar" });
    expect(bar.props.entering).toBe("fade-in");
    expect(bar.props.exiting).toBe("fade-out");
  });

  it("does not claim microphone readiness while connecting or ending", async () => {
    const connecting = await render({ status: "connecting" });
    const ending = await render({ status: "ending", lastTranscript: "Alte Frage" });
    for (const tree of [connecting, ending]) {
      expect(tree.root.findAllByType(Text).map((node) => node.props.children))
        .not.toContain("Du kannst jederzeit sprechen.");
    }
    expect(ending.root.findByType("SpringPressable").props.disabled).toBe(true);
    expect(StyleSheet.flatten(ending.root.findByProps({ testID: "live-state-halo" }).props.style).opacity).toBe(0);
  });

  it("renders no live indicator when idle", async () => {
    const tree = await render({ status: "idle" });
    expect(tree.toJSON()).toBeNull();
  });

  it("uses short scalable status text with full accessible labels at large text sizes", async () => {
    jest.spyOn(require("react-native"), "useWindowDimensions").mockReturnValue({
      width: 320, height: 568, scale: 2, fontScale: 3.1,
    });
    const tree = await render({ status: "thinking" });
    const title = labels(tree).find((node) => node.props.testID === "live-label-thinking");
    expect(title.props.children).toBe("Ich prüfe …");
    // Native text scales lineHeight itself; multiplying by fontScale double-scales it.
    expect(StyleSheet.flatten(title.props.style).lineHeight).toBe(22.4);
    expect(title.props.allowFontScaling).not.toBe(false);
    expect(StyleSheet.flatten(tree.root.findByProps({ testID: "live-conversation-bar" }).props.style).flexDirection)
      .toBe("column");
    expect(tree.root.findAllByType("OrdiloMark")).toHaveLength(0);
    expect(tree.root.findByProps({ accessibilityLiveRegion: "polite" }).props.accessibilityLabel)
      .toBe("Ordilo schaut nach …");
  });
});
