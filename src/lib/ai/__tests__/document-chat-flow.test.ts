import { beforeEach, describe, expect, it, vi } from "vitest";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { create }; } }));
vi.mock("@/lib/ai/search", async (load) => {
  const actual = await load<typeof import("../search")>();
  return { ...actual, hybridSearch: vi.fn(async () => [{ document_id: "10000000-0000-4000-8000-000000000001", title: "Abo-Bestätigung Hannah", chunk_text: "Kundennummer: TEST-123", score: 0.9, source: "fact" }]), graphSearch: vi.fn(async () => []) };
});
vi.mock("@/lib/ai/web-search", () => ({ searchPublicWeb: vi.fn(async () => ({query:"Ticket aktueller Preis",summary:"Der Beispieltarif kostet 63 Euro.",sources:[{document_id:"web-price",title:"Tarifauskunft",excerpt:"Der Beispieltarif kostet 63 Euro.",url:"https://example.org/tarif",origin:"web",score:1}]})) }));
import { streamAgenticAnswer } from "../chat";
import type { ToolContext } from "../tools";

const id = "10000000-0000-4000-8000-000000000001";
const quote = "Hannahs Deutschlandticket ist gültig bis 31.08.2027.";
const claim = { text: "Hannahs Ticket gilt bis zum 31. August 2027.", document_id: id, page_number: 2, quote, highlight: "31.08.2027" };
function finalAnswer(text: string) {
  return (async function* () {
    yield { type: "response.output_text.delta", delta: text };
    yield { type: "response.completed", response: { output: [] } };
  })();
}
function batch(calls: Array<{name:string;args:unknown}>) {
  return (async function* () {
    yield {type:"response.completed",response:{output:calls.map(({name,args}) => ({type:"function_call",name,arguments:JSON.stringify(args),call_id:crypto.randomUUID(),id:crypto.randomUUID(),status:"completed"}))}};
  })();
}
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
async function events(ctx: ToolContext, question = "das bahndings von Hannah wie lang geht das noch?") {
  const stream = await streamAgenticAnswer(question, [], ctx);
  const text = await new Response(stream).text();
  return text.trim().split("\n").map((line) => JSON.parse(line));
}
beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", "test-key"); create.mockReset(); });

describe("real document tools through the chat orchestration", () => {
  it("reads past the old excerpt cutoff and returns the verified passage after synthesis", async () => {
    create.mockResolvedValueOnce(round("answer_from_documents", { claims: [claim], state: "answered" })).mockResolvedValueOnce(finalAnswer(claim.text));
    const result = await events(context());
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].tool_choice).toBe("auto");
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
      .mockResolvedValueOnce(round("answer_from_documents", { claims: [claim], state: "answered" })).mockResolvedValueOnce(finalAnswer(claim.text));
    const result = await events(context());
    expect(create).toHaveBeenCalledTimes(3);
    expect(result.filter((event) => event.type === "text")).toEqual([{ type: "text", content: claim.text }]);
  });
  it.each(['document-first','web-first'])('keeps both knowledge spaces from the same batch (%s)', async order => {
    const document = {name:"answer_from_documents",args:{claims:[claim],state:"answered"}};
    const web = {name:"search_web",args:{query:"Ticket aktueller Preis"}};
    const complete = `${claim.text}\n\nLaut Tarifauskunft kostet der Beispieltarif 63 Euro.`;
    create.mockResolvedValueOnce(batch(order === 'document-first' ? [document,web] : [web,document])).mockResolvedValueOnce(finalAnswer(complete));
    const ctx = context();
    const result = await events(ctx,"Wie lange gilt Hannahs Ticket und was kostet aktuell ein neues?");
    expect(ctx.sources).toEqual(expect.arrayContaining([expect.objectContaining({excerpt:"Kundennummer: TEST-123"})]));
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.filter(event => event.type === 'text')).toEqual([{type:'text',content:complete}]);
    const sources = result.find(event => event.type === 'sources').sources;
    expect(sources).toEqual(expect.arrayContaining([expect.objectContaining({document_id:id,quote,cited:true}),expect.objectContaining({document_id:'web-price',origin:'web'})]));
    expect(JSON.stringify(create.mock.calls[1][0].input)).toContain('Beispieltarif');
    expect(result.filter(event => event.type === 'done')).toHaveLength(1);
  });
  it('allows another lookup after the document fact has already validated', async () => {
    const complete = `${claim.text}\n\nEs sind keine offenen Aufgaben vorhanden.`;
    create.mockResolvedValueOnce(round('answer_from_documents',{claims:[claim],state:'answered'}))
      .mockResolvedValueOnce(round('list_tasks',{status:'open'})).mockResolvedValueOnce(finalAnswer(complete));
    const result = await events(context(),'Wie lange gilt Hannahs Ticket und welche Aufgaben sind noch offen?');
    expect(create).toHaveBeenCalledTimes(3);
    expect(result).toContainEqual({type:'tool',tool:'list_tasks',state:'done'});
    expect(result.filter(event => event.type === 'text')).toEqual([{type:'text',content:complete}]);
    expect(JSON.stringify(create.mock.calls[2][0].input)).toContain('Keine Aufgaben gefunden');
  });
  it('does not let final synthesis overwrite the verified document date', async () => {
    const wrong = 'Hannahs Ticket gilt bis zum 31. August 2099.';
    create.mockResolvedValueOnce(round('answer_from_documents',{claims:[claim],state:'answered'}))
      .mockResolvedValueOnce(finalAnswer(wrong)).mockResolvedValueOnce({output_text:wrong});
    const result = await events(context());
    const answer = result.filter(event => event.type === 'text').map(event => event.content).join('');
    expect(answer).toContain(claim.text);
    expect(answer).not.toContain('2099');
    expect(result).toContainEqual({type:'response_state',state:'partial'});
  });

  it('keeps the document fact but rejects an uncited public addition', async () => {
    const uncited = `${claim.text}\n\nEin neues Ticket kostet 63 Euro.`;
    create.mockResolvedValueOnce(batch([{name:'answer_from_documents',args:{claims:[claim],state:'answered'}},{name:'search_web',args:{query:'Ticket aktueller Preis'}}]))
      .mockResolvedValueOnce(finalAnswer(uncited)).mockResolvedValueOnce({output_text:uncited});
    const result = await events(context(),'Wie lange gilt Hannahs Ticket und was kostet aktuell ein neues?');
    const answer = result.filter(event => event.type === 'text').map(event => event.content).join('');
    expect(answer).toContain(claim.text);
    expect(answer).not.toContain('63 Euro');
    expect(result).toContainEqual({type:'response_state',state:'partial'});
    expect(result.find(event => event.type === 'sources').sources).toEqual(expect.arrayContaining([expect.objectContaining({document_id:'web-price'})]));
  });

});
