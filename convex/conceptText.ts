/**
 * Concepts: the prompt, labelling a session's lines so Claude can cite them,
 * and checking Claude's reply. Pure, so it can be tested.
 *
 * Pattern borrowed from Ghostlight: Claude gets the course's known concepts and
 * reuses them for the same idea in new wording; every concept must point at
 * real lines. Here Claude cites line labels instead of copying quotes, so the
 * quote shown is always the student's own line, never Claude's copy of it.
 */
import { NO_NOTES } from './transcriptText';

export const CONCEPT_KINDS = ['term', 'person', 'theory', 'example', 'date', 'other'] as const;
export type ConceptKind = (typeof CONCEPT_KINDS)[number];

/** Caps that keep one read's output well inside its token budget. */
const MAX_CONCEPTS = 40;
const MAX_LINES_PER_CONCEPT = 8;
const MAX_LINKS = 20;
const MAX_LINES_PER_LINK = 3;
/** Material sent per read (~20k tokens); a long reading's tail is left out. */
const MAX_INPUT_CHARS = 80_000;

/** One line of a session, labelled: P2.5 = page 2 line 5; S12.3 = PDF page 12 line 3. */
export interface RefLine {
  ref: string;
  text: string;
  /** Class session: the page (as a string id) and its 0-based line. */
  pageId?: string;
  /** Source: the 1-based PDF page. */
  sourcePage?: number;
  line: number;
}

export const classLines = (
  pages: { _id: string; order: number; transcript?: { text: string }[] }[],
): RefLine[] =>
  pages.flatMap((page) =>
    (page.transcript ?? [])
      .map((l, line) => ({
        ref: `P${page.order + 1}.${line + 1}`,
        text: l.text,
        pageId: page._id,
        line,
      }))
      .filter((l) => l.text.trim() && l.text !== NO_NOTES),
  );

export const sourceLines = (pages: { page: number; text: string }[]): RefLine[] =>
  pages.flatMap((p) =>
    p.text
      .split(/\r?\n/)
      .map((text, line) => ({ ref: `S${p.page}.${line + 1}`, text, sourcePage: p.page, line }))
      .filter((l) => l.text.trim()),
  );

export interface KnownConcept {
  /** C1, C2… for the prompt. */
  key: string;
  name: string;
  kind?: string;
  aliases: string[];
}

const describeKnown = (known: KnownConcept[]): string =>
  known.length === 0
    ? 'None yet: this is the first session read in this course.'
    : known
        .map(
          (c) =>
            `${c.key}: ${c.name}${c.kind ? ` (${c.kind})` : ''}${c.aliases.length ? `, also: ${c.aliases.join(', ')}` : ''}`,
        )
        .join('\n');

/** Lines in order, cut at the input budget. */
const labelLines = (lines: RefLine[]): string => {
  const out: string[] = [];
  let used = 0;
  for (const l of lines) {
    const row = `[${l.ref}] ${l.text}`;
    used += row.length + 1;
    if (used > MAX_INPUT_CHARS) break;
    out.push(row);
  }
  return out.join('\n');
};

export const buildConceptPrompt = (opts: {
  title: string;
  isSource: boolean;
  known: KnownConcept[];
  lines: RefLine[];
}): string => {
  const what = opts.isSource ? 'reading or slide deck' : 'class session (handwritten notes)';
  const tag = opts.isSource ? 'source' : 'session';
  return `You map the ideas in a student's notes for one course. You read one ${what} and list the concepts in it, each backed by the lines that mention it. You never write summaries, definitions or explanations.

A concept is something the course is about that could come up again in another session: a term, a person, a theory or model, a study or case, a date or historical event.

Not concepts, so leave them out:
- figure, table, slide or page numbers and captions ("Figure 7.14", "Table 2")
- textbook box and section labels ("Pitfall", "Try this", "Key terms", "Summary")
- one-off asides, jokes, anecdotes and stories ("jumping into cold water", "pandemic Zooms")
- examples or cases that the lines don't tie to a concept. A case tied to one counts (H.M. → amnesia).
- the class's own date, logistics (homework, exams, room changes), and everyday words

Concepts already in this course:
${describeKnown(opts.known)}

Each line below starts with its label in brackets. Marks in the lines: ~~crossed out~~ is not content, so never use it as evidence; [?] is an unreadable word; # and ## are the student's headings; [diagram: …] and [box] mark layout; (margin) is a margin note.

<${tag} title="${opts.title.replace(/"/g, "'")}">
${labelLines(opts.lines)}
</${tag}>

Reply with JSON only, no code fences:
{"concepts":[{"name":"…","kind":"term|person|theory|example|date|other","existing":"C3 or null","aliases":["…"],"lines":["P1.2","P1.4"]}],"links":[{"a":0,"b":2,"how":"…","lines":["P1.4"]}]}

Rules:
- If a concept is the same idea as one already in the course, set existing to its label and put the new wording in aliases. The same idea includes: an abbreviation and its full form ("LTM", "long-term memory"), singular and plural, hyphenated or spaced ("long term memory"), shorthand ("neg. reinforcement"), and a name with its abbreviation in parentheses ("Long Term Memory (LTM)"). Only merge when it really is the same idea, not merely related: "memory" and "long-term memory" are two concepts.
- Never list the same idea twice in one reply.
- name (new concepts): the clearest full form these lines use, in their words, at most 6 words, without a parenthesized abbreviation (put that in aliases). Never invent a term the lines don't use.
- aliases: other names or abbreviations these lines use for it (a few words each, never a whole line). Can be empty.
- lines: labels of the lines that mention it, at most ${MAX_LINES_PER_CONCEPT}. Only labels from the list.
- At most ${MAX_CONCEPTS} concepts; if there are more, leave out the least important.

Links: where these lines actually connect two of the concepts in your reply: one is a kind of, part of, example or case of, cause of, method for, or contrast to the other, or the student draws an arrow between them. Two concepts merely appearing in the same notes is not a link.
- a, b: positions (0-based) of the two concepts in your concepts list.
- how: the connection in plain words, at most 8 words, from what the lines say ("H.M. is a case of amnesia"). Never add facts the lines don't state.
- lines: labels of the lines that show the connection, 1 to ${MAX_LINES_PER_LINK}.
- At most ${MAX_LINKS} links, the clearest ones. Can be empty.`;
};

export interface ExtractedConcept {
  name: string;
  kind: ConceptKind;
  /** Key of a known concept (C3) this is the same as, if any. */
  existing: string | null;
  aliases: string[];
  lines: RefLine[];
  /** Its position in Claude's list, which links refer to. */
  index: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string') : [];

const replyJson = (reply: string): unknown => {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : reply).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Concept reply had no JSON');
  return JSON.parse(body.slice(start, end + 1));
};

/**
 * Claude's reply → concepts. Anything that doesn't check out is dropped: line
 * labels not in the session, unknown concept keys, concepts left with no lines.
 * Throws only when the reply isn't the JSON shape at all.
 */
export const parseConcepts = (
  reply: string,
  lines: RefLine[],
  knownKeys: Set<string>,
): ExtractedConcept[] => {
  const parsed = replyJson(reply);
  if (!isRecord(parsed) || !Array.isArray(parsed.concepts)) {
    throw new Error('Concept reply missing concepts');
  }
  const byRef = new Map(lines.map((l) => [l.ref, l]));
  const out: ExtractedConcept[] = [];
  for (const [index, item] of parsed.concepts.slice(0, MAX_CONCEPTS).entries()) {
    if (!isRecord(item) || typeof item.name !== 'string') continue;
    const { name, abbreviation } = splitAbbreviation(item.name.trim().slice(0, 80));
    if (isNoise(name)) continue;
    const refs = [...new Set(strings(item.lines))].slice(0, MAX_LINES_PER_CONCEPT);
    const found = refs.flatMap((ref) => byRef.get(ref.replace(/[[\]]/g, '').trim()) ?? []);
    if (!name || found.length === 0) continue;
    const kind = CONCEPT_KINDS.find((k) => k === item.kind) ?? 'other';
    const existing =
      typeof item.existing === 'string' && knownKeys.has(item.existing.trim())
        ? item.existing.trim()
        : null;
    const aliases = [...(abbreviation ? [abbreviation] : []), ...strings(item.aliases)]
      .map((a) => a.trim().slice(0, 80))
      .filter((a) => a && a.toLowerCase() !== name.toLowerCase());
    out.push({ name, kind, existing, aliases, lines: found, index });
  }
  return out;
};

export interface ExtractedLink {
  /** Positions in the parsed concepts (not Claude's list). */
  a: number;
  b: number;
  how: string;
  lines: RefLine[];
}

/**
 * The reply's links between its concepts. Dropped: links to concepts that
 * didn't check out, a concept linked to itself, repeats of a pair, and links
 * with no real line labels. A reply with no links is fine.
 */
export const parseLinks = (
  reply: string,
  lines: RefLine[],
  concepts: ExtractedConcept[],
): ExtractedLink[] => {
  const parsed = replyJson(reply);
  if (!isRecord(parsed) || !Array.isArray(parsed.links)) return [];
  const position = new Map(concepts.map((c, i) => [c.index, i]));
  const byRef = new Map(lines.map((l) => [l.ref, l]));
  const seen = new Set<string>();
  const out: ExtractedLink[] = [];
  for (const item of parsed.links) {
    if (out.length >= MAX_LINKS) break;
    if (!isRecord(item) || typeof item.how !== 'string') continue;
    const a = typeof item.a === 'number' ? position.get(item.a) : undefined;
    const b = typeof item.b === 'number' ? position.get(item.b) : undefined;
    if (a === undefined || b === undefined || a === b) continue;
    const pair = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(pair)) continue;
    const found = [...new Set(strings(item.lines))]
      .slice(0, MAX_LINES_PER_LINK)
      .flatMap((ref) => byRef.get(ref.replace(/[[\]]/g, '').trim()) ?? []);
    const how = item.how.trim().slice(0, 120);
    if (!how || found.length === 0) continue;
    seen.add(pair);
    out.push({ a, b, how, lines: found });
  }
  return out;
};

/** Case- and space-insensitive key for matching names and aliases. */
export const nameKey = (name: string): string =>
  name.trim().toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ');

/** "Long Term Memory (LTM)" → name "Long Term Memory", abbreviation "LTM". */
export const splitAbbreviation = (text: string): { name: string; abbreviation?: string } => {
  const m = text.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (m && isAbbreviation(m[2])) return { name: m[1].trim(), abbreviation: m[2].trim() };
  return { name: text };
};

/** Looks like an abbreviation: LTM, STM, CS, UCRs, A.B.C. */
export const isAbbreviation = (text: string): boolean =>
  /^[A-Z][A-Z0-9&.]{1,7}s?$/.test(text.trim());

/** Figure/table/slide/page labels: never a concept, whatever the reply says. */
export const isNoise = (name: string): boolean =>
  /^(fig(ure)?|table|tbl|slide|chart|page|p)\.?\s*\d/i.test(name.trim()) || !/[a-z]/i.test(name);

/** Plural to singular for matching only: "memories" → "memory", "schemas" → "schema". */
const singular = (word: string): string => {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(word)) return word;
  return word.endsWith('s') ? word.slice(0, -1) : word;
};

/**
 * The keys one wording of a concept matches on, loosely: case, punctuation,
 * hyphens and a final plural don't count, and "Name (ABBR)" matches both
 * "Name" and "ABBR". Two wordings sharing a key are the same concept.
 */
export const matchKeys = (text: string): string[] => {
  const { name, abbreviation } = splitAbbreviation(text.trim());
  const norm = (s: string) =>
    nameKey(s)
      .replace(/[-‐–—_/]/g, ' ')
      .replace(/[.,;:!?'"()]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(singular)
      .join(' ');
  return [...new Set([name, abbreviation].flatMap((s) => (s ? [norm(s)] : [])))].filter(Boolean);
};
