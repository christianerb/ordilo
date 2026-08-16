import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges plain class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("handles conditional classes via clsx", () => {
    const isVisible = true;
    expect(cn("base", false && "hidden", isVisible && "block")).toBe(
      "base block",
    );
  });

  it("resolves Tailwind conflicts via tailwind-merge", () => {
    // The later class should win for the same property
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
  });

  it("handles empty and undefined inputs", () => {
    expect(cn(undefined, null, "")).toBe("");
  });

  it("combines conditional and conflicting classes correctly", () => {
    expect(cn("p-2", isActive() && "p-4", "text-center")).toBe(
      "p-4 text-center",
    );
  });

  // -------------------------------------------------------------------------
  // Ordilo radius scale
  // -------------------------------------------------------------------------
  //
  // tailwind-merge only resolves conflicts between classes it recognises.
  // Until the `--radius-ordilo-*` scale was registered in `cn`, an Ordilo
  // radius did not count as a border-radius utility: it survived alongside a
  // plain `rounded-*` and the winner was decided by stylesheet order.

  it("resolves Ordilo radii against Tailwind's own radius scale", () => {
    expect(cn("rounded-lg", "rounded-ordilo-xl")).toBe("rounded-ordilo-xl");
    expect(cn("rounded-ordilo-xl", "rounded-lg")).toBe("rounded-lg");
  });

  it("resolves Ordilo radii against each other", () => {
    expect(cn("rounded-ordilo-sm", "rounded-ordilo-md")).toBe(
      "rounded-ordilo-md",
    );
  });

  it("treats a side-specific radius as its own group", () => {
    expect(cn("rounded-t-lg", "rounded-t-ordilo-xl")).toBe(
      "rounded-t-ordilo-xl",
    );
    // A top radius and an all-corner radius are different groups, so both stay.
    expect(cn("rounded-ordilo-md", "rounded-t-ordilo-xl")).toBe(
      "rounded-ordilo-md rounded-t-ordilo-xl",
    );
  });

  it("only dedupes within the same variant chain", () => {
    expect(cn("max-w-md", "lg:max-w-xl")).toBe("max-w-md lg:max-w-xl");
  });
});

function isActive() {
  return true;
}
