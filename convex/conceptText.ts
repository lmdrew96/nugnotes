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

A concept is something the course is about that could come up again in another session: a term, a person, a theory or model, a study or example, a date or historical event. Not concepts: the class's own date, logistics (homework, exams, room changes), and everyday words.

Concepts already in this course:
${describeKnown(opts.known)}

Each line below starts with its label in brackets. Marks in the lines: ~~crossed out~~ is not content, so never use it as evidence; [?] is an unreadable word; # and ## are the student's headings; [diagram: …] and [box] mark layout; (margin) is a margin note.

<${tag} title="${opts.title.replace(/"/g, "'")}">
${labelLines(opts.lines)}
</${tag}>

Reply with JSON only, no code fences:
{"concepts":[{"name":"…","kind":"term|person|theory|example|date|other","existing":"C3 or null","aliases":["…"],"lines":["P1.2","P1.4"]}]}

Rules:
- If a concept is the same idea as one already in the course, even in different wording, an abbreviation or shorthand ("neg. reinforcement" and "negative reinforcement"), set existing to its label and put the new wording in aliases. Only merge when it really is the same idea, not merely related.
- name (new concepts): the clearest full form these lines use, in their words, at most 6 words. Never invent a term the lines don't use.
- aliases: other names or abbreviations these lines use for it (a few words each, never a whole line). Can be empty.
- lines: labels of the lines that mention it, at most ${MAX_LINES_PER_CONCEPT}. Only labels from the list.
- At most ${MAX_CONCEPTS} concepts; if there are more, leave out the least important.`;
};

export interface ExtractedConcept {
  name: string;
  kind: ConceptKind;
  /** Key of a known concept (C3) this is the same as, if any. */
  existing: string | null;
  aliases: string[];
  lines: RefLine[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string') : [];

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
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : reply).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Concept reply had no JSON');
  const parsed: unknown = JSON.parse(body.slice(start, end + 1));
  if (!isRecord(parsed) || !Array.isArray(parsed.concepts)) {
    throw new Error('Concept reply missing concepts');
  }
  const byRef = new Map(lines.map((l) => [l.ref, l]));
  const out: ExtractedConcept[] = [];
  for (const item of parsed.concepts.slice(0, MAX_CONCEPTS)) {
    if (!isRecord(item) || typeof item.name !== 'string') continue;
    const name = item.name.trim().slice(0, 80);
    const refs = [...new Set(strings(item.lines))].slice(0, MAX_LINES_PER_CONCEPT);
    const found = refs.flatMap((ref) => byRef.get(ref.replace(/[[\]]/g, '').trim()) ?? []);
    if (!name || found.length === 0) continue;
    const kind = CONCEPT_KINDS.find((k) => k === item.kind) ?? 'other';
    const existing =
      typeof item.existing === 'string' && knownKeys.has(item.existing.trim())
        ? item.existing.trim()
        : null;
    const aliases = strings(item.aliases)
      .map((a) => a.trim().slice(0, 80))
      .filter((a) => a && a.toLowerCase() !== name.toLowerCase());
    out.push({ name, kind, existing, aliases, lines: found });
  }
  return out;
};

/** Case- and space-insensitive key for matching names and aliases. */
export const nameKey = (name: string): string =>
  name.trim().toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ');
