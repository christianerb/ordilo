/** Evaluates the actual authenticated chat route, including retrieval, tools and citation validation. */
import { readFile, writeFile } from "node:fs/promises";
import { parseChatWireEvent, type ChatSource } from "../packages/chat-contract/src/index.ts";

type Case = { id: string; question: string; expectedState: string; facts: string[][]; sourceTitles?: string[]; followUpTo?: string; forbiddenFacts?: string[]; expectedStates?: string[] };
const base = process.env.ORDILO_EVAL_BASE_URL ?? "http://localhost:3000";
const familyId = process.env.ORDILO_EVAL_FAMILY_ID;
const token = process.env.ORDILO_EVAL_TOKEN;
const casesFile = process.argv[2];
if (!familyId || !token || !casesFile) {
  console.error("Set ORDILO_EVAL_FAMILY_ID and ORDILO_EVAL_TOKEN for a test family; pass a cases JSON file. This run creates test conversations and consumes the normal chat allowance.");
  process.exit(2);
}
const cases: Case[] = JSON.parse(await readFile(casesFile, "utf8"));
if (!Array.isArray(cases) || !cases.length || cases.some((item) => !item.id || !item.question || !Array.isArray(item.facts))) throw new Error("Invalid evaluation cases");
const conversations = new Map<string, string>();
const results: Array<{ id: string; passed: boolean; failures: string[]; firstAnswerMs: number | null; totalMs: number; answer?: string; conversationId?: string; quotes?: string[] }> = [];
const normal = (value: string) => value.toLocaleLowerCase("de-DE").replace(/\s+/g, " ").trim();
for (const test of cases) {
  const start = performance.now();
  let first: number | null = null; let answer = ""; let state = "answered"; let done = false; let saved = false;
  let sources: ChatSource[] = []; let buffer = ""; const failures: string[] = [];
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
    test.facts.forEach((alternatives, index) => {
      if (!alternatives.some((fact) => normal(answer).includes(normal(fact)))) failures.push(`fact:${index}`);
    });
    for (const fact of test.forbiddenFacts ?? []) {
      if (normal(answer).includes(normal(fact))) failures.push("forbidden_fact");
    }
    for (const title of test.sourceTitles ?? []) {
      if (!sources.some((source) => normal(source.title ?? "").includes(normal(title)) && source.cited && source.quote)) failures.push("evidence");
    }
  } catch (error) { failures.push(error instanceof Error && /^HTTP \d+$/.test(error.message) ? error.message : "request_failed"); }
  results.push({ id: test.id, passed: failures.length === 0, failures, firstAnswerMs: first === null ? null : Math.round(first), totalMs: Math.round(performance.now() - start), conversationId: conversations.get(test.id), ...(process.env.ORDILO_EVAL_SYNTHETIC === "1" ? { answer, quotes: sources.map(source => source.quote ?? source.excerpt) } : {}) });
  console.error(`${test.id}: ${failures.length ? failures.join(",") : "pass"} (${Math.round(performance.now() - start)} ms)`);
}
const durations = results.map((item) => item.totalMs).sort((a, b) => a - b);
const report = JSON.stringify({ passed: results.every((item) => item.passed), cases: results, p50Ms: durations[Math.ceil(durations.length * 0.5) - 1], p95Ms: durations[Math.ceil(durations.length * 0.95) - 1] }, null, 2);
if (process.env.ORDILO_EVAL_OUTPUT) await writeFile(process.env.ORDILO_EVAL_OUTPUT, report + "\n");
console.log(report);
if (results.some((item) => !item.passed)) process.exitCode = 1;
