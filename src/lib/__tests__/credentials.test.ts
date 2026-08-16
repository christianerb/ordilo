import { describe, it, expect } from "vitest";
import { buildCredentialsContent } from "@/lib/credentials";

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
