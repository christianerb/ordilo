import OpenAI from "openai";
import {
  EMAIL_INSIGHT_MODEL,
  EMAIL_INSIGHT_REASONING_EFFORT,
} from "@/lib/ai/models";
import {
  emailInsightsJsonSchema,
  selectEmailSuggestions,
  type EmailSuggestion,
} from "@/lib/schemas/inbound-email";

/**
 * Reads a plain inbound email — no attachment, just words — and proposes
 * what the family would otherwise have to type in themselves: a checkup at
 * the paediatrician, a parents' evening, a form due on Friday.
 *
 * The proposal is never written anywhere on its own. It becomes a question
 * in the app, and only a tap turns it into a calendar entry or a task.
 */

export interface EmailInsightInput {
  subject: string;
  from: string;
  bodyText: string;
  /** Today in the family's timezone, as YYYY-MM-DD — the anchor for
      "nächsten Dienstag" and every other relative date in the mail. */
  today: string;
  /** First names of the family, so "Emmas U7" gets the child into the title. */
  memberNames: readonly string[];
}

export function buildEmailInsightPrompt(input: EmailInsightInput): string {
  const parts: string[] = [
    "Du bist Ordilo, ein privater Familienassistent. Du liest eine E-Mail, die eine Familie an ihre Ordilo-Adresse weitergeleitet hat, und schlägst vor, was daraus in den Familienkalender oder auf die Aufgabenliste gehört.",
    `Heute ist ${input.today}. Rechne relative Angaben ("morgen", "nächsten Dienstag", "in zwei Wochen") in ein konkretes Datum um. Ohne eindeutiges Datum bleibt das Feld null.`,
  ];

  if (input.memberNames.length > 0) {
    parts.push(
      `Die Familie besteht aus: ${input.memberNames.join(", ")}. Wenn die E-Mail eine dieser Personen betrifft, nenne sie im Titel (z. B. "U7-Untersuchung für Emma").`,
    );
  }

  parts.push(`
Regeln:
- Schlage nur etwas vor, was wirklich in der E-Mail steht. Erfinde nichts, rate nichts.
- Ein Termin (kind "calendar_event") braucht ein Datum. Eine Frist oder ein To-do ohne festen Termin ist eine Aufgabe (kind "task").
- Höchstens drei Vorschläge. Meistens ist einer richtig.
- Newsletter, Werbung, Rechnungen ohne Termin, Versandbestätigungen und automatische Benachrichtigungen ergeben KEINEN Vorschlag. Dann gib eine leere Liste zurück.
- Der Titel ist kurz, konkret und auf Deutsch, ohne Höflichkeitsfloskeln. Nicht "Termin", sondern "U7-Untersuchung bei Dr. Weber".
- note ist ein Satz mit dem, was die Familie mitbringen oder wissen muss. Wenn es nichts gibt: null.
- confidence sagt ehrlich, wie sicher du bist. Unter 0.5 wird der Vorschlag verworfen — das ist in Ordnung.
- Alle Texte auf Deutsch, einfach und freundlich.`);

  return parts.join("\n");
}

/**
 * Runs the proposal extraction. Returns an empty list for anything the model
 * could not confidently turn into a date or a task, and for every failure
 * along the way: a missing proposal is invisible, a wrong one is not.
 */
export async function extractEmailSuggestions(
  input: EmailInsightInput,
): Promise<EmailSuggestion[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  const client = new OpenAI({ apiKey });
  const userInput = [
    `Von: ${input.from}`,
    `Betreff: ${input.subject}`,
    "",
    input.bodyText,
  ].join("\n");

  try {
    const response = await client.responses.create({
      model: EMAIL_INSIGHT_MODEL,
      instructions: buildEmailInsightPrompt(input),
      input: userInput,
      text: {
        format: {
          type: "json_schema",
          name: "email_insights",
          strict: true,
          schema: emailInsightsJsonSchema as unknown as Record<string, unknown>,
        },
      },
      reasoning: { effort: EMAIL_INSIGHT_REASONING_EFFORT },
      store: false,
    });

    const content = response.output_text;
    if (!content) return [];
    return selectEmailSuggestions(JSON.parse(content));
  } catch {
    return [];
  }
}
