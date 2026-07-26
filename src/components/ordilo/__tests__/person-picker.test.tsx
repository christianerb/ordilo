import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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
