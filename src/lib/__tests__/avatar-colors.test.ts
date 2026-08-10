import { describe, expect, it } from "vitest";
import {
  getAvatarTextColor,
  resolveAvatarColor,
} from "@/lib/avatar-colors";

describe("avatar colors", () => {
  it("uses the trusted petrol fallback for invalid legacy values", () => {
    expect(resolveAvatarColor("not-a-color")).toBe("#305460");
    expect(resolveAvatarColor(null)).toBe("#305460");
  });

  it("uses the dark ink on light and apricot avatar colors", () => {
    expect(getAvatarTextColor("#F0B4A0")).toBe("#201E1B");
    expect(getAvatarTextColor("#E46018")).toBe("#201E1B");
  });

  it("uses the warm paper ink on dark avatar colors", () => {
    expect(getAvatarTextColor("#305460")).toBe("#FDFCFA");
  });
});
