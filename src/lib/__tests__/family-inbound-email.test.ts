import { describe, expect, it } from "vitest";
import {
  familyInboundEmail,
  inboundAliasCandidates,
  isInboundLocalPart,
  normalizeInboundDomain,
} from "@/lib/family-inbound-email";

describe("family inbound email", () => {
  const alias = "post-4m7q2x9kha";
  const legacyAlias = "dokumente+0123456789abcdef0123456789abcdef";

  it("builds a private address for a configured receiving domain", () => {
    expect(familyInboundEmail(alias, " Ordilo.de ")).toBe(
      "post-4m7q2x9kha@ordilo.de",
    );
  });

  it("keeps building the legacy address a family may already have saved", () => {
    expect(familyInboundEmail(legacyAlias, "ordilo.de")).toBe(
      `${legacyAlias}@ordilo.de`,
    );
  });

  it("does not produce an address for an invalid alias or domain", () => {
    expect(familyInboundEmail("familie", "ordilo.de")).toBeNull();
    expect(familyInboundEmail(alias, "localhost")).toBeNull();
  });

  it("rejects short codes with ambiguous characters or the wrong length", () => {
    // i, l, o and u are deliberately not in the alphabet.
    expect(isInboundLocalPart("post-4m7q2x9khi")).toBe(false);
    expect(isInboundLocalPart("post-4m7q2x9kh")).toBe(false);
    expect(isInboundLocalPart("post-4m7q2x9khab")).toBe(false);
  });

  it("only recognizes well-formed aliases on the configured domain", () => {
    expect(
      inboundAliasCandidates(
        [
          `Ordilo Familie <${alias}@ordilo.de>`,
          `${alias}@ordilo.de`,
          `${alias}@other.example`,
          // The receiving domain is a catch-all, so these arrive too and must
          // never reach the database.
          "hallo@ordilo.de",
          "post-nicht-echt@ordilo.de",
        ],
        "ordilo.de",
      ),
    ).toEqual([alias]);
  });

  it("normalizes a configured domain without retaining its @ prefix", () => {
    expect(normalizeInboundDomain("@ORDILO.DE")).toBe("ordilo.de");
  });
});
