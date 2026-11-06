/**
 * The material every AI feature works from: the faithful transcripts of a
 * session's photographed pages, older typed notes, and text extracted from
 * uploaded documents. Replaces ScribeCat's lecture transcript.
 *
 * One builder for all of them, so study tools, games and chat read the same
 * thing — and so the output is byte-identical for a session, which is what lets
 * the study tools cache it (see callClaudeWithLecture in studyTools.ts).
 */
import { ConvexError } from 'convex/values';
import { TRANSCRIPT_MARKS } from './transcriptText';

export interface StudyMaterial {
  /** Transcripts of the session's photographed pages (transcriptText.pagesToText). */
  pages?: string | null;
  notes?: string | null;
  documentText?: string | null;
}

/** What sessions.get returns that the AI tools read from. */
interface SessionWithMaterial {
  pagesText?: string;
  notesPlainText?: string;
  documentText?: string;
  sourceText?: string;
}

/**
 * A session's material: page transcripts, older typed notes, and document text
 * (uploaded documents plus, for a source, its PDF's page-tagged text).
 */
export function sessionMaterial(session: SessionWithMaterial): StudyMaterial {
  const documents = [session.documentText, session.sourceText]
    .map((text) => text?.trim())
    .filter(Boolean)
    .join('\n\n');
  return {
    pages: session.pagesText,
    notes: session.notesPlainText,
    documentText: documents || undefined,
  };
}

/** Below this much text there's nothing worth generating from. */
export const MIN_MATERIAL_CHARS = 80;

/**
 * Total characters of material a prompt carries (~6000 tokens). Big enough to
 * cover a typical session and to clear Haiku's 4096-token caching minimum.
 */
export const MATERIAL_CHARS = 24_000;

export const NOT_ENOUGH_MATERIAL = {
  code: 'NOT_ENOUGH_MATERIAL',
  message:
    'Nugget doesn’t have enough to read here yet. Add pages, or give new pages a minute to be read.',
} as const;

const clean = (s: string | null | undefined) => (s ?? '').trim();

export function materialLength(material: StudyMaterial): number {
  return (
    clean(material.pages).length +
    clean(material.notes).length +
    clean(material.documentText).length
  );
}

export function hasEnoughMaterial(material: StudyMaterial): boolean {
  return materialLength(material) >= MIN_MATERIAL_CHARS;
}

/** Throws the friendly "not enough" error the UI shows as-is. */
export function requireEnoughMaterial(material: StudyMaterial): void {
  if (!hasEnoughMaterial(material)) throw new ConvexError(NOT_ENOUGH_MATERIAL);
}

const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max)}\n…`;

/**
 * The material as one labelled block: the student's own words first (page
 * transcripts, then any older typed notes), then the documents. When there are
 * documents too and it's too long, the student's words get up to half the
 * budget and documents take the rest.
 */
export function buildMaterial(material: StudyMaterial, maxChars = MATERIAL_CHARS): string {
  const pages = clean(material.pages);
  const typed = clean(material.notes);
  // Without pages this is exactly the older typed-notes-only material.
  const notes = pages
    ? [
        `Handwritten pages (faithful transcript. ${TRANSCRIPT_MARKS}):\n${pages}`,
        typed && `Typed notes:\n${typed}`,
      ]
        .filter(Boolean)
        .join('\n\n')
    : typed;
  const docs = clean(material.documentText);
  const notesBudget = docs ? Math.max(maxChars / 2, maxChars - docs.length) : maxChars;
  const notesPart = notes ? clip(notes, notesBudget) : '';
  const docsBudget = maxChars - notesPart.length;

  const sections: string[] = [];
  if (notesPart) sections.push(`STUDENT'S NOTES:\n${notesPart}`);
  if (docs)
    sections.push(
      `UPLOADED DOCUMENTS (text extracted from their files):\n${clip(docs, docsBudget)}`,
    );
  return sections.join('\n\n');
}
