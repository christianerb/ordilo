import { describe, expect, it } from "vitest";
import { signupConfirmedAt } from "../signups";

describe("signupConfirmedAt", () => {
  it("is the confirmation time, or null for an unconfirmed code request", () => {
    expect(signupConfirmedAt({ email_confirmed_at: "2026-10-22T08:00:00Z" })).toBe("2026-10-22T08:00:00Z");
    expect(signupConfirmedAt({ email_confirmed_at: undefined })).toBeNull();
  });
});
