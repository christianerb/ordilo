/**
 * "Ordilo hat etwas entdeckt" — a proactive nudge on the Home dashboard
 * that surfaces one thing worth a second look, without Ordilo ever
 * inventing a claim about money or entitlements.
 *
 * Deliberately not an LLM call: the same "deterministic, no hallucination
 * risk" rule the rest of the Home briefing follows (see home-briefing.ts)
 * applies here too. The heuristic only ever repeats a sentence Ordilo's
 * own document analysis already wrote (`documents.summary`) — it never
 * writes new text, so a false positive is at worst "not that relevant",
 * never "wrong information about a subsidy".
 */

/** The fields the heuristic needs from a document. */
export interface InsightDocument {
  id: string;
  title: string | null;
  /** AI one-liner from document analysis — the same text the journal
      row already shows as its subtitle. */
  summary: string | null;
}

/** One surfaced discovery, ready for the Home card. */
export interface DiscoveryInsight {
  documentId: string;
  documentTitle: string;
  /** The document's own summary sentence — shown verbatim, never rewritten. */
  message: string;
}

/**
 * Keywords whose presence in a document's summary suggest a financial-
 * assistance angle worth a proactive nudge (subsidies, fee waivers,
 * reimbursements). Intentionally narrow and literal: missing an insight
 * is fine, inventing one is not.
 */
const DISCOVERY_KEYWORDS = [
  "zuschuss",
  "förderung",
  "beihilfe",
  "ermäßigung",
  "kostenübernahme",
  "erstattung",
];

/**
 * Scan documents (newest first, as Home already orders them) for the
 * first one whose summary hints at a discovery worth surfacing. Returns
 * null when nothing matches — the card then simply does not render
 * ("silence is a feature", same as the digest email).
 */
export function deriveDiscoveryInsight(
  documents: InsightDocument[],
): DiscoveryInsight | null {
  for (const doc of documents) {
    if (!doc.summary) continue;
    const lower = doc.summary.toLowerCase();
    if (DISCOVERY_KEYWORDS.some((keyword) => lower.includes(keyword))) {
      return {
        documentId: doc.id,
        documentTitle: doc.title ?? "Dokument",
        message: doc.summary,
      };
    }
  }
  return null;
}
