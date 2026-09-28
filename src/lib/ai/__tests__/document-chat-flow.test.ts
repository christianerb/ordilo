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
function context(otherDocuments: Array<{ id: string; title: string }> = []): ToolContext {
  const from = vi.fn((table: string) => {
    const rows = table === "documents" ? [{ id, title: "Abo-Bestätigung Hannah", document_type: "contract", summary: "Ticket", category: "Mobilität" },
      ...otherDocuments.map(document => ({ ...document, document_type: "contract", summary: "", category: "Mobilität" }))] :
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
  it('keeps documents listed for another part of the question openable', async () => {
    const other = { id: '10000000-0000-4000-8000-000000000002', title: 'Handyvertrag' };
    const complete = `${claim.text}\n\nAls Verträge habt ihr außerdem den Handyvertrag.`;
    create.mockResolvedValueOnce(round('answer_from_documents',{claims:[claim],state:'answered'}))
      .mockResolvedValueOnce(round('list_documents',{document_type:'contract'}))
      .mockResolvedValueOnce(finalAnswer(complete));
    const result = await events(context([other]),'Wie lange gilt Hannahs Ticket und welche Verträge habt ihr sonst?');
    const sources = result.find(event => event.type === 'sources').sources;
    expect(sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ document_id: id, quote, cited: true }),
      expect.objectContaining({ document_id: other.id, title: other.title }),
    ]));
    // The quoted document keeps its passage instead of gaining a second,
    // quoteless entry from the listing that also found it.
    expect(sources.filter((source: { document_id: string }) => source.document_id === id)).toHaveLength(1);
  });

  it('does not let final synthesis overwrite the verified document date', async () => {
    const wrong = 'Hannahs Ticket gilt bis zum 31. August 2099.';
    create.mockResolvedValueOnce(round('answer_from_documents',{claims:[claim],state:'answered'}))
      .mockResolvedValueOnce(finalAnswer(wrong)).mockResolvedValueOnce({output_text:wrong});
    const result = await events(context());
    const answer = result.filter(event => event.type === 'text').map(event => event.content).join('');
    expect(answer).toContain(claim.text);
    expect(answer).not.toContain('2099');
    // A single-part question is fully answered by the verified claim alone.
    expect(answer).not.toContain('weiteren Teil');
    expect(result).toContainEqual({type:'response_state',state:'answered'});
  });

  it('does not let final synthesis add a sum the model computed itself', async () => {
    const computed = `${claim.text}\n\nBeide Tickets zusammen kosten 62,34 € im Monat.`;
    create.mockResolvedValueOnce(round('answer_from_documents',{claims:[claim],state:'answered'}))
      .mockResolvedValueOnce(finalAnswer(computed)).mockResolvedValueOnce({output_text:computed});
    const result = await events(context());
    const answer = result.filter(event => event.type === 'text').map(event => event.content).join('');
    expect(answer).toContain(claim.text);
    expect(answer).not.toContain('62,34');
    expect(result).toContainEqual({type:'response_state',state:'answered'});
  });

  it('shows the gap the model named instead of the generic partial tail', async () => {
    const gap = 'Eine Gesamtsumme für beide Anmeldungen steht nicht in der Unterlage.';
    const computed = `${claim.text}\n\nBeide Tickets zusammen kosten 62,34 € im Monat.`;
    create.mockResolvedValueOnce(round('answer_from_documents',{claims:[claim],state:'partial',gap}))
      .mockResolvedValueOnce(finalAnswer(computed)).mockResolvedValueOnce({output_text:computed});
    const result = await events(context(),'Wie lange gilt Hannahs Ticket und was kostet die Verlängerung zusammen?');
    const answer = result.filter(event => event.type === 'text').map(event => event.content).join('');
    expect(answer).toContain(claim.text);
    expect(answer).toContain(gap);
    expect(answer).not.toContain('Den weiteren Teil deiner Frage konnte ich noch nicht verlässlich beantworten');
    expect(result).toContainEqual({type:'response_state',state:'partial'});
  });

  it('accepts a final answer that joins the verified fact to its closing beat with a dash', async () => {
    const voiced = 'Hannahs Ticket gilt bis zum **31. August 2027** — das steht so auf der Abo-Bestätigung. Bis dahin hast du also noch Zeit.';
    create.mockResolvedValueOnce(round('answer_from_documents',{claims:[claim],state:'answered'})).mockResolvedValueOnce(finalAnswer(voiced));
    const result = await events(context());
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.filter(event => event.type === 'text')).toEqual([{type:'text',content:voiced}]);
    expect(result).toContainEqual({type:'response_state',state:'answered'});
  });

  it('keeps a claim verified in the last forced round as a full answer', async () => {
    const wrongQuote = { ...claim, quote: 'Hannahs Ticket ist unbegrenzt gültig.' };
    create.mockResolvedValueOnce(round('answer_from_documents',{claims:[wrongQuote],state:'answered'}))
      .mockResolvedValueOnce(round('answer_from_documents',{claims:[wrongQuote],state:'answered'}))
      .mockResolvedValueOnce(round('answer_from_documents',{claims:[wrongQuote],state:'answered'}))
      .mockResolvedValueOnce(round('answer_from_documents',{claims:[claim],state:'answered'}));
    const result = await events(context());
    expect(create).toHaveBeenCalledTimes(4);
    const answer = result.filter(event => event.type === 'text' || event.type === 'replace').map(event => event.content).join('');
    expect(answer).toBe(claim.text);
    expect(result).toContainEqual({type:'response_state',state:'answered'});
    expect(result.find(event => event.type === 'sources').sources[0]).toMatchObject({ cited: true, highlight: '31.08.2027' });
  });

  it('marks the fallback partial when the question asks for more than the document claim', async () => {
    const wrong = 'Hannahs Ticket gilt bis zum 31. August 2099.';
    create.mockResolvedValueOnce(round('answer_from_documents',{claims:[claim],state:'answered'}))
      .mockResolvedValueOnce(finalAnswer(wrong)).mockResolvedValueOnce({output_text:wrong});
    const result = await events(context(),'Wie lange gilt Hannahs Ticket und warum gibt es das überhaupt?');
    const answer = result.filter(event => event.type === 'text').map(event => event.content).join('');
    expect(answer).toContain(claim.text);
    expect(answer).toContain('weiteren Teil');
    expect(result).toContainEqual({type:'response_state',state:'partial'});
  });

  it('keeps a partial state the model set after verifying the claim', async () => {
    const wrong = 'Hannahs Ticket gilt bis zum 31. August 2099.';
    create.mockResolvedValueOnce(batch([{name:'answer_from_documents',args:{claims:[claim],state:'answered'}},{name:'set_response_state',args:{state:'partial'}}]))
      .mockResolvedValueOnce(finalAnswer(wrong)).mockResolvedValueOnce({output_text:wrong});
    const result = await events(context());
    const answer = result.filter(event => event.type === 'text').map(event => event.content).join('');
    expect(answer).toContain(claim.text);
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

  it('ends an action turn with the card ask instead of a document fallback', async () => {
    const cardAsk = "Bitte bestätige: Soll ich die Aufgabe 'Fahrradkette ölen' anlegen?";
    create.mockResolvedValueOnce(round('add_task',{title:'Fahrradkette ölen',confirmed:false}))
      .mockImplementation(async () => finalAnswer('Ich sehe in euren Unterlagen nach.'));
    const result = await events(context(),'Richte eine Erinnerung ein: Fahrradkette ölen.');
    // The first round still grounds in the documents; once the write card
    // is pending, forcing another tool call would only make the model
    // circle a verification its answer does not need.
    expect(create.mock.calls[0][0].tool_choice).toBe('required');
    expect(create.mock.calls[1][0].tool_choice).toBe('auto');
    expect(result.find(event => event.type === 'confirmation_request')).toMatchObject({
      tool_name:'add_task',
      needs_confirmation:true,
      task_title:'Fahrradkette ölen',
      message:cardAsk,
    });
    expect(result.find(event => event.type === 'confirmation_request').action_args).toMatchObject({ title:'Fahrradkette ölen', confirmed:false });
    expect(result).toContainEqual({type:'text',content:cardAsk});
    expect(result.filter(event => event.type === 'text').map(event => event.content).join('')).not.toContain('eindeutig zuordnen');
    expect(result).toContainEqual({type:'sources',sources:[]});
    expect(result).toContainEqual({type:'response_state',state:'answered'});
    expect(result.some(event => event.type === 'error')).toBe(false);
    expect(result.at(-1)).toEqual({type:'done'});
  });

  it('keeps the found evidence when a round degenerates without a card', async () => {
    create.mockResolvedValueOnce((async function* () {
      yield { type:'response.incomplete', response:{ incomplete_details:{ reason:'max_messages' }, usage:{}, output:[] } };
    })());
    const result = await events(context(),'Verschieb Hannahs Elternabend auf nächsten Montag.');
    const answer = result.filter(event => event.type === 'text' || event.type === 'replace').map(event => event.content).join('');
    expect(answer).toContain('Unterlagen');
    expect(result.some(event => event.type === 'error')).toBe(false);
    expect(result).toContainEqual({type:'response_state',state:'partial'});
    expect(result.find(event => event.type === 'sources').sources.length).toBeGreaterThan(0);
    expect(result.at(-1)).toEqual({type:'done'});
  });

  it('keeps a pending write card usable when the next model round degenerates', async () => {
    create.mockResolvedValueOnce(round('add_task',{title:'Fahrradkette ölen',confirmed:false}))
      .mockResolvedValueOnce((async function* () {
        yield { type:'response.incomplete', response:{ incomplete_details:{ reason:'max_messages' }, usage:{}, output:[] } };
      })());
    const result = await events(context(),'Richte eine Erinnerung ein: Fahrradkette ölen.');
    expect(result).toContainEqual({type:'text',content:"Bitte bestätige: Soll ich die Aufgabe 'Fahrradkette ölen' anlegen?"});
    expect(result).toContainEqual({type:'response_state',state:'answered'});
    expect(result.some(event => event.type === 'error')).toBe(false);
    expect(result.at(-1)).toEqual({type:'done'});
  });

  it('keeps a verified document answer next to the pending card when the round degenerates', async () => {
    const cardAsk = "Bitte bestätige: Soll ich die Aufgabe 'Fahrradkette ölen' anlegen?";
    create.mockResolvedValueOnce(round('answer_from_documents',{claims:[claim],state:'answered'}))
      .mockResolvedValueOnce(round('add_task',{title:'Fahrradkette ölen',confirmed:false}))
      .mockResolvedValueOnce((async function* () {
        yield { type:'response.incomplete', response:{ incomplete_details:{ reason:'max_messages' }, usage:{}, output:[] } };
      })());
    const result = await events(context(),'Wie lange gilt Hannahs Ticket und richt eine Erinnerung ein: Fahrradkette ölen.');
    const answer = result.filter(event => event.type === 'text' || event.type === 'replace').map(event => event.content).join('');
    expect(answer).toContain(claim.text);
    expect(answer).toContain(cardAsk);
    expect(result).toContainEqual({type:'response_state',state:'answered'});
    expect(result.find(event => event.type === 'sources').sources).toEqual(expect.arrayContaining([expect.objectContaining({document_id:id,quote,cited:true})]));
    expect(result.some(event => event.type === 'error')).toBe(false);
    expect(result.at(-1)).toEqual({type:'done'});
  });

  it('keeps the honest document fallback next to a card when the lookup never finished', async () => {
    create.mockResolvedValueOnce(round('read_document',{document_id:id,question:'Fahrradkette'}))
      .mockResolvedValueOnce(round('add_task',{title:'Fahrradkette ölen',confirmed:false}))
      .mockResolvedValueOnce((async function* () {
        yield { type:'response.incomplete', response:{ incomplete_details:{ reason:'max_messages' }, usage:{}, output:[] } };
      })());
    const result = await events(context(),'Richte eine Erinnerung ein: Fahrradkette ölen.');
    const answer = result.filter(event => event.type === 'text' || event.type === 'replace').map(event => event.content).join('');
    expect(answer).toContain('eindeutig zuordnen');
    expect(answer).toContain("Fahrradkette ölen");
    expect(result).toContainEqual({type:'response_state',state:'partial'});
    expect(result.find(event => event.type === 'sources').sources.length).toBeGreaterThan(0);
    expect(result.some(event => event.type === 'error')).toBe(false);
    expect(result.at(-1)).toEqual({type:'done'});
  });

});
