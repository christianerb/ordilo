import OpenAI from "openai";
import { CHAT_MODEL } from "../src/lib/ai/models.ts";
import {
  CHAT_QUALITY_CASES_V1,
  scoreChatAnswer,
} from "../src/lib/ai/evals/chat-quality-v1.ts";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY is required for the live chat evaluation.");
  process.exit(2);
}

const cases = CHAT_QUALITY_CASES_V1.filter(
  (testCase) => testCase.liveEvidence !== undefined,
);
const client = new OpenAI({ apiKey });
const results: Array<{
  id: string;
  passed: boolean;
  latencyMs: number;
  missing: string[];
  score: number;
}> = [];

for (const testCase of cases) {
  const startedAt = performance.now();
  const response = await client.responses.create({
    model: CHAT_MODEL,
    // Must mirror the STIMME section of buildAgenticSystemPrompt: the rubric
    // scores the production voice, so instructing anything else here would
    // penalise the model for obeying and stop measuring the real behaviour.
    instructions:
      "Du bist Ordilo, der Familienassistent. Antworte auf Deutsch in ganzen, " +
      "verbundenen Sätzen — zwei bis vier für einen einfachen Fakt, nicht als " +
      "abgelesenes Datenfeld. Die konkrete Antwort steht im ERSTEN Satz. " +
      "Nenne bereitgestellte Testbelege mitten im Satz (\"das steht im …\"), " +
      "niemals als angehängtes \"Quelle:\"-Etikett. Ein menschlicher Schlusston " +
      "ist erwünscht, darf aber keinen neuen Fakt und keine gerechnete Zahl " +
      "einbringen. Kein Vorgeplänkel, keine Floskeln, keine Emojis. " +
      "Bei Widersprüchen nenne beide gesicherten Angaben und den Widerspruch.",
    input: `${testCase.liveEvidence ? `Testbelege:\n${testCase.liveEvidence}\n\n` : ""}Frage: ${testCase.question}`,
    reasoning: { effort: "low" },
    store: false,
  });
  const latencyMs = Math.round(performance.now() - startedAt);
  const evaluation = scoreChatAnswer(
    testCase,
    response.output_text,
    testCase.expectedState,
  );
  results.push({
    id: testCase.id,
    passed: evaluation.failures.length === 0,
    latencyMs,
    missing: evaluation.failures,
    score: evaluation.score,
  });
}

console.log(
  JSON.stringify(
    {
      model: CHAT_MODEL,
      passed: results.every((result) => result.passed),
      cases: results,
    },
    null,
    2,
  ),
);

if (results.some((result) => !result.passed)) process.exitCode = 1;
