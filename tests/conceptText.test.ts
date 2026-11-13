import { describe, expect, it } from 'vitest';
import {
  classLines,
  isNoise,
  matchKeys,
  nameKey,
  parseConcepts,
  sourceLines,
  splitAbbreviation,
} from '../convex/conceptText';
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

describe('matching wordings of one concept', () => {
  const same = (a: string, b: string) => matchKeys(a).some((k) => matchKeys(b).includes(k));

  it('matches abbreviation, parenthetical, hyphen, case and plural forms', () => {
    expect(same('Long Term Memory (LTM)', 'LTM')).toBe(true);
    expect(same('Long Term Memory (LTM)', 'long-term memory')).toBe(true);
    expect(same('Schemas', 'schema')).toBe(true);
    expect(same('memories', 'Memory')).toBe(true);
    expect(same('neg. reinforcement', 'Neg reinforcement')).toBe(true);
  });

  it('keeps different ideas apart', () => {
    expect(same('Memory', 'Long-term memory')).toBe(false);
    expect(same('Classical conditioning', 'Operant conditioning')).toBe(false);
    expect(same('Analysis', 'Analyses')).toBe(false);
  });

  it('only splits off a parenthetical that looks like an abbreviation', () => {
    expect(splitAbbreviation('Long Term Memory (LTM)')).toEqual({
      name: 'Long Term Memory',
      abbreviation: 'LTM',
    });
    expect(splitAbbreviation('Memory (types of)')).toEqual({ name: 'Memory (types of)' });
  });

  it('flags figure and table labels as noise', () => {
    expect(isNoise('Figure 7.14')).toBe(true);
    expect(isNoise('Fig. 3')).toBe(true);
    expect(isNoise('Table 2')).toBe(true);
    expect(isNoise('7.14')).toBe(true);
    expect(isNoise('Figure-ground')).toBe(false);
    expect(isNoise('Pitfall')).toBe(false); // left to the prompt
  });

  it('parseConcepts drops noise and moves a parenthesized abbreviation to aliases', () => {
    const lines = classLines([
      { _id: 'p', order: 0, transcript: [{ text: 'LTM: unlimited' }, { text: 'see Fig 7.14' }] },
    ]);
    const found = parseConcepts(
      '{"concepts":[{"name":"Long Term Memory (LTM)","kind":"term","existing":null,"aliases":[],"lines":["P1.1"]},{"name":"Figure 7.14","kind":"other","existing":null,"aliases":[],"lines":["P1.2"]}]}',
      lines,
      new Set(),
    );
    expect(found.map((c) => [c.name, c.aliases])).toEqual([['Long Term Memory', ['LTM']]]);
  });
});
