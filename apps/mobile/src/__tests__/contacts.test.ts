import {
  buildWhatsAppHref,
  contactInputSchema,
  filterContacts,
  getContactInitial,
  getContactReachLine,
  getContactSearchText,
  getContactSubtitle,
  mergeSavedContact,
  normalizePhoneForLink,
  sortContactsByName,
  splitContactsByStatus,
  whatsappNumber,
  type Contact,
} from "../lib/contacts";

const base: Contact = {
  id: "contact-1",
  family_id: "family-1",
  source_document_id: null,
  name: "Praxis Dr. Sommer",
  organization: "Hausarztpraxis",
  role: "Kinderärztin",
  phone: "+49 171 2345678",
  email: "praxis@example.de",
  status: "confirmed",
  created_at: "2026-08-01T10:00:00.000Z",
  updated_at: "2026-08-02T10:00:00.000Z",
};

const suggested: Contact = {
  ...base,
  id: "contact-2",
  name: "Ulla Schmitt",
  organization: null,
  role: "Klassenleitung",
  phone: null,
  email: "ulla@example.de",
  status: "suggested",
  source_document_id: "doc-9",
};

describe("contact input schema (ported from web)", () => {
  it("accepts a name with a phone number only", () => {
    const result = contactInputSchema.safeParse({
      name: "Oma Erna",
      phone: "+49 30 123456",
      email: "",
    });
    expect(result.success).toBe(true);
  });

  it("requires at least phone or email, with the German message", () => {
    const result = contactInputSchema.safeParse({ name: "Oma Erna" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Telefonnummer oder E-Mail-Adresse fehlt.",
      );
    }
  });

  it("rejects short phone numbers and invalid emails in German", () => {
    const phone = contactInputSchema.safeParse({ name: "A", phone: "123" });
    expect(phone.success).toBe(false);
    if (!phone.success) {
      expect(phone.error.issues[0]?.message).toBe(
        "Bitte prüfe die Telefonnummer.",
      );
    }

    const email = contactInputSchema.safeParse({
      name: "A",
      email: "keine-mail",
    });
    expect(email.success).toBe(false);
    if (!email.success) {
      expect(email.error.issues[0]?.message).toBe(
        "Bitte prüfe die E-Mail-Adresse.",
      );
    }
  });

  it("requires a name", () => {
    const result = contactInputSchema.safeParse({
      name: "   ",
      phone: "+49 30 123456",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Bitte gib einen Namen ein.",
      );
    }
  });
});

describe("phone link helpers", () => {
  it("normalizes phone numbers for tel: links", () => {
    expect(normalizePhoneForLink("+49 (0)171 234-56 78")).toBe("+4901712345678");
    expect(normalizePhoneForLink("030 123456")).toBe("030123456");
    expect(normalizePhoneForLink("abc")).toBe("");
  });

  it("builds WhatsApp links only for international numbers", () => {
    expect(whatsappNumber("+49 171 2345678")).toBe("491712345678");
    expect(whatsappNumber("0171 2345678")).toBeNull();
    expect(whatsappNumber("+49123")).toBeNull();
    expect(buildWhatsAppHref("+49 171 2345678")).toBe(
      "https://wa.me/491712345678",
    );
    expect(buildWhatsAppHref("0171 2345678")).toBeNull();
  });

  it("encodes an optional WhatsApp message draft", () => {
    expect(buildWhatsAppHref("+49 171 2345678", "Hallo du!")).toBe(
      "https://wa.me/491712345678?text=Hallo%20du!",
    );
  });
});

describe("contact list helpers", () => {
  it("splits suggested and confirmed contacts", () => {
    const { suggested: s, confirmed: c } = splitContactsByStatus([
      base,
      suggested,
    ]);
    expect(s.map((contact) => contact.id)).toEqual(["contact-2"]);
    expect(c.map((contact) => contact.id)).toEqual(["contact-1"]);
  });

  it("filters across name, organization, role, phone and email (German case)", () => {
    expect(filterContacts([base, suggested], "KINDERÄRZTIN")).toEqual([base]);
    expect(filterContacts([base, suggested], "ulla@")).toEqual([suggested]);
    expect(filterContacts([base, suggested], "0171")).toEqual([]);
    expect(filterContacts([base, suggested], "  ")).toEqual([base, suggested]);
  });

  it("sorts confirmed contacts with German locale rules", () => {
    const sorted = sortContactsByName([
      { ...base, id: "z", name: "Zimmermann" },
      { ...base, id: "a", name: "Äpfel" },
      { ...base, id: "b", name: "Berger" },
    ]);
    expect(sorted.map((contact) => contact.name)).toEqual([
      "Äpfel",
      "Berger",
      "Zimmermann",
    ]);
  });

  it("merges a saved contact by id, creating or updating", () => {
    const updated = { ...base, name: "Praxis Dr. Sommer neu" };
    expect(mergeSavedContact([base], updated)[0]?.name).toBe(
      "Praxis Dr. Sommer neu",
    );
    expect(mergeSavedContact([base], suggested)).toEqual([base, suggested]);
  });

  it("builds search text, subtitle, reach line and initial", () => {
    expect(getContactSearchText(base)).toContain("kinderärztin");
    expect(getContactSubtitle(base)).toBe("Hausarztpraxis · Kinderärztin");
    expect(getContactSubtitle({ ...base, organization: null, role: null })).toBe(
      "",
    );
    expect(getContactReachLine(base)).toBe("+49 171 2345678");
    expect(getContactReachLine({ ...base, phone: null })).toBe(
      "praxis@example.de",
    );
    expect(getContactInitial("  erna")).toBe("E");
    expect(getContactInitial("")).toBe("?");
  });
});
