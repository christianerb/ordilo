import { beforeEach, describe, expect, it, vi } from "vitest";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { create }; } }));
vi.mock("@/lib/ai/search", async (load) => {
  const actual = await load<typeof import("../search")>();
  return { ...actual, hybridSearch: vi.fn(async () => [{ document_id: "10000000-0000-4000-8000-000000000001", title: "Abo-Bestätigung Hannah", chunk_text: "Kundennummer: TEST-123", score: 0.9, source: "fact" }]), graphSearch: vi.fn(async () => []) };
});
import { streamAgenticAnswer } from "../chat";
import type { ToolContext } from "../tools";

const id = "10000000-0000-4000-8000-000000000001";
const quote = "Hannahs Deutschlandticket ist gültig bis 31.08.2027.";
const claim = { text: "Hannahs Ticket gilt bis zum 31. August 2027.", document_id: id, page_number: 2, quote, highlight: "31.08.2027" };
function round(name: string, args: unknown) {
  return (async function* () {
    yield { type: "response.completed", response: { output: [{ type: "function_call", name, arguments: JSON.stringify(args), call_id: crypto.randomUUID(), id: "fc_test", status: "completed" }] } };
  })();
}
function context(): ToolContext {
  const from = vi.fn((table: string) => {
    const rows = table === "documents" ? [{ id, title: "Abo-Bestätigung Hannah", document_type: "contract", summary: "Ticket", category: "Mobilität" }] :
      table === "document_pages" ? [{ page_number: 2, ocr_markdown: "Bedingungen. ".repeat(80) + "\n\n" + quote }] : [];
    const chain = {
      select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(() => chain), order: vi.fn(() => chain), limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve),
    };
    return chain;
  });
  return { client: { from } as unknown as ToolContext["client"], familyId: "family-a", sources: [], speakerName: "Christian",
    preloadedFamilyMembers: [{ name: "Hannah", role: "Tochter" }, { name: "Emma", role: "Tochter" }], preloadedFamilyMembersPrivacyReady: true };
}
async function events(ctx: ToolContext) {
  const stream = await streamAgenticAnswer("das bahndings von Hannah wie lang geht das noch?", [], ctx);
  const text = await new Response(stream).text();
  return text.trim().split("\n").map((line) => JSON.parse(line));
}
beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", "test-key"); create.mockReset(); });

describe("real document tools through the chat orchestration", () => {
  it("reads past the old excerpt cutoff and returns the verified passage in one model round", async () => {
    create.mockResolvedValueOnce(round("answer_from_documents", { claims: [claim], state: "answered" }));
    const result = await events(context());
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].tool_choice).toBe("required");
    expect(create.mock.calls[0][0].tools).not.toContainEqual(expect.objectContaining({name:"present_answer_card"}));
    expect(create.mock.calls[0][0].tools).not.toContainEqual(expect.objectContaining({name:"set_response_state"}));
    const input = create.mock.calls[0][0].input as Array<{ output?: string }>;
    expect(input.some((item) => item.output?.includes(quote))).toBe(true);
    expect(result).toContainEqual({ type: "text", content: claim.text });
    expect(result.find((event) => event.type === "sources").sources[0]).toMatchObject({ quote, page_number: 2, cited: true });
    expect(result.at(-1)).toEqual({ type: "done" });
  });
  it("returns a rejected claim to the model and accepts the corrected evidence without exposing the wrong year", async () => {
    create.mockResolvedValueOnce(round("answer_from_documents", { claims: [{ ...claim, text: "Hannahs Ticket gilt bis 31.08.2099." }], state: "answered" }))
      .mockResolvedValueOnce(round("answer_from_documents", { claims: [claim], state: "answered" }));
    const result = await events(context());
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.filter((event) => event.type === "text")).toEqual([{ type: "text", content: claim.text }]);
  });
});
