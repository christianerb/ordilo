import { describe, expect, it } from "vitest";
import {
  inboundFailureEmail,
  inboundReceiptEmail,
} from "@/lib/inbound-email-notifications";

describe("inbound email notifications", () => {
  it("uses singular wording for one received document", () => {
    const email = inboundReceiptEmail(1, "https://app.ordilo.de");

    expect(email.subject).toBe("Dein Dokument ist bei Ordilo angekommen");
    expect(email.text).toContain("ein Dokument");
    expect(email.html).toContain("https://app.ordilo.de/dokumente");
  });

  it("uses plural wording and gives failures a recovery path", () => {
    expect(inboundReceiptEmail(2, "https://app.ordilo.de").text).toContain(
      "2 Dokumente",
    );
    expect(inboundFailureEmail("https://app.ordilo.de").text).toContain(
      "erneut versuchen",
    );
  });
});
