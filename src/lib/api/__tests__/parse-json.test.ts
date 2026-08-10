import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api/parse-json";

const schema = z.object({ title: z.string().min(1) });

function requestWith(body: string): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("parseJsonBody", () => {
  it("returns validated data for a valid body", async () => {
    const result = await parseJsonBody(
      requestWith(JSON.stringify({ title: "Hallo" })),
      schema,
    );
    expect(result).toEqual({ ok: true, data: { title: "Hallo" } });
  });

  it("returns 400 INVALID_JSON for malformed JSON", async () => {
    const result = await parseJsonBody(requestWith("not-json{"), schema);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    await expect(result.response.json()).resolves.toEqual({
      error: "Anfrage konnte nicht gelesen werden.",
      code: "INVALID_JSON",
    });
  });

  it("returns 400 INVALID_PAYLOAD for schema mismatches", async () => {
    const result = await parseJsonBody(
      requestWith(JSON.stringify({ title: "" })),
      schema,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    await expect(result.response.json()).resolves.toEqual({
      error: "Ungültige Anfrage.",
      code: "INVALID_PAYLOAD",
    });
  });

  it("honors per-route message and code overrides", async () => {
    const result = await parseJsonBody(
      requestWith(JSON.stringify({})),
      schema,
      { invalidPayload: "Titel erforderlich.", payloadCode: "TITLE_REQUIRED" },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    await expect(result.response.json()).resolves.toEqual({
      error: "Titel erforderlich.",
      code: "TITLE_REQUIRED",
    });
  });
});
