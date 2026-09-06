/* global jest, describe, it, expect, beforeEach */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { FirstValueExample } from "../components/first-value-example";
import { DocumentNextStep } from "../components/document-next-step";
import { FIRST_VALUE_EXAMPLE as example } from "@ordilo/document-contract";
import { recordFirstValueEvent } from "../lib/first-value";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock("../components/ui", () => ({ OrdiloButton: "OrdiloButton" }));
jest.mock("../lib/family-context", () => ({ useFamily: () => ({ family: { id: "family-1" } }) }));
jest.mock("../lib/first-value", () => ({ recordFirstValueEvent: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

describe("native first value", () => {
  it("shows the prepared answer and source only after an explicit question", async () => {
    let tree;
    await act(async () => { tree = renderer.create(<FirstValueExample />); });
    await act(async () => tree.root.findByProps({ title: "Ohne eigenen Brief ausprobieren" }).props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain(example.notice);
    await act(async () => tree.root.findByProps({ title: example.question }).props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain(example.answer);
    expect(JSON.stringify(tree.toJSON())).toContain(example.quote);
    expect(recordFirstValueEvent).not.toHaveBeenCalled();
    await act(async () => tree.root.findByProps({ title: "Beispiel schließen" }).props.onPress());
    expect(JSON.stringify(tree.toJSON())).not.toContain(example.answer);
    await act(async () => tree.unmount());
  });

  it.each([
    [1, 0, "Zum Kalender", "calendar"],
    [0, 2, "Zu den Aufgaben", "tasks"],
  ])("opens the correct planner tab for saved outcomes", async (eventsCreated, tasksKept, label, tab) => {
    let tree;
    await act(async () => { tree = renderer.create(<DocumentNextStep documentId="doc-1" title="Brief" eventsCreated={eventsCreated} tasksKept={tasksKept} />); });
    await act(async () => tree.root.findByProps({ title: label }).props.onPress());
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/(tabs)/plan", params: { tab } });
    expect(recordFirstValueEvent).toHaveBeenCalledWith("family-1", {
      name: "document_next_step_selected", documentId: "doc-1", destination: tab,
    });
    await act(async () => tree.unmount());
  });

  it("prepares a document question when there is no task or appointment", async () => {
    let tree;
    await act(async () => { tree = renderer.create(<DocumentNextStep documentId="doc-1" title="Brief" eventsCreated={0} tasksKept={0} />); });
    await act(async () => tree.root.findByProps({ title: "Ordilo dazu fragen" }).props.onPress());
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/suche", params: { q: "Was ist in „Brief“ wichtig? Bitte zeig mir die Fundstelle." },
    });
    await act(async () => tree.unmount());
  });

  it("steps behind a waiting durable import instead of competing as another primary action", async () => {
    let tree;
    await act(async () => {
      tree = renderer.create(
        <DocumentNextStep
          documentId="doc-1"
          title="Brief"
          eventsCreated={1}
          tasksKept={0}
          variant="outline"
        />,
      );
    });
    expect(tree.root.findByProps({ title: "Zum Kalender" }).props.variant).toBe("outline");
    await act(async () => tree.unmount());
  });
});
