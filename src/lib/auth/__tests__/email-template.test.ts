import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/auth/constants";

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

    expect(config).toContain('site_url = "https://app.ordilo.de"');
    expect(config).toContain('"https://app.ordilo.de/auth/callback"');
    expect(config).toMatch(/max_frequency\s*=\s*"1m"/);
    expect(config).toMatch(/otp_length\s*=\s*6/);
    expect(EMAIL_OTP_RESEND_COOLDOWN_SECONDS).toBe(60);
    expect(template).toContain("{{ .Token }}");
    expect(template).not.toContain("{{ .ConfirmationURL }}");
  });
});
