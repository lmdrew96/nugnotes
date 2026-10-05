/**
 * The material every AI feature works from: a session's typed notes (the plain
 * text the notes editor saves) and the text extracted from its uploaded
 * documents and handwriting. Replaces ScribeCat's lecture transcript.
 *
 * One builder for all of them, so study tools, games and chat read the same
 * thing — and so the output is byte-identical for a session, which is what lets
 * the study tools cache it (see callClaudeWithLecture in studyTools.ts).
 */
import { ConvexError } from 'convex/values';

export interface StudyMaterial {
  notes?: string | null;
  documentText?: string | null;
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
    "There isn't enough here to work from yet — write some notes or upload a document first.",
} as const;

const clean = (s: string | null | undefined) => (s ?? '').trim();

export function materialLength(material: StudyMaterial): number {
  return clean(material.notes).length + clean(material.documentText).length;
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
 * The material as one labelled block: the student's notes first (their own
 * words, usually the more focused), then the documents. When both are present
 * and too long, notes get up to half the budget and documents take the rest.
 */
export function buildMaterial(material: StudyMaterial, maxChars = MATERIAL_CHARS): string {
  const notes = clean(material.notes);
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
