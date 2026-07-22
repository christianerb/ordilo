import { describe, expect, it } from "vitest";
import { findSourceLocation } from "@/lib/source-locations";

const layout = {
  children: [
    {
      block_type: "Text",
      html: "<p>Bewilligt bis zum 31.12.2028</p>",
      bbox: [10, 20, 190, 50],
    },
    {
      block_type: "Text",
      html: "<p>Familieneigenanteil: 11,00 Euro monatlich</p>",
      bbox: [10, 80, 210, 110],
    },
  ],
};

describe("findSourceLocation", () => {
  it("returns normalized bounds for one unambiguous OCR block", () => {
    expect(findSourceLocation(layout, 1, "11,00 Euro")).toEqual({
      pageNumber: 1,
      bounds: {
        left: 0,
        top: 0.6666666666666666,
        width: 1,
        height: 0.3333333333333333,
      },
    });
  });

  it("returns null when matching text appears in more than one block", () => {
    const repeated = {
      children: [
        ...layout.children,
        {
          block_type: "Text",
          html: "<p>11,00 Euro erneut</p>",
          bbox: [10, 120, 210, 150],
        },
      ],
    };

    expect(findSourceLocation(repeated, 1, "11,00 Euro")).toBeNull();
  });
});
