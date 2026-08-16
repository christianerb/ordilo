import { describe, it, expect } from "vitest";
import {
  buildCredentialsContent,
  parseCredentialsContent,
  stripCredentialFields,
} from "@/lib/credentials";

describe("buildCredentialsContent", () => {
  it("lists URL and user name above the description", () => {
    expect(
      buildCredentialsContent({
        title: "Netflix",
        url: "https://www.netflix.com",
        username: "familie@example.de",
        description: "Familienaccount, vier Profile",
      }),
    ).toBe(
      "- **URL:** https://www.netflix.com\n" +
        "- **Benutzername:** familie@example.de\n\n" +
        "Familienaccount, vier Profile",
    );
  });

  it("omits the fields that were left empty", () => {
    expect(
      buildCredentialsContent({ title: "WLAN", username: "admin" }),
    ).toBe("- **Benutzername:** admin");
  });

  it("keeps a description-only login as plain text", () => {
    expect(
      buildCredentialsContent({ title: "WLAN", description: "Zettel am Router" }),
    ).toBe("Zettel am Router");
  });

  it("falls back to the name so the body is never empty", () => {
    // The API rejects empty content, and a login may legitimately consist
    // of nothing but a name and a password.
    expect(buildCredentialsContent({ title: "WLAN" })).toBe("Zugangsdaten WLAN");
    expect(
      buildCredentialsContent({ title: "WLAN", url: "  ", username: "  " }),
    ).toBe("Zugangsdaten WLAN");
  });

  it("trims the field values", () => {
    expect(
      buildCredentialsContent({ title: "X", url: "  https://a.de  " }),
    ).toBe("- **URL:** https://a.de");
  });
});

describe("parseCredentialsContent", () => {
  it("reads back what buildCredentialsContent wrote", () => {
    const content = buildCredentialsContent({
      title: "Netflix",
      url: "https://www.netflix.com",
      username: "familie@example.de",
      description: "Familienaccount",
    });

    expect(parseCredentialsContent(content)).toEqual({
      url: "https://www.netflix.com",
      username: "familie@example.de",
    });
  });

  it("returns nulls for a body without the field layout", () => {
    expect(parseCredentialsContent("Zettel am Router")).toEqual({
      url: null,
      username: null,
    });
  });

  it("ignores the description text below the fields", () => {
    const parsed = parseCredentialsContent(
      "- **URL:** https://a.de\n\nHier steht Benutzername als Wort im Fließtext.",
    );
    expect(parsed).toEqual({ url: "https://a.de", username: null });
  });

  it("keeps the first value when a field appears twice", () => {
    const parsed = parseCredentialsContent(
      "- **Benutzername:** erste\n- **Benutzername:** zweite",
    );
    expect(parsed.username).toBe("erste");
  });
});

describe("stripCredentialFields", () => {
  it("removes the login fields and keeps the description", () => {
    const content = buildCredentialsContent({
      title: "Netflix",
      url: "https://www.netflix.com",
      username: "familie@example.de",
      description: "Familienaccount, vier Profile",
    });

    const stripped = stripCredentialFields(content);

    expect(stripped).toBe("Familienaccount, vier Profile");
    expect(stripped).not.toContain("familie@example.de");
    expect(stripped).not.toContain("netflix.com");
  });

  it("returns empty when the body was nothing but fields", () => {
    expect(
      stripCredentialFields(
        buildCredentialsContent({ title: "WLAN", username: "admin" }),
      ),
    ).toBe("");
  });

  it("leaves an ordinary note untouched", () => {
    const note = "Einkaufen:\n- Milch\n- Brot";
    expect(stripCredentialFields(note)).toBe(note);
  });
});
