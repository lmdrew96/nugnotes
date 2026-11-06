import { describe, expect, it } from 'vitest';
import { classLines, nameKey, parseConcepts, sourceLines } from '../convex/conceptText';
import { NO_NOTES } from '../convex/transcriptText';

const pages = [
  {
    _id: 'pageA',
    order: 0,
    transcript: [{ text: '# Operant conditioning' }, { text: '  neg. reinforcement → behavior ↑' }],
  },
  { _id: 'pageB', order: 1, transcript: [{ text: NO_NOTES }] },
  { _id: 'pageC', order: 2, transcript: [{ text: 'Skinner box' }] },
];

describe('line labels', () => {
  it('labels class lines by page and line, skipping empty pages', () => {
    expect(classLines(pages).map((l) => [l.ref, l.pageId, l.line])).toEqual([
      ['P1.1', 'pageA', 0],
      ['P1.2', 'pageA', 1],
      ['P3.1', 'pageC', 0],
    ]);
  });

  it('labels source lines by PDF page and line, skipping blank lines', () => {
    const lines = sourceLines([{ page: 12, text: 'Free morphemes\n\nstand alone' }]);
    expect(lines.map((l) => [l.ref, l.sourcePage, l.line])).toEqual([
      ['S12.1', 12, 0],
      ['S12.3', 12, 2],
    ]);
  });
});

describe('parseConcepts', () => {
  const lines = classLines(pages);

  it('keeps cited lines and known keys, drops what does not check out', () => {
    const reply = `\`\`\`json
{"concepts":[
  {"name":"Negative reinforcement","kind":"term","existing":"C1","aliases":["neg. reinforcement","negative reinforcement"],"lines":["P1.2","P9.9"]},
  {"name":"Invented","kind":"term","existing":null,"aliases":[],"lines":["P7.1"]},
  {"name":"Skinner box","kind":"weird","existing":"C99","aliases":[],"lines":["[P3.1]"]}
]}
\`\`\``;
    const found = parseConcepts(reply, lines, new Set(['C1']));
    expect(found.map((c) => [c.name, c.kind, c.existing, c.lines.map((l) => l.ref)])).toEqual([
      ['Negative reinforcement', 'term', 'C1', ['P1.2']],
      ['Skinner box', 'other', null, ['P3.1']],
    ]);
    // An alias that is just the name again is dropped.
    expect(found[0].aliases).toEqual(['neg. reinforcement']);
    // The quote is the student's own line, not anything Claude wrote.
    expect(found[0].lines[0].text).toBe('  neg. reinforcement → behavior ↑');
  });

  it('throws when the reply is not JSON', () => {
    expect(() => parseConcepts('Sorry, I cannot.', lines, new Set())).toThrow();
  });
});

describe('nameKey', () => {
  it('matches across case, spacing and curly quotes', () => {
    expect(nameKey('  Pavlov’s   Dogs ')).toBe(nameKey("pavlov's dogs"));
  });
});
