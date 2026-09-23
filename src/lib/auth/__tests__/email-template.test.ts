import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/auth/constants";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Supabase login email", () => {
  it("matches the six-digit scanner-safe code flow", () => {
    const config = read("supabase/config.toml");

    expect(config).toContain('site_url = "https://ordilo.de"');
    expect(config).toContain('"https://ordilo.de/auth/callback"');
    expect(config).not.toContain("app.ordilo.de");
    expect(config).toMatch(/max_frequency\s*=\s*"1m"/);
    expect(config).toMatch(/otp_length\s*=\s*6/);
    expect(EMAIL_OTP_RESEND_COOLDOWN_SECONDS).toBe(60);
  });

  it.each([
    ["magic_link", "supabase/templates/magic_link.html"],
    ["confirmation", "supabase/templates/confirmation.html"],
  ])("sends a German code, never a link, in the %s email", (name, path) => {
    const config = read("supabase/config.toml");
    const template = read(path);

    expect(config).toContain(`[auth.email.template.${name}]`);
    expect(config).toContain(`content_path = "./${path}"`);
    expect(template).toContain("{{ .Token }}");
    expect(template).not.toContain("{{ .ConfirmationURL }}");
    expect(template).toContain("Code");
  });
});
