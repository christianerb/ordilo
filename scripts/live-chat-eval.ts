/** Evaluates the actual authenticated chat route, including retrieval, tools and citation validation. */
import { readFile, writeFile } from "node:fs/promises";
import {
  parseChatWireEvent,
  type ChatResponseState,
  type ChatSource,
} from "../packages/chat-contract/src/index.ts";
import {
  scoreChatAnswer,
  type ChatEvalCase,
} from "../src/lib/ai/evals/chat-quality-v1.ts";

type Case = {
  id: string;
  question: string;
  expectedState: string;
  facts: string[][];
  sourceTitles?: string[];
  followUpTo?: string;
  forbiddenFacts?: string[];
  expectedStates?: string[];
  /** Tone and length checks from the shared rubric (scoreChatAnswer). */
  maxWords?: number;
  minWords?: number;
  forbiddenPhrases?: string[];
  /** The right behaviour is one concrete follow-up question naming these options. */
  expectsClarification?: boolean;
  clarificationOptions?: string[];
  /** A present_answer_card with this card type must be shown. */
  expectedCardType?: string;
  /** A confirmation_request for this action tool must be shown (and nothing executed). */
  expectsConfirmation?: string;
  /** All of these confirmation_requests must be shown (e.g. two tasks in one ask). */
  expectsConfirmations?: string[];
  /** No confirmation_request may appear (e.g. the user changed their mind). */
  forbiddenConfirmation?: boolean;
  /** Per-case latency budgets in milliseconds. */
  maxTotalMs?: number;
  maxFirstAnswerMs?: number;
};
const base = process.env.ORDILO_EVAL_BASE_URL ?? "http://localhost:3000";
const familyId = process.env.ORDILO_EVAL_FAMILY_ID;
const token = process.env.ORDILO_EVAL_TOKEN;
const casesFiles = process.argv.slice(2);
if (!familyId || !token || casesFiles.length === 0) {
  console.error("Set ORDILO_EVAL_FAMILY_ID and ORDILO_EVAL_TOKEN for a test family; pass one or more cases JSON files. This run creates test conversations and consumes the normal chat allowance.");
  process.exit(2);
}
const loaded = await Promise.all(casesFiles.map(async (file) => JSON.parse(await readFile(file, "utf8")) as Case[]));
const cases: Case[] = loaded.flat();
if (!Array.isArray(cases) || !cases.length || cases.some((item) => !item.id || !item.question || !Array.isArray(item.facts))) throw new Error("Invalid evaluation cases");
const seenIds = new Set<string>();
for (const item of cases) {
  if (seenIds.has(item.id)) throw new Error(`Duplicate case id: ${item.id}`);
  seenIds.add(item.id);
}
const conversations = new Map<string, string>();
/** Sentences already used in a conversation, for the cross-turn repetition check. */
const sentencesByConversation = new Map<string, string[]>();
const results: Array<{ id: string; passed: boolean; failures: string[]; firstAnswerMs: number | null; totalMs: number; answer?: string; conversationId?: string; quotes?: string[] }> = [];
const normal = (value: string) => value.toLocaleLowerCase("de-DE").replace(/\s+/g, " ").trim();
for (const test of cases) {
  const start = performance.now();
  let first: number | null = null; let answer = ""; let state = "answered"; let done = false; let saved = false;
  let sources: ChatSource[] = []; let buffer = ""; const failures: string[] = [];
  let cardType: string | null = null; let cardJson = ""; const confirmationTools: string[] = [];
  try {
    const response = await fetch(new URL("/api/chat", base), {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(55_000),
      body: JSON.stringify({ family_id: familyId, message: test.question, history: [], capabilities: ["web_source_urls"],
        conversation_id: test.followUpTo ? conversations.get(test.followUpTo) : undefined }),
    });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const decoder = new TextDecoder();
    const receive = (line: string) => {
      if (!line.trim()) return;
      const event = parseChatWireEvent(JSON.parse(line));
      if (!event) return;
      if (event.type === "conversation") conversations.set(test.id, event.conversationId);
      if (event.type === "text" || event.type === "replace") {
        answer = event.type === "replace" ? event.content : answer + event.content;
        if (answer.trim()) first ??= performance.now() - start;
      }
      if (event.type === "card") {
        cardType = typeof event.card.type === "string" ? event.card.type : "present";
        cardJson = JSON.stringify(event.card);
      }
      if (event.type === "confirmation") confirmationTools.push(event.action.toolName);
      if (event.type === "sources") sources = event.sources;
      if (event.type === "response_state") state = event.state;
      if (event.type === "done") done = true;
      if (event.type === "message_saved") saved = true;
      if (event.type === "persistence_warning") failures.push("persistence_warning");
      if (event.type === "error") failures.push(`error:${event.code ?? "unknown"}`);
    };
    const reader = response.body.getReader();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const lines = (buffer + decoder.decode(chunk.value, { stream: true })).split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(receive);
    }
    receive(buffer + decoder.decode());
    if (!done) failures.push("incomplete");
    if (!saved) failures.push("not_saved");
    if (!(test.expectedStates ?? [test.expectedState]).includes(state)) failures.push("state");
    // A fact may live in the answer text or in an answer card's fields —
    // rule 13 moves exactly one result into a card instead of the prose.
    const factSurface = `${answer} ${cardJson}`;
    test.facts.forEach((alternatives, index) => {
      if (!alternatives.some((fact) => normal(factSurface).includes(normal(fact)))) failures.push(`fact:${index}`);
    });
    for (const fact of test.forbiddenFacts ?? []) {
      if (normal(factSurface).includes(normal(fact))) failures.push("forbidden_fact");
    }
    for (const title of test.sourceTitles ?? []) {
      if (!sources.some((source) => normal(source.title ?? "").includes(normal(title)) && source.cited && source.quote)) failures.push("evidence");
    }
    if (test.expectedCardType && cardType !== test.expectedCardType) failures.push(`card:${cardType ?? "none"}`);
    if (test.expectsConfirmation && !confirmationTools.includes(test.expectsConfirmation)) failures.push(`confirmation:${test.expectsConfirmation}:none`);
    for (const tool of [...new Set(test.expectsConfirmations ?? [])]) {
      // Duplicates in the list mean the same tool must confirm twice (e.g. two tasks).
      const wanted = (test.expectsConfirmations ?? []).filter((entry) => entry === tool).length;
      const seen = confirmationTools.filter((entry) => entry === tool).length;
      if (seen < wanted) failures.push(`confirmation:${tool}:${seen}<${wanted}`);
    }
    if (test.forbiddenConfirmation && confirmationTools.length > 0) failures.push(`confirmation:forbidden:${confirmationTools.join("+")}`);
    // Tone, length and clarification quality come from the shared rubric, so
    // the live route is held to the same voice contract as captured answers.
    // Fact/state/source checks stay case-specific above (facts allow
    // alternatives, states allow a list), so only the tone verdicts are kept.
    const toneCase: ChatEvalCase = {
      id: test.id,
      knowledgeSpace: "family",
      question: test.question,
      expectedState: (test.expectedStates ?? [test.expectedState])[0] as ChatResponseState,
      requiredFacts: [],
      maxWords: test.maxWords ?? 140,
      referenceAnswer: "",
      ...(test.minWords !== undefined || test.expectedCardType || test.expectsConfirmation
        ? { minWords: test.minWords ?? 1 }
        : {}),
      ...(test.forbiddenPhrases ? { forbiddenPhrases: test.forbiddenPhrases } : {}),
      ...(test.expectsClarification ? { expectsClarification: true } : {}),
      ...(test.clarificationOptions ? { clarificationOptions: test.clarificationOptions } : {}),
    };
    for (const failure of scoreChatAnswer(toneCase, answer, state as ChatResponseState).failures) {
      if (/^(tone:|terse:|length:|phrase:|clarify:)/.test(failure)) failures.push(failure);
    }
    // A follow-up answer must not repeat an earlier sentence of the same
    // conversation word for word — the closing beat has to move on. The
    // FIRST sentence is exempt: it carries the fact ("Die Antwort steht im
    // ersten Satz"), and a re-ask of the same fact may — and should —
    // state it again. Any sentence that carries one of the case's expected
    // facts is also exempt: content that answers the asked question is
    // never padding, even when the prior answer mentioned it in passing.
    const conversationId = conversations.get(test.id);
    const priorSentences = conversationId ? (sentencesByConversation.get(conversationId) ?? []) : [];
    const factAlternatives = test.facts.flat().map(normal).filter((alt) => alt.length > 0);
    const sentences = answer
      .split(/(?<=[.!?])\s+/)
      .map(normal)
      .filter((sentence) => sentence.split(" ").length >= 5)
      .slice(1)
      .filter((sentence) => !factAlternatives.some((alt) => sentence.includes(alt)));
    if (sentences.some((sentence) => priorSentences.includes(sentence))) failures.push("repetition");
    if (conversationId) sentencesByConversation.set(conversationId, [...priorSentences, ...sentences]);
  } catch (error) { failures.push(error instanceof Error && /^HTTP \d+$/.test(error.message) ? error.message : "request_failed"); }
  const totalMs = Math.round(performance.now() - start);
  if (test.maxTotalMs !== undefined && totalMs > test.maxTotalMs) failures.push(`slow:total:${totalMs}>${test.maxTotalMs}`);
  if (test.maxFirstAnswerMs !== undefined && first !== null && first > test.maxFirstAnswerMs) failures.push(`slow:first-answer:${Math.round(first)}>${test.maxFirstAnswerMs}`);
  results.push({ id: test.id, passed: failures.length === 0, failures, firstAnswerMs: first === null ? null : Math.round(first), totalMs, conversationId: conversations.get(test.id), ...(process.env.ORDILO_EVAL_SYNTHETIC === "1" ? { answer, quotes: sources.map(source => source.quote ?? source.excerpt) } : {}) });
  console.error(`${test.id}: ${failures.length ? failures.join(",") : "pass"} (${totalMs} ms)`);
}
const durations = results.map((item) => item.totalMs).sort((a, b) => a - b);
const firstAnswers = results.map((item) => item.firstAnswerMs).filter((value): value is number => value !== null).sort((a, b) => a - b);
const percentile = (values: number[], p: number) => values.length ? values[Math.ceil(values.length * p) - 1] : null;
const report = JSON.stringify({
  passed: results.every((item) => item.passed),
  failed: results.filter((item) => !item.passed).map((item) => `${item.id}: ${item.failures.join(",")}`),
  cases: results,
  p50Ms: percentile(durations, 0.5),
  p95Ms: percentile(durations, 0.95),
  firstAnswerP50Ms: percentile(firstAnswers, 0.5),
  firstAnswerP95Ms: percentile(firstAnswers, 0.95),
}, null, 2);
if (process.env.ORDILO_EVAL_OUTPUT) await writeFile(process.env.ORDILO_EVAL_OUTPUT, report + "\n");
console.log(report);
if (results.some((item) => !item.passed)) process.exitCode = 1;
