import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useState } from "react";
import {
  maskTimeText,
  normalizeTimeText,
  TimeInput,
} from "@/components/ordilo/time-input";

describe("maskTimeText", () => {
  it("masks plain digits into HH:MM", () => {
    expect(maskTimeText("1630")).toBe("16:30");
    expect(maskTimeText("16:30")).toBe("16:30");
    expect(maskTimeText("16.30")).toBe("16:30");
  });

  it("pads a single leading hour digit above 2", () => {
    expect(maskTimeText("930")).toBe("09:30");
  });

  it("keeps the minutes when a separator follows an auto-padded hour", () => {
    expect(maskTimeText("9:30")).toBe("09:30");
    expect(maskTimeText("9.15")).toBe("09:15");
    // Re-masking its own output stays stable.
    expect(maskTimeText(maskTimeText("9:30"))).toBe("09:30");
  });

  it("clamps out-of-range segments", () => {
    expect(maskTimeText("2790")).toBe("23:59");
  });

  it("keeps partial input typeable", () => {
    expect(maskTimeText("1")).toBe("1");
    expect(maskTimeText("16")).toBe("16");
    expect(maskTimeText("163")).toBe("16:3");
  });

  it("drops non-numeric junk", () => {
    expect(maskTimeText("4 PM")).toBe("04");
    expect(maskTimeText("abc")).toBe("");
  });
});

describe("normalizeTimeText", () => {
  it("pads partial times on blur", () => {
    expect(normalizeTimeText("9:5")).toBe("09:05");
    expect(normalizeTimeText("16")).toBe("16:00");
    expect(normalizeTimeText("16:3")).toBe("16:03");
  });
});

function Harness() {
  const [value, setValue] = useState("");
  return (
    <div>
      <label htmlFor="time-harness">Beginn</label>
      <TimeInput id="time-harness" value={value} onChange={setValue} />
    </div>
  );
}

describe("TimeInput", () => {
  it("is a 24h text field, never AM/PM", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Beginn") as HTMLInputElement;
    expect(input.type).toBe("text");
    fireEvent.change(input, { target: { value: "1745" } });
    expect(input.value).toBe("17:45");
    fireEvent.blur(input);
    expect(input.value).toBe("17:45");
  });
});
