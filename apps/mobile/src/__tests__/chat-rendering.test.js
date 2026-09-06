/* global jest, describe, it, expect */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { ChatComposer, ChatThinkingState } from "../components/chat";
import { ChatMarkdown } from "../components/chat-markdown";

jest.mock("react-native-reanimated", () => ({ __esModule: true, default: { View: require("react-native").View, Text: require("react-native").Text }, useReducedMotion: () => true }));
jest.mock("../theme/motion", () => ({ feedbackEntering: () => undefined, feedbackExiting: () => undefined }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: (_target, name) => name === "__esModule" ? true : String(name) }));
jest.mock("../components/ui", () => ({ OrdiloButton: "OrdiloButton" }));
jest.mock("../components/contacts", () => ({ ContactActionGrid: "ContactActionGrid", openContactHref: jest.fn() }));
jest.mock("../components/chat-evidence", () => ({ ChatEvidence: "ChatEvidence" }));

describe("native conversation rendering", () => {
  it("keeps an actionable stop control while the answer is running", async () => {
    const stop = jest.fn(); let tree;
    await act(async () => { tree = renderer.create(<ChatComposer busy value="" inputRef={{ current: null }} onChange={() => {}} onSend={() => {}} onStop={stop} />); });
    const control = tree.root.findAllByProps({ accessibilityLabel: "Antwort stoppen" })[0];
    expect(control.props.disabled).toBe(false);
    act(() => control.props.onPress());
    expect(stop).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });
  it("renders bold values and table cells without exposing Markdown syntax", async () => {
    let tree;
    await act(async () => { tree = renderer.create(<ChatMarkdown text={"Gültig bis **31. August 2027**.\n\n| Person | Ticket |\n| --- | --- |\n| Hannah | gültig |"} />); });
    const output = JSON.stringify(tree.toJSON());
    expect(output).toContain("31. August 2027");
    expect(output).toContain("Hannah");
    expect(output).not.toContain("**");
    expect(output).not.toContain("| --- |");
    await act(async () => tree.unmount());
  });
  it("announces real search activity without stacking animated placeholders", async () => {
    let tree;
    await act(async () => { tree = renderer.create(<ChatThinkingState toolCalls={[{ toolName: "read_document", state: "start" }]} />); });
    const output = JSON.stringify(tree.toJSON());
    expect(output).toContain("Liest die passende Stelle nach");
    expect(output).not.toContain("ActivityIndicator");
    await act(async () => tree.unmount());
  });
});
