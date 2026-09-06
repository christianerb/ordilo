/* global jest, describe, it, expect */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { FIRST_VALUE_EXAMPLE as example } from "@ordilo/document-contract";
import ExampleScreen from "../../app/beispiel";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock("lucide-react-native", () => ({ Camera: "Camera" }));
jest.mock("@/src/components/ui", () => ({
  DetailTopBar: "DetailTopBar", OrdiloButton: "OrdiloButton", Screen: "Screen",
}));

function output(tree) {
  return JSON.stringify(tree.toJSON(), (key, value) => key === "icon" ? undefined : value);
}

describe("shared example from settings", () => {
  it("opens the shared demo, shows its answer and source, resets it on close, and starts a real scan", async () => {
    let tree;
    await act(async () => { tree = renderer.create(<ExampleScreen />); });
    expect(output(tree)).not.toContain(example.answer);
    act(() => tree.root.findByProps({ title: "Ohne eigenen Brief ausprobieren" }).props.onPress());
    expect(output(tree)).toContain(example.notice);
    expect(output(tree)).toContain(example.letter);
    act(() => tree.root.findByProps({ title: example.question }).props.onPress());
    expect(output(tree)).toContain(example.answer);
    expect(output(tree)).toContain(example.quote);
    expect(output(tree)).toContain("Die Fundstelle im Beispielbrief");
    act(() => tree.root.findByProps({ title: "Mit eigenem Brief loslegen" }).props.onPress());
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/scan", params: { auto: "1" } });
    act(() => tree.root.findByProps({ title: "Beispiel schließen" }).props.onPress());
    expect(output(tree)).not.toContain(example.answer);
    act(() => tree.root.findByProps({ title: "Ohne eigenen Brief ausprobieren" }).props.onPress());
    expect(output(tree)).not.toContain(example.answer);
    expect(output(tree)).toContain(example.letter);
    act(() => tree.root.findByProps({ title: "Eigenen Brief scannen" }).props.onPress());
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/scan", params: { auto: "1" } });
    act(() => tree.root.findByProps({ title: "Zur App" }).props.onPress());
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
    await act(async () => tree.unmount());
  });
});
