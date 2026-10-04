import { describe, expect, it } from 'vitest';
import {
  MATERIAL_CHARS,
  MIN_MATERIAL_CHARS,
  buildMaterial,
  hasEnoughMaterial,
  requireEnoughMaterial,
} from '../convex/studyMaterial';

const long = (char: string, n: number) => char.repeat(n);

describe('buildMaterial', () => {
  it('works from notes alone', () => {
    expect(buildMaterial({ notes: 'Mitosis has four phases.' })).toBe(
      "STUDENT'S NOTES:\nMitosis has four phases.",
    );
  });

  it('works from documents alone', () => {
    const out = buildMaterial({ documentText: 'Chapter 3: Cell division' });
    expect(out).toBe(
      'UPLOADED DOCUMENTS (text extracted from their files):\nChapter 3: Cell division',
    );
  });

  it('puts notes before documents when both exist', () => {
    const out = buildMaterial({ notes: 'my notes', documentText: 'the reading' });
    expect(out.indexOf("STUDENT'S NOTES")).toBeLessThan(out.indexOf('UPLOADED DOCUMENTS'));
  });

  it('keeps both inside the budget, notes taking at most half when documents are long', () => {
    const out = buildMaterial({ notes: long('n', 30_000), documentText: long('d', 30_000) });
    expect(out.length).toBeLessThan(MATERIAL_CHARS + 200); // labels and ellipses
    const notesChars = out.match(/n/g)?.length ?? 0;
    expect(notesChars).toBeLessThanOrEqual(MATERIAL_CHARS / 2 + 2);
    expect(out).toContain('d'.repeat(1000));
  });

  it('lets short documents leave the rest of the budget to notes', () => {
    const out = buildMaterial({ notes: long('n', 20_000), documentText: 'short reading' });
    expect(out).toContain('n'.repeat(20_000));
  });

  it('is identical for identical input (cache-friendly)', () => {
    const m = { notes: 'a', documentText: 'b' };
    expect(buildMaterial(m)).toBe(buildMaterial({ ...m }));
  });
});

describe('enough material', () => {
  it('needs a little real content across notes and documents', () => {
    expect(hasEnoughMaterial({})).toBe(false);
    expect(hasEnoughMaterial({ notes: '   ' })).toBe(false);
    expect(hasEnoughMaterial({ notes: long('x', MIN_MATERIAL_CHARS) })).toBe(true);
    expect(hasEnoughMaterial({ notes: long('x', 40), documentText: long('y', 40) })).toBe(true);
  });

  it('throws the friendly code the UI shows', () => {
    expect(() => requireEnoughMaterial({ notes: 'hi' })).toThrow(/NOT_ENOUGH_MATERIAL/);
  });
});
