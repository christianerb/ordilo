import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createAdminSessionValue,
  isAllowedAdminEmail,
  readAdminSession,
  verifyAdminAccessCode,
} from "@/lib/admin/access";

const originalEnv = {
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  ADMIN_ACCESS_CODE: process.env.ADMIN_ACCESS_CODE,
  ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
};

describe("admin access", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = "admin@example.com, second@example.com";
    process.env.ADMIN_ACCESS_CODE = "correct-long-access-code";
    process.env.ADMIN_SESSION_SECRET = "a-very-long-random-session-secret-value";
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("matches allowlisted email addresses case-insensitively", () => {
    expect(isAllowedAdminEmail("ADMIN@example.com")).toBe(true);
    expect(isAllowedAdminEmail("person@example.com")).toBe(false);
  });

  it("verifies only the configured access code", () => {
    expect(verifyAdminAccessCode("correct-long-access-code")).toBe(true);
    expect(verifyAdminAccessCode("wrong-code")).toBe(false);
  });

  it("binds a signed session to its admin user", () => {
    const session = createAdminSessionValue("admin-user-id");

    expect(readAdminSession(session, "admin-user-id")).toBe(true);
    expect(readAdminSession(session, "another-user-id")).toBe(false);
    expect(readAdminSession(`${session}tampered`, "admin-user-id")).toBe(false);
  });
});
