import { describe, expect, it } from "vitest";
import {
  buildWhatsAppHref,
  contactInputSchema,
  normalizePhoneForLink,
  whatsappNumber,
} from "@/lib/contacts";

describe("contact actions", () => {
  it("keeps a leading plus for dialer links", () => {
    expect(normalizePhoneForLink("+49 (176) 123 45")).toBe("+4917612345");
  });

  it("requires an international number for WhatsApp", () => {
    expect(whatsappNumber("0176 12345")).toBeNull();
    expect(whatsappNumber("+49 176 12345")).toBe("4917612345");
  });

  it("encodes the message as a draft and never as a send action", () => {
    expect(buildWhatsAppHref("+49 176 12345", "Wir kommen später.")).toBe(
      "https://wa.me/4917612345?text=Wir%20kommen%20sp%C3%A4ter.",
    );
  });

  it("requires one direct contact channel", () => {
    expect(
      contactInputSchema.safeParse({
        name: "Ursula",
        organization: "",
        role: "",
        phone: "",
        email: "",
      }).success,
    ).toBe(false);
  });

  it("rejects phone labels without a callable number", () => {
    expect(
      contactInputSchema.safeParse({
        name: "Kita",
        organization: "",
        role: "",
        phone: "Zentrale",
        email: "",
      }).success,
    ).toBe(false);
  });
});
