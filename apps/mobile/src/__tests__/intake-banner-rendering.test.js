/* global jest, describe, it, expect */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";

import { IntakeBanner } from "../components/intake-banner";
import { describeIntake, describeIntakeFailure } from "../lib/intake-status";

// Prefixed with `mock` so the jest.mock factory below may reference it.
let mockReduceMotion = false;

jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: { View },
    Easing: { inOut: () => undefined, quad: undefined },
    useAnimatedStyle: (factory) => factory(),
    useReducedMotion: () => mockReduceMotion,
    useSharedValue: (initial) => ({ value: initial }),
    withRepeat: (value) => value,
    withTiming: (value) => value,
  };
});
jest.mock("../theme/motion", () => ({
  contentEntering: () => undefined,
  feedbackExiting: () => undefined,
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: (_t, name) => (name === "__esModule" ? true : String(name)) }));
jest.mock("../components/ordilo-mark", () => ({ OrdiloMark: "OrdiloMark" }));

function texts(tree) {
  return tree.root.findAllByType(Text).map((node) => node.props.children);
}

async function render(status) {
  let tree;
  await act(async () => {
    tree = renderer.create(
      <IntakeBanner onPress={() => {}} status={status} topInset={47} />,
    );
  });
  return tree;
}

const working = describeIntake([
  { uri: "a", name: "a", mimeType: "image/jpeg", size: 1, state: "processing" },
]);

describe("the intake banner", () => {
  it("shows Ordilo reading, and stays one tap from the Eingang", async () => {
    const opened = jest.fn();
    let tree;
    await act(async () => {
      tree = renderer.create(
        <IntakeBanner onPress={opened} status={working} topInset={47} />,
      );
    });

    const content = texts(tree);
    expect(content).toContain("Ordilo liest 1 Dokument");
    expect(content).toContain(
      "Du kannst weitermachen. Ich melde mich, wenn es fertig ist.",
    );
    // The brand mark carries the working state; no spinner needed.
    expect(tree.root.findAllByType("OrdiloMark")).toHaveLength(1);

    const button = tree.root.findAllByProps({ accessibilityRole: "button" })[0];
    // The whole banner reads out as one sentence, and says where it goes.
    expect(button.props.accessibilityLabel).toBe(
      "Ordilo liest 1 Dokument. Du kannst weitermachen. Ich melde mich, wenn es fertig ist.",
    );
    expect(button.props.accessibilityHint).toBe("Öffnet den Eingang");
    expect(button.props.accessibilityLiveRegion).toBe("polite");
    act(() => button.props.onPress());
    expect(opened).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  it("sits clear of the status bar", async () => {
    const tree = await render(working);
    const button = tree.root.findAllByProps({ accessibilityRole: "button" })[0];
    const style =
      typeof button.props.style === "function"
        ? button.props.style({ pressed: false })
        : button.props.style;
    const padding = [style]
      .flat(3)
      .find((entry) => entry && entry.paddingTop !== undefined);
    expect(padding.paddingTop).toBe(47 + 8);
    await act(async () => tree.unmount());
  });

  it("counts the documents it speaks for, but not a single one", async () => {
    const many = describeIntake([
      { uri: "a", name: "a", mimeType: "image/jpeg", size: 1, state: "processing" },
      { uri: "b", name: "b", mimeType: "image/jpeg", size: 1, state: "processing" },
      { uri: "c", name: "c", mimeType: "image/jpeg", size: 1, state: "queued" },
    ]);
    const tree = await render(many);
    expect(texts(tree)).toContain(3);

    const single = await render(working);
    expect(texts(single)).not.toContain(1);
    await act(async () => tree.unmount());
    await act(async () => single.unmount());
  });

  it("says an unreadable queue plainly, without pretending to work", async () => {
    const tree = await render(describeIntakeFailure());
    expect(texts(tree)).toContain("Eingang nicht lesbar");
    expect(tree.root.findAllByType("OrdiloMark")).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  it("holds the progress track still under Reduce Motion", async () => {
    mockReduceMotion = true;
    try {
      const tree = await render(working);
      const rest = tree.root
        .findAllByProps({ accessibilityRole: "button" })[0]
        .findAllByType(require("react-native").View)
        .filter((node) => {
          const style = [node.props.style].flat().filter(Boolean);
          return style.some((entry) => entry.width === "100%");
        });
      expect(rest.length).toBeGreaterThan(0);
      await act(async () => tree.unmount());
    } finally {
      mockReduceMotion = false;
    }
  });
});
