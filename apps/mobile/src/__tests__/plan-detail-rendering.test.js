/* global jest, describe, it, expect */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";

import { PlanDetailSheet } from "../components/plan-detail-sheet";
import { ActionCardView } from "../components/chat";

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: require("react-native").View, Text: require("react-native").Text },
  useReducedMotion: () => true,
  useAnimatedStyle: () => ({}),
  useSharedValue: () => ({ value: 0 }),
  withTiming: (value) => value,
}));
jest.mock("../theme/motion", () => ({
  feedbackEntering: () => undefined,
  feedbackExiting: () => undefined,
  REDUCE_MOTION: 0,
  durations: { fast: 150, base: 220 },
  easeOut: undefined,
  easeInOut: undefined,
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: (_t, name) => (name === "__esModule" ? true : String(name)) }));
jest.mock("../components/ui", () => ({ OrdiloButton: "OrdiloButton", Skeleton: "Skeleton" }));
jest.mock("../components/contacts", () => ({ ContactActionGrid: "ContactActionGrid", openContactHref: jest.fn() }));
jest.mock("../components/chat-evidence", () => ({ ChatEvidence: "ChatEvidence" }));
jest.mock("../components/person", () => ({ AvatarStack: "AvatarStack" }));
jest.mock("../components/sheet", () => {
  const React = require("react");
  const { Text, View } = require("react-native");
  return {
    OrdiloFormSheet: ({ children, subtitle, title }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        subtitle ? React.createElement(Text, null, subtitle) : null,
        children,
      ),
  };
});

const members = [
  { id: "m-karina", name: "Karina", role: "Kind", avatar_color: "#C0392B" },
];

const TODAY = "2026-09-08";

const eventEntry = {
  kind: "event",
  id: "event-1",
  date: TODAY,
  event: {
    id: "event-1",
    title: "Test",
    note: null,
    starts_on: TODAY,
    ends_on: TODAY,
    all_day: true,
    starts_time: null,
    ends_time: null,
    recurrence: "none",
    recurrence_until: null,
    recurrence_exceptions: [],
    location: "Grindelwalds",
    responsible_member_id: null,
    document_id: null,
    attendee_ids: ["m-karina"],
  },
};

const taskEntry = {
  kind: "task",
  id: "task-1",
  date: TODAY,
  task: {
    id: "task-1",
    family_id: "fam-1",
    document_id: "doc-1",
    title: "Zahnarzttermin klären",
    description: "Bei der Praxis anrufen",
    due_date: TODAY,
    status: "open",
    confidence: 1,
    confirmed: true,
    created_at: "2026-09-01T09:00:00.000Z",
    tags: [],
    assigned_to: "m-karina",
    completed_at: null,
  },
};

function texts(tree) {
  return tree.root.findAllByType(Text).map((node) => node.props.children);
}

function buttons(tree) {
  return tree.root.findAllByType("OrdiloButton").map((node) => node.props.title);
}

describe("the shared plan detail sheet", () => {
  it("opens an appointment with its day, time, place and people", async () => {
    let tree;
    await act(async () => {
      tree = renderer.create(
        <PlanDetailSheet
          entry={eventEntry}
          members={members}
          onAction={() => {}}
          onClose={() => {}}
          todayStr={TODAY}
          visible
        />,
      );
    });

    const content = texts(tree);
    expect(content).toContain("Termin");
    expect(content).toContain("Test");
    expect(content).toContain("Grindelwalds");
    expect(content).toContain("Für Karina");
    expect(content).toContain("8. September 2026");
    expect(content).toContain("Ganztägig");
    // A one-off appointment offers no series action.
    expect(buttons(tree)).toEqual(["Termin ändern", "Termin löschen"]);
    await act(async () => tree.unmount());
  });

  it("offers a repeating appointment both scopes, and names the series", async () => {
    let tree;
    const series = {
      ...eventEntry,
      date: "2026-09-15",
      event: { ...eventEntry.event, recurrence: "weekly" },
    };
    await act(async () => {
      tree = renderer.create(
        <PlanDetailSheet
          entry={series}
          members={members}
          onAction={() => {}}
          onClose={() => {}}
          todayStr={TODAY}
          visible
        />,
      );
    });

    expect(texts(tree)).toContain("Jede Woche");
    // The occurrence on screen, not the series start.
    expect(texts(tree)).toContain("15. September 2026");
    expect(buttons(tree)).toEqual([
      "Termin ändern",
      "Nur diesen Tag streichen",
      "Ganze Serie löschen",
    ]);
    await act(async () => tree.unmount());
  });

  it("gives a task the same layout with the actions a task has", async () => {
    const actions = [];
    let tree;
    await act(async () => {
      tree = renderer.create(
        <PlanDetailSheet
          entry={taskEntry}
          members={members}
          onAction={(action) => actions.push(action)}
          onClose={() => {}}
          todayStr={TODAY}
          visible
        />,
      );
    });

    const content = texts(tree);
    expect(content).toContain("Aufgabe");
    expect(content).toContain("Zahnarzttermin klären");
    expect(content).toContain("Bei der Praxis anrufen");
    expect(content).toContain("Karina kümmert sich");
    // A task read out of a document can jump back to it.
    expect(content).toContain("Aus einem Dokument");
    expect(buttons(tree)).toEqual(["Erledigt", "Brauchen wir nicht"]);

    await act(async () =>
      tree.root
        .findAllByType("OrdiloButton")
        .find((node) => node.props.title === "Erledigt")
        .props.onPress(),
    );
    expect(actions).toEqual([{ type: "toggle-done" }]);
    await act(async () => tree.unmount());
  });

  it("turns a finished task's primary action into re-opening it", async () => {
    let tree;
    await act(async () => {
      tree = renderer.create(
        <PlanDetailSheet
          entry={{
            ...taskEntry,
            task: { ...taskEntry.task, status: "done", completed_at: "2026-09-08T10:00:00.000Z" },
          }}
          members={members}
          onAction={() => {}}
          onClose={() => {}}
          todayStr={TODAY}
          visible
        />,
      );
    });

    expect(buttons(tree)).toEqual(["Wieder offen", "Brauchen wir nicht"]);
    expect(texts(tree)).toContain("Erledigt");
    await act(async () => tree.unmount());
  });
});

describe("a confirmed chat action leads somewhere", () => {
  const action = {
    id: "a-1",
    toolName: "add_calendar_event",
    args: { title: "Elternabend", starts_on: "2026-09-08" },
    state: "confirmed",
    target: { kind: "event", id: "event-1" },
  };

  it("offers to open the appointment it just created", async () => {
    const opened = jest.fn();
    let tree;
    await act(async () => {
      tree = renderer.create(
        <ActionCardView
          action={action}
          onAdjust={() => {}}
          onConfirm={() => {}}
          onDismiss={() => {}}
          onOpenTarget={opened}
          onUndo={() => {}}
        />,
      );
    });

    const open = tree.root
      .findAllByType("OrdiloButton")
      .find((node) => node.props.title === "Termin öffnen");
    expect(open).toBeDefined();
    act(() => open.props.onPress());
    expect(opened).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  it("stays silent about opening anything while nothing was created", async () => {
    let tree;
    await act(async () => {
      tree = renderer.create(
        <ActionCardView
          action={{ ...action, state: "ready", target: undefined }}
          onAdjust={() => {}}
          onConfirm={() => {}}
          onDismiss={() => {}}
          onUndo={() => {}}
        />,
      );
    });

    expect(buttons(tree)).not.toContain("Termin öffnen");
    await act(async () => tree.unmount());
  });
});
