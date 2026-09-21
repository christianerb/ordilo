/* global jest, it, expect */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";

import PosteingangScreen from "../../app/posteingang";

jest.mock("lucide-react-native", () => new Proxy({}, { get: (_target, name) => (name === "__esModule" ? true : String(name)) }));

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useFocusEffect: (callback) => require("react").useEffect(() => callback(), [callback]),
}));

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));

jest.mock("../lib/api", () => ({
  apiJson: jest.fn(async () => ({ address: "familie@post.ordilo.de" })),
}));

const mockFamily = { id: "fam-1" };
jest.mock("../lib/family-context", () => ({
  useFamily: () => ({ family: mockFamily }),
}));

jest.mock("../lib/feedback", () => ({ success: jest.fn() }));

jest.mock("../lib/inbox", () => ({
  INBOX_STATUS_LABELS: {
    new_suggestions: "Neue Vorschläge",
    in_library: "In der Ablage",
    filed: "Abgelegt",
  },
  formatInboxReceivedAt: () => "vor 2 Stunden",
  loadInboxEmails: jest.fn(async () => [
    { id: "e-1", subject: "Versicherung Kündigung", fromAddress: "mara@example.de", receivedAt: "2026-09-21T08:00:00Z", pendingSuggestions: 2, documentId: null, status: "new_suggestions" },
    { id: "e-2", subject: "Rechnung Kindergarten", fromAddress: "kita@example.de", receivedAt: "2026-09-20T08:00:00Z", pendingSuggestions: 0, documentId: "doc-1", status: "in_library" },
    { id: "e-3", subject: "Newsletter", fromAddress: "news@example.de", receivedAt: "2026-09-19T08:00:00Z", pendingSuggestions: 0, documentId: null, status: "filed" },
  ]),
}));

jest.mock("../components/ui", () => ({
  Card: "Card",
  DetailTopBar: "DetailTopBar",
  EmptyState: "EmptyState",
  InlineNotice: "InlineNotice",
  ListGroup: "ListGroup",
  ListRow: "ListRow",
  ListSkeleton: "ListSkeleton",
  OrdiloButton: "OrdiloButton",
  Screen: "Screen",
  ScreenHeader: "ScreenHeader",
  SectionHeader: "SectionHeader",
}));

async function renderScreen() {
  let tree;
  await act(async () => {
    tree = renderer.create(<PosteingangScreen />);
  });
  return tree;
}

// The distilled inbox marks only rows that need an answer; quiet states
// (in der Ablage, abgelegt) carry no badge.
it("shows the status pill only for mail with new suggestions", async () => {
  const tree = await renderScreen();
  const rows = tree.root.findAllByType("ListRow");
  expect(rows).toHaveLength(3);
  expect(rows[0].props.trailing).not.toBeNull();
  expect(rows[0].props.trailing).not.toBeUndefined();
  expect(rows[1].props.trailing).toBeUndefined();
  expect(rows[2].props.trailing).toBeUndefined();
});

// Sender and received time share one supporting line instead of two.
it("merges sender and time into one subtitle line", async () => {
  const tree = await renderScreen();
  const rows = tree.root.findAllByType("ListRow");
  expect(rows[0].props.subtitle).toBe("mara@example.de · vor 2 Stunden");
  expect(rows[0].props.meta).toBeUndefined();
});

// One action for the address: kopieren. The share button and the
// share-instructions section were cut as noise.
it("keeps only the copy action and drops the removed sections", async () => {
  const tree = await renderScreen();
  const buttons = tree.root.findAllByType("OrdiloButton").map((node) => node.props.title);
  expect(buttons).toContain("Adresse kopieren");
  expect(buttons).not.toContain("Adresse teilen");

  const texts = tree.root.findAllByType(Text).flatMap((node) => node.props.children);
  expect(texts).toContain("familie@post.ordilo.de");
  expect(texts).not.toContain("Direkt aus einer anderen App");
});
