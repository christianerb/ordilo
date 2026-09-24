import { describe, expect, it, vi } from "vitest";
import type { Resend } from "resend";
import {
  forwardSupportEmail,
  matchSupportAddress,
  senderDisplayName,
  supportLocalParts,
} from "@/lib/support-mail-forward";

function fakeResend(overrides: {
  from?: string;
  replyTo?: string[] | null;
  html?: string | null;
  text?: string | null;
  attachments?: Array<{
    filename?: string;
    download_url: string;
    content_type: string;
    content_id?: string;
  }>;
} = {}) {
  const send = vi.fn().mockResolvedValue({ data: { id: "sent-1" }, error: null });
  const get = vi.fn().mockResolvedValue({
    data: {
      from: overrides.from ?? "Anna Berger <anna@example.com>",
      reply_to: overrides.replyTo ?? null,
      subject: "Frage zur App",
      html: overrides.html === undefined ? "<p>Hallo <b>Ordilo</b></p>" : overrides.html,
      text: overrides.text === undefined ? "Hallo Ordilo" : overrides.text,
    },
    error: null,
  });
  const list = vi.fn().mockResolvedValue({
    data: { data: overrides.attachments ?? [] },
    error: null,
  });
  const resend = {
    emails: { send, receiving: { get, attachments: { list } } },
  } as unknown as Resend;
  return { resend, send, get, list };
}

const base = {
  emailId: "mail-1",
  supportAddress: "info@ordilo.de",
  forwardTo: "owner@example.com",
  inboundDomain: "ordilo.de",
};

describe("supportLocalParts", () => {
  it("defaults to info and hallo", () => {
    expect(supportLocalParts(undefined)).toEqual(["info", "hallo"]);
    expect(supportLocalParts("  ")).toEqual(["info", "hallo"]);
  });

  it("reads a configured, comma separated list", () => {
    expect(supportLocalParts("Info, support")).toEqual(["info", "support"]);
  });
});

describe("matchSupportAddress", () => {
  it("finds a support address on the receiving domain", () => {
    expect(
      matchSupportAddress(["Ordilo <INFO@ordilo.de>"], "ordilo.de", ["info"]),
    ).toBe("info@ordilo.de");
  });

  it("ignores family aliases, other domains and unset domains", () => {
    expect(matchSupportAddress(["post-4m7q2x9kha@ordilo.de"], "ordilo.de", ["info"])).toBeNull();
    expect(matchSupportAddress(["info@example.com"], "ordilo.de", ["info"])).toBeNull();
    expect(matchSupportAddress(["info@ordilo.de"], undefined, ["info"])).toBeNull();
  });
});

describe("senderDisplayName", () => {
  it("uses the name and falls back to the address", () => {
    expect(senderDisplayName('"Anna Berger" <anna@example.com>')).toBe("Anna Berger");
    expect(senderDisplayName("anna@example.com")).toBe("anna@example.com");
  });

  it("drops characters that could break out of a quoted name", () => {
    expect(senderDisplayName('"Doe, Jane \\" <jane@example.com>')).toBe("Doe, Jane");
  });

});

describe("forwardSupportEmail", () => {
  it("forwards with the sender as Reply-To, a note and the attachments", async () => {
    const { resend, send } = fakeResend({
      attachments: [
        { filename: "brief.pdf", download_url: "https://files/brief.pdf", content_type: "application/pdf" },
        { filename: "logo.png", download_url: "https://files/logo.png", content_type: "image/png", content_id: "logo@mail" },
      ],
    });

    await expect(forwardSupportEmail({ resend, ...base })).resolves.toEqual({
      forwarded: true,
      id: "sent-1",
    });

    const [payload, options] = send.mock.calls[0];
    expect(payload).toMatchObject({
      from: '"Anna Berger über Ordilo" <info@ordilo.de>',
      to: "owner@example.com",
      replyTo: "Anna Berger <anna@example.com>",
      subject: "Frage zur App",
      attachments: [
        { filename: "brief.pdf", path: "https://files/brief.pdf", contentType: "application/pdf" },
        { filename: "logo.png", path: "https://files/logo.png", contentType: "image/png", contentId: "logo@mail" },
      ],
    });
    expect(payload.attachments[0]).not.toHaveProperty("contentId");
    expect(payload.text).toBe(
      "Weitergeleitet von info@ordilo.de · Absender: Anna Berger <anna@example.com>\n\nHallo Ordilo",
    );
    expect(payload.html).toContain("Absender: Anna Berger &lt;anna@example.com&gt;");
    expect(payload.html).toContain("<p>Hallo <b>Ordilo</b></p>");
    expect(options).toEqual({ idempotencyKey: "support-forward/mail-1" });
  });

  it("keeps a sender name with a comma inside one quoted From name", async () => {
    const { resend, send } = fakeResend({ from: '"Doe, Jane" <jane@example.com>' });
    await forwardSupportEmail({ resend, ...base });
    expect(send.mock.calls[0][0].from).toBe('"Doe, Jane über Ordilo" <info@ordilo.de>');
  });

  it("prefers an explicit Reply-To and sends text-only mail without html", async () => {
    const { resend, send } = fakeResend({ replyTo: ["team@example.com"], html: null });
    await forwardSupportEmail({ resend, ...base });
    const [payload] = send.mock.calls[0];
    expect(payload.replyTo).toBe("team@example.com");
    expect(payload).not.toHaveProperty("html");
    expect(payload).not.toHaveProperty("attachments");
  });

  it("never forwards to or from the receiving domain", async () => {
    const toSelf = fakeResend();
    await expect(
      forwardSupportEmail({ resend: toSelf.resend, ...base, forwardTo: "hallo@ordilo.de" }),
    ).resolves.toEqual({ forwarded: false, reason: "loop" });
    expect(toSelf.get).not.toHaveBeenCalled();

    const fromSelf = fakeResend({ from: "Ordilo <hallo@ordilo.de>" });
    await expect(forwardSupportEmail({ resend: fromSelf.resend, ...base })).resolves.toEqual({
      forwarded: false,
      reason: "loop",
    });
    expect(fromSelf.send).not.toHaveBeenCalled();
  });

  it("asks Resend for cid references so inline images keep working", async () => {
    const { resend, get } = fakeResend();
    await forwardSupportEmail({ resend, ...base });
    expect(get).toHaveBeenCalledWith("mail-1", { html_format: "cid" });
  });

  it("fails loudly on a malformed target so Resend keeps retrying", async () => {
    const { resend, get } = fakeResend();
    await expect(
      forwardSupportEmail({ resend, ...base, forwardTo: "owner-at-example.com" }),
    ).rejects.toThrow("SUPPORT_FORWARD_TO");
    expect(get).not.toHaveBeenCalled();
  });

  it("throws when Resend cannot send, so the webhook is retried", async () => {
    const { resend, send } = fakeResend();
    send.mockResolvedValueOnce({ data: null, error: { message: "rate limited" } });
    await expect(forwardSupportEmail({ resend, ...base })).rejects.toEqual({ message: "rate limited" });
  });
});
