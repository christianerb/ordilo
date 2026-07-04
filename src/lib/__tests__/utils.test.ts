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
});

function isActive() {
  return true;
}
