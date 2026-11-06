/**
 * Course quiz: the prompt and checking Claude's reply. Pure, so it can be
 * tested. Questions are built from the student's own lines (and sources), and
 * each must cite the lines it came from, so every answer can show its page.
 */
import type { RefLine } from './conceptText';

const MAX_INPUT_CHARS = 60_000;

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  /** Line labels (P2.3 / S12.1) the question came from. */
  refs: string[];
}

export const buildQuizPrompt = (opts: {
  courseName: string;
  scope: string;
  focus?: { name: string; aliases: string[] };
  lines: RefLine[];
  count: number;
}): string => {
  const out: string[] = [];
  let used = 0;
  for (const l of opts.lines) {
    const row = `[${l.ref}] ${l.text}`;
    used += row.length + 1;
    if (used > MAX_INPUT_CHARS) break;
    out.push(row);
  }
  const focus = opts.focus
    ? `\nEvery question must be about "${opts.focus.name}"${opts.focus.aliases.length ? ` (also written: ${opts.focus.aliases.join(', ')})` : ''}: what it is, how it works, examples, how it connects to other ideas in the lines.`
    : '';
  return `You write a multiple choice quiz for a student from their own notes for ${opts.courseName} (${opts.scope}). Each line starts with its label. Lines labelled P are the student's handwritten notes; lines labelled S are from readings or slides.
Marks: ~~crossed out~~ is not content, never use it; [?] is an unreadable word; # and ## are headings.${focus}

<notes>
${out.join('\n')}
</notes>

Write ${opts.count} questions. Reply with JSON only, no code fences:
{"questions":[{"question":"…","options":["…","…","…","…"],"correctIndex":0,"explanation":"…","lines":["P1.2"]}]}

Rules:
- Every question and its right answer must come from these lines. Never test anything the lines don't say.
- lines: the labels of the lines the answer comes from (1 to 3). Only labels from the notes.
- 4 options, one clearly right, three plausible but wrong. Vary which position is right.
- explanation: one or two sentences saying why, in plain words, based on the lines.
- Spread questions across different ideas and sessions; mix recall with "which example fits" and "how do these connect".`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Claude's reply → questions that check out (4 string options, a valid answer, real lines). */
export const parseQuiz = (reply: string, validRefs: Set<string>): QuizQuestion[] => {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : reply).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Quiz reply had no JSON');
  const parsed: unknown = JSON.parse(body.slice(start, end + 1));
  if (!isRecord(parsed) || !Array.isArray(parsed.questions)) {
    throw new Error('Quiz reply missing questions');
  }
  const out: QuizQuestion[] = [];
  for (const q of parsed.questions) {
    if (!isRecord(q) || typeof q.question !== 'string' || !Array.isArray(q.options)) continue;
    const options = q.options.filter((o): o is string => typeof o === 'string');
    const correctIndex = typeof q.correctIndex === 'number' ? q.correctIndex : -1;
    const refs = (Array.isArray(q.lines) ? q.lines : [])
      .filter((r): r is string => typeof r === 'string')
      .map((r) => r.replace(/[[\]]/g, '').trim())
      .filter((r) => validRefs.has(r));
    if (options.length !== 4 || correctIndex < 0 || correctIndex > 3 || refs.length === 0) continue;
    out.push({
      question: q.question.trim(),
      options,
      correctIndex,
      explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
      refs: [...new Set(refs)].slice(0, 3),
    });
  }
  return out;
};
