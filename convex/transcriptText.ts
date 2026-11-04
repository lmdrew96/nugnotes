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

Rules:
- One output line per written line, top to bottom. Show indentation with two spaces per level the student used. Keep bullets, dashes and numbering as written.
- Keep their spelling, abbreviations and shorthand exactly (for example w/, b/c, ex., ∴). Do not expand, correct, reword, summarize, finish or explain anything.
- Write arrows as → ← ↑ ↓ ↔ ⇒.
- Crossed-out writing: wrap it in ~~tildes~~, keeping what is still readable inside.
- A word you cannot read with confidence: write [?] instead, one [?] per unreadable word. Never guess, even when the context suggests a word.
- A drawing or diagram: one line [drawing], then any words written in or around it as their own lines.
- Notes in the margin: on their own line, starting with (margin).
- If the page has no handwritten notes, reply with exactly: ${NO_NOTES}

Reply with the transcript only: no preamble, no commentary, no code fences.`;

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
