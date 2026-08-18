import { describe, expect, it } from "vitest";
import {
  familyInboundEmail,
  inboundAliasCandidates,
  normalizeInboundDomain,
} from "@/lib/family-inbound-email";

describe("family inbound email", () => {
  const alias = "dokumente+0123456789abcdef0123456789abcdef";

  it("builds a private address for a configured receiving domain", () => {
    expect(familyInboundEmail(alias, " Mail.Ordilo.de ")).toBe(
      "dokumente+0123456789abcdef0123456789abcdef@mail.ordilo.de",
    );
  });

  it("does not produce an address for an invalid alias or domain", () => {
    expect(familyInboundEmail("familie", "mail.ordilo.de")).toBeNull();
    expect(familyInboundEmail(alias, "localhost")).toBeNull();
  });

  it("only recognizes aliases sent to the configured domain", () => {
    expect(
      inboundAliasCandidates(
        [
          `Ordilo Familie <${alias}@mail.ordilo.de>`,
          `${alias}@mail.ordilo.de`,
          `${alias}@other.example`,
          "dokumente+not-for-this-domain@mail.ordilo.de",
        ],
        "mail.ordilo.de",
      ),
    ).toEqual([
      alias,
      "dokumente+not-for-this-domain",
    ]);
  });

  it("normalizes a configured domain without retaining its @ prefix", () => {
    expect(normalizeInboundDomain("@MAIL.ORDILO.DE")).toBe("mail.ordilo.de");
  });
});
