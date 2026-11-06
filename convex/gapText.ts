/**
 * Whiskers and contradictions: the prompt and checking Claude's reply. Pure,
 * so it can be tested. Same rule as concepts: Claude cites line labels, and
 * every quote shown is the student's (or the document's) own line.
 *
 * Whiskers (Nae's name, after Ghostlight's ghosts) are what the notes point at
 * but never fill in. Claude labels the gap; it never fills it.
 */
import type { RefLine } from './conceptText';

export const WHISKER_KINDS = ['undefined', 'follow-up', 'question'] as const;
export type WhiskerKind = (typeof WHISKER_KINDS)[number];

const MAX_WHISKERS = 15;
const MAX_CONTRADICTIONS = 10;
const MAX_LINES = 4;
const MAX_INPUT_CHARS = 80_000;

export interface KnownWhisker {
  /** W1, W2… for the prompt. */
  key: string;
  kind: string;
  label: string;
  status: 'open' | 'answered' | 'dismissed';
}

/** A line from another session of the course, for spotting disagreements. */
export interface OtherLine extends RefLine {
  /** E1, E2… (ref holds it too). */
  where: string;
  sessionId: string;
}

const rows = (lines: RefLine[], budget: number): string => {
  const out: string[] = [];
  let used = 0;
  for (const l of lines) {
    const row = `[${l.ref}] ${l.text}`;
    used += row.length + 1;
    if (used > budget) break;
    out.push(row);
  }
  return out.join('\n');
};

export const buildGapPrompt = (opts: {
  title: string;
  isSource: boolean;
  lines: RefLine[];
  known: KnownWhisker[];
  others: OtherLine[];
}): string => {
  const tag = opts.isSource ? 'source' : 'session';
  const known = opts.known.length
    ? opts.known.map((w) => `${w.key} [${w.status}] ${w.kind}: ${w.label}`).join('\n')
    : '(none yet)';
  const open = opts.known.filter((w) => w.status === 'open');
  const checklist = open.length
    ? `\n\nOpen whiskers to check one by one: does any line in this ${tag} fill it in?\n${open.map((w) => `${w.key}: ${w.label}`).join('\n')}`
    : '';
  const others = opts.others.length
    ? opts.others.map((l) => `[${l.ref}] (${l.where}) ${l.text}`).join('\n')
    : '(none)';
  return `You read a student's notes for one course and find two things in one ${opts.isSource ? 'reading' : 'class session'}: whiskers and contradictions. You never answer the questions, define the terms or explain anything: you only point at what is there.

Whiskers are things the notes point at but never fill in:
- undefined: a term the notes treat as important but never define or explain, here or in the lines from other sessions below. Only terms that matter to the course, not every word.
- follow-up: a pointer never followed up, like "see reading", "on the exam", "come back to this", "look up", "ask prof".
- question: a question the student wrote (often in the margin, or with ?) that the notes don't answer.

Whiskers already known in this course. Never raise one of these again; answered and dismissed ones are settled:
${known}${checklist}

Lines from other sessions in this course about the same concepts:
${others}

Marks in the lines: ~~crossed out~~ is not content, never use it; [?] is an unreadable word; # and ## are headings; (margin) is a margin note.

<${tag} title="${opts.title.replace(/"/g, "'")}">
${rows(opts.lines, MAX_INPUT_CHARS)}
</${tag}>

Reply with JSON only, no code fences:
{"whiskers":[{"kind":"undefined|follow-up|question","label":"…","lines":["P1.3"]}],"answered":[{"whisker":"W2","lines":["P2.4"]}],"contradictions":[{"about":"…","line":"P1.5","other":"E3"}]}

Rules:
- whiskers: only from this ${tag}'s lines. label: plain words, at most 10, naming what is missing ("definition of absolute threshold", "what to read for chapter 4"). No answers, no advice. At most ${MAX_WHISKERS}.
- answered: every open whisker from the checklist that a line here really fills in: it defines the term, answers the question (even in other words), or follows up the pointer.
- contradictions: a line here and a line from another session that disagree on a definition, date, number, name or claim. Not when one simply adds detail or uses other words for the same thing. At most ${MAX_CONTRADICTIONS}. about: at most 8 words.
- lines: labels from this ${tag} only, at most ${MAX_LINES} per item.
- Empty lists are fine. Return only what is really there.`;
};

export interface FoundWhisker {
  kind: WhiskerKind;
  label: string;
  lines: RefLine[];
}
export interface FoundAnswer {
  whisker: string;
  lines: RefLine[];
}
export interface FoundContradiction {
  about: string;
  line: RefLine;
  other: OtherLine;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const clean = (ref: unknown): string =>
  typeof ref === 'string' ? ref.replace(/[[\]]/g, '').trim() : '';

/** Claude's reply → checked items. Unknown labels and keys are dropped. */
export const parseGaps = (
  reply: string,
  lines: RefLine[],
  others: OtherLine[],
  openKeys: Set<string>,
): { whiskers: FoundWhisker[]; answered: FoundAnswer[]; contradictions: FoundContradiction[] } => {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : reply).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Gap reply had no JSON');
  const parsed: unknown = JSON.parse(body.slice(start, end + 1));
  if (!isRecord(parsed)) throw new Error('Gap reply was not an object');

  const here = new Map(lines.map((l) => [l.ref, l]));
  const there = new Map(others.map((l) => [l.ref, l]));
  const pick = (refs: unknown) =>
    [...new Set(list(refs).map(clean))].slice(0, MAX_LINES).flatMap((r) => here.get(r) ?? []);

  const whiskers: FoundWhisker[] = [];
  for (const item of list(parsed.whiskers).slice(0, MAX_WHISKERS)) {
    if (!isRecord(item) || typeof item.label !== 'string') continue;
    const kind = WHISKER_KINDS.find((k) => k === item.kind);
    const label = item.label.trim().slice(0, 120);
    const found = pick(item.lines);
    if (kind && label && found.length > 0) whiskers.push({ kind, label, lines: found });
  }

  const answered: FoundAnswer[] = [];
  for (const item of list(parsed.answered)) {
    if (!isRecord(item)) continue;
    const key = clean(item.whisker);
    const found = pick(item.lines);
    if (openKeys.has(key) && found.length > 0) answered.push({ whisker: key, lines: found });
  }

  const contradictions: FoundContradiction[] = [];
  for (const item of list(parsed.contradictions).slice(0, MAX_CONTRADICTIONS)) {
    if (!isRecord(item) || typeof item.about !== 'string') continue;
    const line = here.get(clean(item.line));
    const other = there.get(clean(item.other));
    const about = item.about.trim().slice(0, 100);
    if (line && other && about) contradictions.push({ about, line, other });
  }
  return { whiskers, answered, contradictions };
};
