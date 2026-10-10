import { describe, expect, it } from "vitest";
import {
  inboundFailureEmail,
  inboundReceiptEmail,
} from "@/lib/inbound-email-notifications";
import {
  isEmailDecoration,
  planInboundAttachmentImport,
} from "@/lib/inbound-email-import";

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

  it("skips the inline image of a forwarded thread so the text gets read", () => {
    const outlookImage = {
      id: "attachment-inline",
      filename: "image001.jpg",
      content_type: "image/jpeg",
      download_url: "https://example.test/image001",
      size: 823,
      content_disposition: "inline",
      content_id: "image001.jpg@01DC1A2B.3C4D5E60",
    };

    const plan = planInboundAttachmentImport({
      attachments: [outlookImage],
      existingAttachmentIds: new Set(),
      todayDocumentCount: 0,
    });

    expect(plan.attachmentsToImport).toEqual([]);
    expect(plan.existingAttachmentCount).toBe(0);
    expect(plan.decorationAttachments).toBe(1);
  });

  it("keeps real documents next to decoration", () => {
    const plan = planInboundAttachmentImport({
      attachments: [
        {
          id: "logo",
          filename: "logo.png",
          content_type: "image/png",
          download_url: "https://example.test/logo",
          size: 4_000,
          content_disposition: "attachment",
        },
        { ...attachments[0], size: 900, content_disposition: "attachment" },
      ],
      existingAttachmentIds: new Set(),
      todayDocumentCount: 0,
    });

    expect(plan.attachmentsToImport.map((a) => a.id)).toEqual(["attachment-1"]);
    expect(plan.decorationAttachments).toBe(1);
  });
});

describe("email decoration", () => {
  const image = {
    id: "image",
    filename: "IMG_1234.jpeg",
    content_type: "image/jpeg",
    download_url: "https://example.test/image",
  };

  it("keeps a full-size photo even when the mail client inlined it", () => {
    expect(
      isEmailDecoration({ ...image, size: 2_400_000, content_disposition: "inline" }),
    ).toBe(false);
  });

  it("treats small inline images as part of the layout", () => {
    expect(
      isEmailDecoration({ ...image, size: 30_000, content_disposition: "inline" }),
    ).toBe(true);
  });

  it("treats tiny images as decoration even when attached", () => {
    expect(
      isEmailDecoration({ ...image, size: 823, content_disposition: "attachment" }),
    ).toBe(true);
  });

  it("never drops a PDF or an image of unknown size", () => {
    expect(
      isEmailDecoration({
        ...image,
        content_type: "application/pdf",
        size: 500,
        content_disposition: "inline",
      }),
    ).toBe(false);
    expect(isEmailDecoration({ ...image, content_disposition: "inline" })).toBe(false);
  });
});
