/**
 * Faithful page transcripts: the prompt, turning Claude's reply into lines, and
 * joining a session's pages into study material. Pure, so it can be tested.
 *
 * Rule from the spec: paper is the original. The transcript says what is on
 * the page, in the student's own words and shorthand, and nothing else.
 */

export interface TranscriptLine {
  text: string;
  /** Claude's text, present only when the student fixed the line by hand. */
  original?: string;
}

/** Shown in place of a transcript when a page has no writing on it. */
export const NO_NOTES = '[no notes on this page]';

export const TRANSCRIBE_PROMPT = `Transcribe this photo of a student's handwritten class notes exactly as written. The paper is the original: the student must be able to trust your transcript line by line.

Words:
- Keep their spelling, abbreviations and shorthand exactly (for example w/, b/c, ex., ∴). Do not expand, correct, reword, summarize, finish or explain anything.
- Write arrows as → ← ↑ ↓ ↔ ⇒.
- Crossed-out writing: wrap it in ~~tildes~~, keeping what is still readable inside.
- A word you cannot read with confidence: write [?] instead, one [?] per unreadable word. Never guess, even when the context suggests a word.

Structure (keep the page's shape, using only these marks):
- One output line per written line. Show indentation with two spaces per level the student used. Keep bullets, dashes and numbering as written.
- Reading order: follow the page the way the student would read it. If the page is split into columns or separate areas, finish one before starting the next: start each column with its own line [column 1], [column 2] and so on, left to right.
- Titles and headings: a line the student set apart as a title or heading (bigger, underlined, boxed, circled, starred, or standing alone above a section) starts with "# " for the page title or "## " for a section heading. Don't mark ordinary lines.
- Boxed or circled blocks of text: one line [box], then the boxed lines indented two spaces under it.
- Diagrams, mind maps, flowcharts and drawings: one line [diagram: what kind it is, in a few plain words, e.g. "mind map", "flowchart", "labeled sketch of a neuron"]. Under it, indented two spaces, every label as written, and every arrow or connecting line as its own line "A → B" (or A — B for a plain line), using the student's words for A and B and the direction they drew. Don't explain what the diagram means.
- Margin notes: put each one right after the main line it sits beside, starting with (margin). If it sits beside nothing in particular, put it where it falls top to bottom.
- If the page has no handwritten notes, reply with exactly: ${NO_NOTES}

Reply with the transcript only: no preamble, no commentary, no code fences.`;

/**
 * What the transcript marks mean, for every prompt that hands a transcript to
 * Claude. Keep in step with TRANSCRIBE_PROMPT.
 */
export const TRANSCRIPT_MARKS =
  "[?] marks a word that couldn't be read; never guess it. ~~text~~ is something the student crossed out: it is not part of their notes, so never use it as content. Lines starting # or ## are the student's title and headings. [column N], [box] and [diagram: …] mark the page's layout; the indented lines under a diagram are its labels and the links the student drew (A → B). (margin) is a note written in the margin beside the line before it.";

export type LineKind = 'title' | 'heading' | 'layout' | 'margin' | 'text';

export interface ParsedLine {
  kind: LineKind;
  /** Leading spaces the student's indentation came out as. */
  indent: number;
  /** The line without its indentation and mark. */
  body: string;
}

/** Split a transcript line into its indentation, structure mark and text, for display. */
export const parseLine = (text: string): ParsedLine => {
  const trimmed = text.replace(/^ +/, '');
  const indent = text.length - trimmed.length;
  if (trimmed.startsWith('## ')) return { kind: 'heading', indent, body: trimmed.slice(3) };
  if (trimmed.startsWith('# ')) return { kind: 'title', indent, body: trimmed.slice(2) };
  const layout = trimmed.match(/^\[((?:column \d+|box|drawing|diagram(?::[^\]]*)?))\]$/i);
  if (layout) return { kind: 'layout', indent, body: layout[1] };
  if (trimmed.startsWith('(margin)')) {
    return { kind: 'margin', indent, body: trimmed.slice('(margin)'.length).trim() };
  }
  return { kind: 'text', indent, body: trimmed };
};

/** Claude's reply → transcript lines: fences and blank lines dropped, indentation kept. */
export const toTranscriptLines = (reply: string): TranscriptLine[] =>
  reply
    .replace(/^\s*```[a-z]*\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line.trim().length > 0)
    .map((text) => ({ text }));

/** A session's transcribed pages as one block for the AI tools, page by page. */
export const pagesToText = (pages: { order: number; transcript?: TranscriptLine[] }[]): string =>
  pages
    .filter((page) => page.transcript && page.transcript.length > 0)
    .filter((page) => !(page.transcript?.length === 1 && page.transcript[0].text === NO_NOTES))
    .map((page) => {
      const lines = page.transcript?.map((line) => line.text).join('\n') ?? '';
      return `[Page ${page.order + 1}]\n${lines}`;
    })
    .join('\n\n');
