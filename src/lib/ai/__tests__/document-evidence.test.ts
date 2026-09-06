import { describe, expect, it, vi } from "vitest";
import { readDocumentEvidence, selectEvidenceWindow, verifyDocumentAnswer, type DocumentEvidence } from "../document-evidence";

const id = "10000000-0000-4000-8000-000000000001";
const quote = "Hannahs Deutschlandticket: gültig bis 31.08.2027. Kündigungsfrist: 10.08.2027.";
const pages: DocumentEvidence[] = [{ documentId: id, title: "Abo-Bestätigung Hannah", page: 2, text: quote }];
const answer = { claims: [{ text: "Hannahs Ticket gilt bis zum 31. August 2027.", document_id: id, page_number: 2, quote, highlight: "31.08.2027" }], state: "answered" };

describe("document answer evidence", () => {
  it("accepts a correct paraphrase without repeating a document title", () => {
    const result = verifyDocumentAnswer(answer, pages, ["Hannah", "Emma"]);
    expect(result).toMatchObject({ text: answer.claims[0].text, sources: [{ page_number: 2, quote, cited: true }], state: "answered" });
  });
  it.each([
    ["invented year", { text: "Laut Abo-Bestätigung Hannah gilt das Ticket bis 31.08.2099." }],
    ["wrong page", { page_number: 3 }],
    ["wrong person", { text: "Emmas Ticket gilt bis 31.08.2027." }],
    ["invented quotation", { quote: "Hannahs Ticket ist kostenlos gültig bis 31.08.2027." }],
    ["cancellation date used as validity", { text: "Hannahs Ticket gilt bis 10.08.2027.", highlight: "10.08.2027" }],
    ["foreign document", { document_id: "10000000-0000-4000-8000-000000000002" }],
    ["invented highlight", { highlight: "Kostenlos" }],
  ])("rejects %s", (_name, changes) => {
    expect(verifyDocumentAnswer({ ...answer, claims: [{ ...answer.claims[0], ...changes }] }, pages, ["Hannah", "Emma"])).toHaveProperty("error");
  });
  it("requires evidence for every claim, not just one document title", () => {
    expect(verifyDocumentAnswer({ ...answer, claims: [answer.claims[0], { ...answer.claims[0], text: "Die Kosten betragen 99 Euro." }] }, pages)).toHaveProperty("error");
  });
  it("keeps distinct sources for conflicting records", () => {
    const second = { ...pages[0], page: 3, text: "Hannahs Deutschlandticket: gültig bis 30.09.2027." };
    const result = verifyDocumentAnswer({ ...answer, state: "conflict", claims: [answer.claims[0], {
      text: "Die Verlängerung nennt den 30.09.2027.", document_id: id, page_number: 3, quote: second.text,
    }], gap: "Die Unterlagen nennen unterschiedliche Enddaten." }, [...pages, second]);
    expect(result).toMatchObject({ state: "conflict", sources: [{ page_number: 2 }, { page_number: 3 }] });
  });
  it("finds a relevant later paragraph beyond the old 500-character cutoff", () => {
    const text = "Allgemeine Bedingungen. ".repeat(600) + "\n\n" + quote;
    expect(selectEvidenceWindow(text, "Hannah Deutschlandticket gültig", 1_500)).toContain(quote);
  });
});

function database(doc: unknown, pages: unknown[] = []) {
  const filters: Array<[string, unknown]> = [];
  const from = vi.fn((table: string) => {
    const result = table === "documents" ? doc : pages;
    const chain = {
      select: vi.fn(() => chain), eq: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return chain; }),
      order: vi.fn(() => chain), limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: result, error: null })),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: result, error: null }).then(resolve),
    };
    return chain;
  });
  return { client: { from } as unknown as Parameters<typeof readDocumentEvidence>[0], from, filters };
}

describe("reading original pages", () => {
  it("scopes a confirmed document to the active family before reading pages", async () => {
    const db = database({ id, title: "Ticket", document_type: "contract" }, [{ page_number: 2, ocr_markdown: quote }]);
    expect(await readDocumentEvidence(db.client, "family-a", id, "Ticket" )).toMatchObject([{ page: 2, text: quote }]);
    expect(db.filters).toEqual(expect.arrayContaining([["family_id", "family-a"], ["status", "confirmed"], ["document_id", id]]));
  });
  it.each([null, { id, document_type: "credentials", ocr_text: "secret" }])("does not read inaccessible or credential pages", async (doc) => {
    const db = database(doc);
    expect(await readDocumentEvidence(db.client, "family-a", id, "Ticket")).toEqual([]);
    expect(db.from).toHaveBeenCalledTimes(1);
  });
  it("does not invent a page number for legacy combined OCR", async () => {
    const db = database({ id, title: "Ticket", document_type: "contract", ocr_text: quote });
    expect(await readDocumentEvidence(db.client, "family-a", id, "Ticket")).toMatchObject([{ page: null }]);
    expect(await readDocumentEvidence(db.client, "family-a", id, "Ticket", 9)).toEqual([]);
  });
});

it("reads only a strict validity line from a misclassified ticket, never adjacent credentials", async () => {
  const line = "**Gültig 03.09.2026 bis 30.09.2026**";
  const db = database({ id, title: "Deutschlandticket Hanna", document_type: "credentials" }, [{ page_number: 1, ocr_markdown: "Passwort: NEVER-EXPOSE\n" + line + "\nBenutzername: private@example.test" }]);
  const evidence = await readDocumentEvidence(db.client, "family-a", id, "Ticket");
  expect(evidence).toMatchObject([{ text: line, page: 1 }]);
  expect(verifyDocumentAnswer({ state: "answered", claims: [{ text: "Hannas Ticket gilt bis 30. September 2026.", document_id: id, page_number: 1, quote: line, highlight: "30.09.2026" }] }, evidence)).toMatchObject({ state: "answered" });
});
it("rejects credentials appended to an otherwise valid ticket line", async () => {
  const db = database({ id, title: "Deutschlandticket Hanna", document_type: "credentials" }, [{ page_number: 1, ocr_markdown: "Gültig bis 30.09.2026 Passwort: NEVER-EXPOSE" }]);
  expect(await readDocumentEvidence(db.client, "family-a", id, "Ticket")).toEqual([]);
});
it("allows a specific missing-information answer without invented facts", () => {
  expect(verifyDocumentAnswer({ claims: [], state: "not_found", gap: "In den gelesenen Unterlagen steht kein Kündigungstermin." }, pages)).toMatchObject({ state: "not_found", sources: [] });
  expect(verifyDocumentAnswer({ claims: [], state: "answered", gap: "Fehlt." }, pages)).toHaveProperty("error");
});

it("does not turn a validity start into the end of a ticket", () => {
  const quote = "Gültig 03.09.2026 bis 30.09.2026";
  expect(verifyDocumentAnswer({ state: "answered", claims: [{ text: "Das Ticket gilt bis 03.09.2026.", document_id: id, page_number: 1, quote }] }, [{ documentId: id, title: "Ticket", page: 1, text: quote }])).toHaveProperty("error");
});


it("reads other facts from a scanned ticket misclassified as credentials", async () => {
  const text = "Deutschlandticket Hannah\nGültig bis 30.09.2027\nKündigung bis 10.09.2027";
  const db = database({ id, title: "Deutschlandticket Hannah", document_type: "credentials", source: "upload", file_url: "synthetic.pdf", ocr_text: text }, [{page_number:1,ocr_markdown:text}]);
  expect(await readDocumentEvidence(db.client,"family-a",id,"Kündigung")).toMatchObject([{text,hasOriginal:true}]);
});
it("preserves the no-original flag in a verified answer", () => {
  const result = verifyDocumentAnswer(answer, pages.map(page => ({...page,hasOriginal:false})), ["Hannah","Emma"]);
  expect(result).toMatchObject({sources:[{has_original:false}]});
});

it("rejects an address-only answer to a meeting-time question", () => {
  const quote = "Treffpunkt: 08:15 Uhr am Hauptbahnhof, Gleis 7.";
  const pages = [{documentId:id,title:"Klassenfahrt",page:1,text:quote}];
  const claim = {text:"Der Treffpunkt ist am Hauptbahnhof, Gleis 7.",document_id:id,page_number:1,quote};
  expect(verifyDocumentAnswer({state:"answered",claims:[claim]},pages,[],"Und wann ist der Treffpunkt?")).toHaveProperty("error");
  expect(verifyDocumentAnswer({state:"answered",claims:[claim]},pages,[],"Wo ist der Treffpunkt?")).toMatchObject({state:"answered"});
  expect(verifyDocumentAnswer({state:"answered",claims:[{...claim,text:"Der Treffpunkt ist um 08:15 Uhr."}]},pages,[],"Und wann ist der Treffpunkt?")).toMatchObject({state:"answered"});
});

it("reads current family corrections separately from unchanged original evidence", async () => {
  const db = database({ id, title: "Ausflug", document_type: "school", corrections_text: "Familienkorrektur", file_url: "original.pdf" }, [{ page_number: 1, ocr_markdown: "Der Ausflug findet am 01.10.2026 statt." }]);
  const correction = "Aktueller gespeicherter Stand nach Familienkorrektur: Ausflug\nTermin: 2026-10-02";
  const rpc = vi.fn().mockResolvedValue({ data: correction, error: null });
  const result = await readDocumentEvidence({ ...db.client, rpc } as never, "family-a", id, "Ausflug");
  expect(rpc).toHaveBeenCalledWith("document_correction_evidence", { p_document_id: id });
  expect(result).toMatchObject([
    { title: "Familienkorrektur: Ausflug", text: correction, page: null, hasOriginal: false },
    { title: "Ausflug", page: 1, hasOriginal: true, text: "Der Ausflug findet am 01.10.2026 statt." },
  ]);
  expect(verifyDocumentAnswer({ state: "answered", claims: [{ document_id: id, page_number: null, quote: correction, text: "Die Familienkorrektur nennt den 02.10.2026." }] }, result)).toMatchObject({ sources: [{ title: "Familienkorrektur: Ausflug", has_original: false }] });
});
it("fails rather than silently serving old OCR when corrections cannot load", async () => {
  const db = database({ id, title: "Brief", document_type: "letter", corrections_text: "Familienkorrektur" }, []);
  await expect(readDocumentEvidence({ ...db.client, rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("offline") }) } as never, "family", id, "Brief")).rejects.toThrow("Familienkorrektur");
});
