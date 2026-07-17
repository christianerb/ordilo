import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Supabase login email", () => {
  it("matches the six-digit scanner-safe code flow", () => {
    const config = readFileSync(
      resolve(process.cwd(), "supabase/config.toml"),
      "utf8",
    );
    const template = readFileSync(
      resolve(process.cwd(), "supabase/templates/magic_link.html"),
      "utf8",
    );

    expect(config).toMatch(/otp_length\s*=\s*6/);
    expect(template).toContain("{{ .Token }}");
    expect(template).not.toContain("{{ .ConfirmationURL }}");
  });
});
