import { describe, expect, it } from 'vitest';
import { buildMaterial, hasEnoughMaterial } from '../convex/studyMaterial';
import { NO_NOTES, pagesToText, parseLine, toTranscriptLines } from '../convex/transcriptText';

describe('toTranscriptLines', () => {
  it('keeps indentation and shorthand, drops blank lines', () => {
    const reply =
      'Morphology\n\n  - free morph. → stands alone\n    ex. cat\n~~bound~~ [?] morph.\n';
    expect(toTranscriptLines(reply).map((l) => l.text)).toEqual([
      'Morphology',
      '  - free morph. → stands alone',
      '    ex. cat',
      '~~bound~~ [?] morph.',
    ]);
  });

  it('strips code fences Claude sometimes adds', () => {
    expect(toTranscriptLines('```\nline one\nline two\n```').map((l) => l.text)).toEqual([
      'line one',
      'line two',
    ]);
  });
});

describe('parseLine', () => {
  it('reads titles and headings', () => {
    expect(parseLine('# Ch. 6 Morphology')).toEqual({
      kind: 'title',
      indent: 0,
      body: 'Ch. 6 Morphology',
    });
    expect(parseLine('## free vs bound')).toEqual({
      kind: 'heading',
      indent: 0,
      body: 'free vs bound',
    });
  });

  it('reads layout marks, keeping indentation', () => {
    expect(parseLine('[column 2]')).toEqual({ kind: 'layout', indent: 0, body: 'column 2' });
    expect(parseLine('  [box]')).toEqual({ kind: 'layout', indent: 2, body: 'box' });
    expect(parseLine('[diagram: mind map]')).toEqual({
      kind: 'layout',
      indent: 0,
      body: 'diagram: mind map',
    });
    expect(parseLine('[drawing]').kind).toBe('layout');
  });

  it('reads margin notes and leaves ordinary lines alone', () => {
    expect(parseLine('(margin) on the exam!')).toEqual({
      kind: 'margin',
      indent: 0,
      body: 'on the exam!',
    });
    expect(parseLine('    stem → morph. → word')).toEqual({
      kind: 'text',
      indent: 4,
      body: 'stem → morph. → word',
    });
    // [?] alone is an unreadable word, not a layout mark; #hashtags aren't headings.
    expect(parseLine('[?]').kind).toBe('text');
    expect(parseLine('#1 rule').kind).toBe('text');
  });
});

describe('pagesToText', () => {
  it('joins read pages in order and skips unread and empty ones', () => {
    const text = pagesToText([
      { order: 0, transcript: [{ text: 'first' }, { text: 'fixed', original: 'fxed' }] },
      { order: 1 },
      { order: 2, transcript: [{ text: NO_NOTES }] },
      { order: 3, transcript: [{ text: 'last' }] },
    ]);
    expect(text).toBe('[Page 1]\nfirst\nfixed\n\n[Page 4]\nlast');
  });
});

describe('buildMaterial with pages', () => {
  it('puts the page transcript first and counts it as material', () => {
    const pages = '[Page 1]\nmorpheme = smallest unit of meaning; free vs bound; ex. un- happy';
    const material = buildMaterial({ pages, documentText: 'Ch. 6 reading' });
    expect(material.indexOf('Handwritten pages')).toBeLessThan(material.indexOf('Ch. 6'));
    expect(hasEnoughMaterial({ pages: `${pages} ${pages}` })).toBe(true);
  });

  it('leaves typed-notes-only material exactly as before', () => {
    expect(buildMaterial({ notes: 'typed' })).toBe("STUDENT'S NOTES:\ntyped");
  });
});
