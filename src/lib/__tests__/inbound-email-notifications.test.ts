import { describe, expect, it } from "vitest";
import {
  inboundFailureEmail,
  inboundReceiptEmail,
} from "@/lib/inbound-email-notifications";
import { planInboundAttachmentImport } from "@/lib/inbound-email-import";

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

describe("inbound attachment import planning", () => {
  const attachments = [
    {
      id: "attachment-1",
      filename: "one.pdf",
      content_type: "application/pdf",
      download_url: "https://example.test/one",
    },
    {
      id: "attachment-2",
      filename: "two.pdf",
      content_type: "application/pdf",
      download_url: "https://example.test/two",
    },
  ];

  it("does not charge a previously imported attachment against a retry", () => {
    const plan = planInboundAttachmentImport({
      attachments,
      existingAttachmentIds: new Set(["attachment-1"]),
      todayDocumentCount: 50,
    });

    expect(plan.attachmentsToImport).toEqual([attachments[1]]);
    expect(plan.existingAttachmentCount).toBe(1);
    expect(plan.quotaSkippedAttachments).toBe(0);
  });
});
