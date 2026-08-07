import { describe, it, expect, vi } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";

import {
  PersonPicker,
  unmatchedPersonName,
} from "@/components/ordilo/person-picker";

const familyMembers = [
  { id: "m1", name: "Emma", role: "Kind" },
  { id: "m2", name: "Hanna", role: "Kind" },
];

function renderPicker(props: Partial<React.ComponentProps<typeof PersonPicker>> = {}) {
  return render(
    <PersonPicker
      familyMembers={familyMembers}
      value={undefined}
      onChange={vi.fn()}
      testIdPrefix="pp"
      {...props}
    />,
  );
}

describe("PersonPicker", () => {
  it("assigns a member with one tap", () => {
    const onChange = vi.fn();
    renderPicker({ onChange });

    fireEvent.click(screen.getByTestId("pp-chip-m2"));
    expect(onChange).toHaveBeenCalledWith("m2");
  });

  it("marks the assigned member and ignores a tap on it", () => {
    const onChange = vi.fn();
    renderPicker({ value: "m1", onChange });

    expect(screen.getByTestId("pp-chip-m1")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("pp-chip-m2")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByTestId("pp-chip-m1"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports null when 'Ohne Person' is tapped", () => {
    const onChange = vi.fn();
    renderPicker({ onChange });

    fireEvent.click(screen.getByTestId("pp-chip-none"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("distinguishes 'nothing assigned yet' from 'explicitly nobody'", () => {
    // undefined → no chip preselected, so an unlinked extraction does not
    // masquerade as a deliberate "belongs to nobody".
    const { unmount } = renderPicker({ value: undefined });
    expect(screen.getByTestId("pp-chip-none")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    unmount();

    renderPicker({ value: null });
    expect(screen.getByTestId("pp-chip-none")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("offers a create chip only with both a name and a handler", () => {
    const { unmount } = renderPicker({ createName: "Oma Ute" });
    expect(screen.queryByTestId("pp-chip-create")).toBeNull();
    unmount();

    renderPicker({ createName: "Oma Ute", onCreate: vi.fn() });
    expect(screen.getByTestId("pp-chip-create")).toHaveTextContent(
      "Oma Ute anlegen",
    );
  });

  it("keeps the create chip disabled while creating", async () => {
    let resolveCreate: ((ok: boolean) => void) | undefined;
    const onCreate = vi.fn(
      () => new Promise<boolean>((resolve) => (resolveCreate = resolve)),
    );
    renderPicker({ createName: "Oma Ute", onCreate });

    const chip = screen.getByTestId("pp-chip-create");
    fireEvent.click(chip);
    expect(onCreate).toHaveBeenCalledWith("Oma Ute");
    await waitFor(() => expect(chip).toBeDisabled());

    resolveCreate!(true);
    await waitFor(() => expect(chip).not.toBeDisabled());
  });

  it("offers no exit without onDismiss, and a tap on the assigned chip stays a no-op", () => {
    const onChange = vi.fn();
    renderPicker({ value: "m1", onChange });
    expect(screen.queryByTestId("pp-chip-dismiss")).toBeNull();
    fireEvent.click(screen.getByTestId("pp-chip-m1"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes via the assigned chip, the Ohne-Person chip and Abbrechen", () => {
    const onDismiss = vi.fn();
    const onChange = vi.fn();
    const { unmount } = renderPicker({ value: "m1", onDismiss, onChange });

    // Confirming the current assignment reads as "yes, that one" → close.
    fireEvent.click(screen.getByTestId("pp-chip-m1"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("pp-chip-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(2);
    unmount();

    // Same for an already-explicit "nobody".
    const onDismiss2 = vi.fn();
    renderPicker({ value: null, onDismiss: onDismiss2 });
    fireEvent.click(screen.getByTestId("pp-chip-none"));
    expect(onDismiss2).toHaveBeenCalledTimes(1);
  });

  it("reports a failed creation instead of looking like a dead tap", async () => {
    const onCreate = vi.fn().mockResolvedValue(false);
    renderPicker({ createName: "Oma Ute", onCreate });

    fireEvent.click(screen.getByTestId("pp-chip-create"));
    expect(await screen.findByTestId("pp-create-error")).toHaveTextContent(
      /nicht geklappt/i,
    );
  });

  it("reports a rejected creation too", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("offline"));
    renderPicker({ createName: "Oma Ute", onCreate });

    fireEvent.click(screen.getByTestId("pp-chip-create"));
    expect(await screen.findByTestId("pp-create-error")).toBeDefined();
  });

  it("renders nothing without members and without a create offer", () => {
    const { container } = render(
      <PersonPicker
        familyMembers={[]}
        value={undefined}
        onChange={vi.fn()}
        testIdPrefix="pp"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("still offers creating when the family has no members yet", () => {
    render(
      <PersonPicker
        familyMembers={[]}
        value={undefined}
        onChange={vi.fn()}
        createName="Oma Ute"
        onCreate={vi.fn()}
        testIdPrefix="pp"
      />,
    );
    expect(screen.getByTestId("pp-chip-create")).toBeDefined();
  });
});

describe("PersonPicker — free-text create", () => {
  it("always offers a 'Neue Person' chip when creation is possible", () => {
    renderPicker({ onCreate: vi.fn() });
    expect(screen.getByTestId("pp-chip-new")).toBeDefined();
  });

  it("offers no 'Neue Person' chip without an onCreate handler", () => {
    renderPicker();
    expect(screen.queryByTestId("pp-chip-new")).toBeNull();
  });

  it("creates a member with the typed name and closes the form", async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    renderPicker({ onCreate });

    fireEvent.click(screen.getByTestId("pp-chip-new"));
    fireEvent.change(screen.getByTestId("pp-create-input"), {
      target: { value: "  Oma Ute  " },
    });
    // The submit resolves a promise, so its state updates land outside
    // the sync event — wrap in async act to flush them.
    await act(async () => {
      fireEvent.click(screen.getByTestId("pp-create-submit"));
    });

    expect(onCreate).toHaveBeenCalledWith("Oma Ute");
    expect(screen.queryByTestId("pp-create-form")).toBeNull();
    // The trigger chip is back for creating another person.
    expect(screen.getByTestId("pp-chip-new")).toBeDefined();
  });

  it("submits via the form (Enter key) too", async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    renderPicker({ onCreate });

    fireEvent.click(screen.getByTestId("pp-chip-new"));
    fireEvent.change(screen.getByTestId("pp-create-input"), {
      target: { value: "Opa Karl" },
    });
    await act(async () => {
      fireEvent.submit(screen.getByTestId("pp-create-form"));
    });

    expect(onCreate).toHaveBeenCalledWith("Opa Karl");
  });

  it("closes on Escape without creating", () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    renderPicker({ onCreate });

    fireEvent.click(screen.getByTestId("pp-chip-new"));
    fireEvent.change(screen.getByTestId("pp-create-input"), {
      target: { value: "Oma Ute" },
    });
    fireEvent.keyDown(screen.getByTestId("pp-create-input"), {
      key: "Escape",
    });

    expect(screen.queryByTestId("pp-create-form")).toBeNull();
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByTestId("pp-chip-new")).toBeDefined();
  });

  it("keeps the submit disabled while the name is blank", () => {
    renderPicker({ onCreate: vi.fn() });

    fireEvent.click(screen.getByTestId("pp-chip-new"));

    expect(screen.getByTestId("pp-create-submit")).toBeDisabled();
  });

  it("shows an error and keeps the form open when creation fails", async () => {
    const onCreate = vi.fn().mockResolvedValue(false);
    renderPicker({ onCreate });

    fireEvent.click(screen.getByTestId("pp-chip-new"));
    fireEvent.change(screen.getByTestId("pp-create-input"), {
      target: { value: "Oma Ute" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("pp-create-submit"));
    });

    expect(screen.getByTestId("pp-create-error")).toHaveTextContent(
      /nicht geklappt/i,
    );
    expect(screen.getByTestId("pp-create-form")).toBeDefined();
  });

  it("offers 'Neue Person' even when the family has no members yet", () => {
    render(
      <PersonPicker
        familyMembers={[]}
        value={undefined}
        onChange={vi.fn()}
        onCreate={vi.fn()}
        testIdPrefix="pp"
      />,
    );
    expect(screen.getByTestId("pp-chip-new")).toBeDefined();
    expect(screen.getByTestId("pp-chip-none")).toBeDefined();
  });
});

describe("unmatchedPersonName", () => {
  it("returns the name for an unlinked person the family does not know", () => {
    expect(unmatchedPersonName("Oma Ute", null, familyMembers)).toBe("Oma Ute");
  });

  it("returns null when the person is already linked", () => {
    expect(unmatchedPersonName("Emma", "m1", familyMembers)).toBeNull();
  });

  it("returns null when a member shares the name, ignoring case and spacing", () => {
    expect(unmatchedPersonName("  emma ", null, familyMembers)).toBeNull();
  });

  it("returns null for a blank name", () => {
    expect(unmatchedPersonName("   ", null, familyMembers)).toBeNull();
    expect(unmatchedPersonName(undefined, null, familyMembers)).toBeNull();
  });
});
