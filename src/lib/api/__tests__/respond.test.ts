import { describe, it, expect } from "vitest";
import {
  jsonError,
  methodNotAllowed,
  METHOD_NOT_ALLOWED_MESSAGE,
} from "@/lib/api/respond";

describe("jsonError", () => {
  it("returns the given status and a structured error body", async () => {
    const res = jsonError("Etwas ist schiefgelaufen.", "SOME_CODE", 418);
    expect(res.status).toBe(418);
    await expect(res.json()).resolves.toEqual({
      error: "Etwas ist schiefgelaufen.",
      code: "SOME_CODE",
    });
  });
});

describe("methodNotAllowed", () => {
  it("returns 405 with the default German message", async () => {
    const res = methodNotAllowed();
    expect(res.status).toBe(405);
    await expect(res.json()).resolves.toEqual({
      error: METHOD_NOT_ALLOWED_MESSAGE,
      code: "METHOD_NOT_ALLOWED",
    });
  });

  it("accepts a custom message", async () => {
    const res = methodNotAllowed("Methode nicht erlaubt.");
    await expect(res.json()).resolves.toEqual({
      error: "Methode nicht erlaubt.",
      code: "METHOD_NOT_ALLOWED",
    });
  });
});
