import OpenAI from "openai";
import { CHAT_MODEL } from "@/lib/ai/models";
import type { SearchResult } from "@/lib/schemas/search";

/**
 * LLM-based re-ranking of search results.
 *
 * After retrieval (semantic + graph), the top-K results are re-ranked by
 * an LLM that evaluates each result's relevance to the query. This catches
 * cases where vector similarity returns high-score but low-relevance results
 * (e.g., a document about "Stromrechnung" scores high for "Rechnung" but
 * the user asked about "Wasserrechnung").
 *
 * The LLM receives the query and the top-K result titles + excerpts, and
 * returns a relevance score (0-10) for each. Results are then sorted by
 * the LLM score, falling back to the original score for ties.
 */

/** Maximum results to send to the LLM for re-ranking. */
const RERANK_TOP_K = 10;

/** Result of re-ranking: the re-ranked results with LLM scores. */
export interface RerankedResult {
  result: SearchResult;
  llmScore: number;
  originalScore: number;
}

/**
 * Re-rank search results using an LLM as a cross-encoder judge.
 *
 * Sends the query + top-K result titles/excerpts to the LLM, which returns
 * a relevance score (0-10) for each result. Results are sorted by LLM score
 * descending, falling back to original score for ties.
 *
 * If the LLM call fails, the original ordering is preserved (graceful
 * degradation — re-ranking is a bonus, not a requirement).
 *
 * @param query - The user's natural-language query.
 * @param results - Search results to re-rank (will be truncated to RERANK_TOP_K).
 * @returns Re-ranked results with LLM scores.
 */
export async function rerankResults(
  query: string,
  results: SearchResult[],
): Promise<SearchResult[]> {
  if (results.length <= 1) return results;

  // Truncate to top-K (no point re-ranking 50 results — the bottom ones
  // are unlikely to become relevant).
  const toRerank = results.slice(0, RERANK_TOP_K);
  const rest = results.slice(RERANK_TOP_K);

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return results;

    const client = new OpenAI({ apiKey });

    // Build the prompt with numbered results
    const resultTexts = toRerank.map((r, i) => {
      const title = r.title ?? "Ohne Titel";
      const excerpt = (r.chunk_text ?? "").slice(0, 200);
      return `${i + 1}. [${title}] ${excerpt}`;
    }).join("\n");

    const prompt = `Bewerte die Relevanz der folgenden Dokumente fuer die Suchanfrage.
Suchanfrage: "${query}"

Dokumente:
${resultTexts}

Bewerte jedes Dokument von 0 (irrelevant) bis 10 (perfekt passend).
Antworte NUR im Format "NR:SCORE" pro Zeile, z.B.:
1:9
2:3
3:7

Keine Erklaerung, nur die Bewertungen.`;

    const response = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0,
    });

    const text = response.choices[0]?.message?.content ?? "";

    // Parse LLM scores: "1:9\n2:3\n..."
    const scoreMap = new Map<number, number>();
    for (const line of text.split("\n")) {
      const match = line.trim().match(/^(\d+)\s*:\s*(\d+)/);
      if (match) {
        const idx = parseInt(match[1], 10) - 1;
        const score = parseInt(match[2], 10);
        if (idx >= 0 && idx < toRerank.length && score >= 0 && score <= 10) {
          scoreMap.set(idx, score);
        }
      }
    }

    // Apply LLM scores and sort
    const reranked = toRerank.map((result, i) => ({
      result,
      llmScore: scoreMap.get(i) ?? Math.round(result.score * 10),
      originalScore: result.score,
    }));

    reranked.sort((a, b) => {
      // Sort by LLM score (normalized to 0-1), then by original score
      const aScore = a.llmScore / 10;
      const bScore = b.llmScore / 10;
      if (Math.abs(aScore - bScore) > 0.01) return bScore - aScore;
      return b.originalScore - a.originalScore;
    });

    // Return re-ranked results with adjusted scores
    const finalResults = reranked.map((r) => ({
      ...r.result,
      score: Math.max(r.result.score, r.llmScore / 10),
    }));

    return [...finalResults, ...rest];
  } catch {
    // Graceful degradation: return original order if LLM fails
    return results;
  }
}
