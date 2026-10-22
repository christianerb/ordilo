/**
 * Matching rules for the knowledge graph: query words against node labels.
 *
 * The graph stores people and organizations under the spelling the document
 * used ("Hannah Becker", "Praxis Dr. Linden"), and families ask in their own
 * words — misspelled, lowercased, with or without umlauts. Plain substring
 * matching gets both directions wrong: "anna" is inside "Hannah" and "mein"
 * inside "Gemeinde", while "Hanah" finds nothing. These rules match people by
 * whole word (typo-tolerant) and only let longer words reach into German
 * compounds ("zahnarzt" in "Zahnarztpraxis").
 */

/** Lowercase, umlauts spelled out, other diacritics dropped: "Füße" → "fuesse". */
export function foldForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** The folded words of a text, split on anything that is not a letter or digit. */
export function wordsOf(text: string): string[] {
  return foldForMatch(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Words that carry no subject of their own. Folded spelling, so "für" and
 * "fuer" are the same entry. Kept long on purpose: every word that slips
 * through is matched against every organization and document title.
 */
export const GRAPH_STOP_WORDS: ReadonlySet<string> = new Set(
  [
    "zeig", "zeige", "mir", "uns", "alle", "alles", "der", "die", "das", "den",
    "dem", "des", "von", "vom", "zur", "zum", "bei", "beim", "aus", "auf", "mit",
    "nach", "ueber", "unter", "vor", "seit", "bis", "fuer", "gegen", "ohne", "um",
    "an", "am", "im", "in", "ins", "zu", "ein", "eine", "einen", "einem", "einer",
    "eines", "kein", "keine", "und", "oder", "aber", "auch", "nur", "noch", "schon",
    "immer", "mal", "doch", "denn", "dann", "wenn", "dass", "ob", "so", "wie", "wo",
    "was", "wer", "wem", "wen", "wann", "warum", "wieso", "welche", "welcher",
    "welches", "welchem", "welchen", "wieviel", "wie viel", "ich", "du", "er", "sie",
    "es", "wir", "ihr", "mein", "meine", "meiner", "meinem", "meinen", "meines",
    "dein", "deine", "deiner", "deinem", "deinen", "sein", "seine", "seiner",
    "seinem", "seinen", "ihre", "ihrer", "ihrem", "ihren", "unser", "unsere",
    "unserer", "unserem", "unseren", "euer", "eure", "eurer", "eurem", "euren",
    "ist", "sind", "war", "waren", "bin", "bist", "hat", "haben", "habe", "hast",
    "hatte", "hatten", "wird", "werden", "wurde", "wurden", "kann", "kannst",
    "koennen", "muss", "musst", "muessen", "soll", "sollen", "darf", "will",
    "moechte", "gibt", "gab", "steht", "stehen", "liegt", "kommt", "geht",
    "bekommen", "bekommt", "bekam", "erhalten", "zeigen", "finde", "finden",
    "suche", "suchen", "brauche", "brauchen", "erledigen", "laufen", "laeuft",
    "ab", "bald", "diese", "dieser", "dieses", "diesem", "diesen", "jetzt",
    "heute", "morgen", "gestern", "aktuell", "letzte", "letzten", "letzter",
    "neue", "neuen", "neues", "neuer", "alte", "alten", "altes", "naechste",
    "naechsten", "woche", "monat", "jahr", "nicht", "bitte", "danke", "gerne",
    "da", "hier", "dort", "drin", "dran", "darin", "davon", "dazu", "etwas",
    "irgendwas", "dokument", "dokumente", "dokumenten", "unterlage", "unterlagen",
    "papiere", "papier", "aufgabe", "aufgaben", "frist", "fristen", "termin",
    "termine", "infos", "info", "sachen", "zeug", "eigentlich", "genau",
  ].map(foldForMatch),
);

/**
 * Optimal string alignment distance (Levenshtein plus adjacent swaps, so
 * "Hnanah" is one edit from "Hannah"). Returns `max + 1` as soon as the
 * distance is known to exceed `max`.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prevPrev[j - 2] + 1);
      }
      row.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = row;
  }
  return prev[b.length];
}

/**
 * A rough German sound key: doubled letters collapse, a silent h after a
 * vowel goes, and letters that sound alike merge. "Hannah", "Hanna" and
 * "Hana" share one key; "Thomas" and "Tomas" too.
 */
function soundKey(word: string): string {
  return word
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/ck/g, "k")
    .replace(/c(?!h)/g, "k")
    .replace(/dt/g, "t")
    .replace(/tz/g, "z")
    .replace(/ie/g, "i")
    .replace(/y/g, "i")
    .replace(/([aeiou])h/g, "$1")
    .replace(/(.)\1+/g, "$1");
}

/** Allowed edits for a target of this length. Short words must match exactly. */
function typoBudget(length: number): number {
  if (length < 4) return 0;
  if (length < 9) return 1;
  return 2;
}

/**
 * Whether `word` is plausibly a misspelling of `target` (both folded).
 * Typos rarely hit the first letter, and requiring it keeps "Hanna" away
 * from "Anna" and "Thema" away from "Max".
 */
export function isTypoOf(word: string, target: string): boolean {
  if (word === target) return true;
  if (word.length < 3 || target.length < 3) return false;
  if (soundKey(word[0]) !== soundKey(target[0])) return false;
  const wordKey = soundKey(word);
  const targetKey = soundKey(target);
  if (wordKey === targetKey && targetKey.length >= 3) return true;
  const budget = typoBudget(target.length);
  return (
    editDistance(word, target, budget) <= budget ||
    editDistance(wordKey, targetKey, typoBudget(targetKey.length)) <=
      typoBudget(targetKey.length)
  );
}

/** "hannahs" → ["hannahs", "hannah"]: the word as written and without a possessive s. */
export function possessiveVariants(word: string): string[] {
  const variants = [word];
  if (word.length > 3 && word.endsWith("s")) variants.push(word.slice(0, -1));
  return variants;
}

/**
 * Does the person label name this person? Whole words only, each name word
 * compared typo-tolerantly: "Hannah Becker" matches "Hanah" and "Becker",
 * never "Anna"; "Maximilian Weber" never matches "Max".
 */
export function personLabelMatches(label: string, name: string): boolean {
  const labelWords = wordsOf(label);
  const nameWords = wordsOf(name);
  if (nameWords.length === 0) return false;
  return nameWords.every((nameWord) =>
    labelWords.some((labelWord) =>
      possessiveVariants(nameWord).some((v) => isTypoOf(v, labelWord)),
    ),
  );
}

/** How well one query keyword (folded, may be a two-word phrase) names a label. */
export function keywordLabelScore(
  label: string,
  keyword: string,
  options: { compounds: boolean },
): number {
  const labelWords = wordsOf(label);
  const folded = labelWords.join(" ");
  if (!folded || !keyword) return 0;
  if (folded === keyword) return 1;

  if (keyword.includes(" ")) {
    return ` ${folded} `.includes(` ${keyword} `) ? 0.85 : 0;
  }

  const variants = possessiveVariants(keyword);
  if (labelWords.some((w) => variants.includes(w))) return 0.75;
  // German compounds: "zahnarzt" in "zahnarztpraxis", "ticket" in
  // "deutschlandticket". Short keywords stay out — "mein" is in "gemeinde".
  if (options.compounds && keyword.length >= 5 && labelWords.some((w) => w.includes(keyword))) {
    return 0.65;
  }
  if (keyword.length >= 5 && labelWords.some((w) => isTypoOf(keyword, w))) return 0.55;
  return 0;
}

/**
 * Significant words of a question, folded, plus adjacent pairs for
 * multi-word names ("kita sonnenblume").
 */
export function extractGraphKeywords(query: string): string[] {
  const tokens = wordsOf(query).filter(
    (w) => w.length > 2 && !GRAPH_STOP_WORDS.has(w),
  );
  const keywords = new Set(tokens);
  for (let i = 0; i < tokens.length - 1; i++) {
    keywords.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return [...keywords];
}

/**
 * A value for a PostgREST `or=(…)` filter as `col.ilike."%value%"`: LIKE
 * wildcards escaped, then quoted, so commas, dots and parentheses in a name
 * cannot change the filter.
 */
export function ilikeContainsFilter(column: string, value: string): string {
  const like = value.replace(/[\\%_]/g, (c) => `\\${c}`);
  const quoted = `%${like}%`.replace(/[\\"]/g, (c) => `\\${c}`);
  return `${column}.ilike."${quoted}"`;
}
