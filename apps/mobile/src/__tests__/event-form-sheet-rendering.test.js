/* global jest, it, expect */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { Image, Text } from "react-native";

import { EventFormSheet } from "../components/event-form-sheet";

jest.mock("lucide-react-native", () => new Proxy({}, { get: (_target, name) => (name === "__esModule" ? true : String(name)) }));
jest.mock("../components/ui", () => ({ OrdiloButton: "OrdiloButton" }));
jest.mock("../components/confirm-dialog", () => ({ ConfirmDialog: "ConfirmDialog" }));
jest.mock("../components/sheet", () => ({
  OrdiloFormBody: "OrdiloFormBody",
  OrdiloFormField: "OrdiloFormField",
  OrdiloFormFooter: "OrdiloFormFooter",
  OrdiloFormInput: "OrdiloFormInput",
  OrdiloFormSheet: "OrdiloFormSheet",
}));

const members = [
  { id: "m-karina", name: "Karina", role: "Kind", avatar_color: "#C0392B", photoUrl: "https://example.com/karina.jpg" },
  { id: "m-leon", name: "Leon", role: "Kind", avatar_color: "#27AE60", photoUrl: null },
];

// Guards the path a signed photo URL travels: fetchFamilyMembers -> memberToPerson
// -> PersonAvatar. A regression that drops the URL anywhere along that chain
// would leave every attendee showing only their colored initial.
it("shows an uploaded member photo in the attendee row, and an initial for one without", () => {
  let tree;
  act(() => {
    tree = renderer.create(
      <EventFormSheet
        defaultDate="2026-09-20"
        members={members}
        onClose={() => {}}
        onSubmit={async () => ({ success: true })}
        visible
      />,
    );
  });

  const images = tree.root.findAllByType(Image);
  expect(images).toHaveLength(1);
  expect(images[0].props.source).toEqual({ uri: "https://example.com/karina.jpg" });

  const texts = tree.root.findAllByType(Text).flatMap((node) => node.props.children);
  expect(texts).toContain("L");
});
