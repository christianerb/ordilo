import { describe, expect, it } from "vitest";
import {
  EMAIL_BODY_MAX_CHARS,
  htmlToPlainText,
  plainTextFromEmail,
} from "@/lib/inbound-email-text";

describe("inbound email text", () => {
  it("prefers the plain-text part", () => {
    expect(plainTextFromEmail("Termin am 4. März", "<p>egal</p>")).toBe(
      "Termin am 4. März",
    );
  });

  it("falls back to the HTML part when there is no text part", () => {
    expect(
      plainTextFromEmail(
        "   ",
        "<p>U7 am 4. M&auml;rz</p><p>um 10:30 Uhr</p>",
      ),
    ).toBe("U7 am 4. März\num 10:30 Uhr");
  });

  it("returns null when there is nothing to read", () => {
    expect(plainTextFromEmail(null, null)).toBeNull();
    expect(plainTextFromEmail("", "<div>  </div>")).toBeNull();
  });

  it("caps the body so one long thread cannot dominate the prompt", () => {
    const body = plainTextFromEmail("x".repeat(EMAIL_BODY_MAX_CHARS + 500), null);
    expect(body).toHaveLength(EMAIL_BODY_MAX_CHARS);
  });

  it("drops markup plumbing instead of reading it as words", () => {
    expect(
      htmlToPlainText(
        "<style>p{color:red}</style><script>alert(1)</script><p>Elternabend</p>",
      ),
    ).toBe("Elternabend");
  });

  it("decodes the entities German mail templates actually use", () => {
    expect(htmlToPlainText("<p>Gr&#xFC;&#223;e aus M&uuml;nchen</p>")).toBe(
      "Grüße aus München",
    );
  });

  it("keeps a label and its value on separate lines", () => {
    expect(htmlToPlainText("<div>Wann</div><div>Dienstag</div>")).toBe(
      "Wann\nDienstag",
    );
  });
});
