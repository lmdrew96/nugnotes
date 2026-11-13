import { describe, expect, it } from 'vitest';
import {
  classLines,
  isNoise,
  matchKeys,
  nameKey,
  parseConcepts,
  parseLinks,
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

describe('parseLinks', () => {
  const lines = classLines([
    {
      _id: 'p',
      order: 0,
      transcript: [
        { text: 'H.M. → amnesia' },
        { text: 'Figure 2' },
        { text: 'hippocampus removed' },
      ],
    },
  ]);
  const reply = JSON.stringify({
    concepts: [
      { name: 'H.M.', kind: 'example', existing: null, aliases: [], lines: ['P1.1'] },
      { name: 'Figure 2', kind: 'other', existing: null, aliases: [], lines: ['P1.2'] },
      { name: 'Amnesia', kind: 'term', existing: null, aliases: [], lines: ['P1.1'] },
      { name: 'Hippocampus', kind: 'term', existing: null, aliases: [], lines: ['P1.3'] },
    ],
    links: [
      { a: 0, b: 2, how: 'H.M. is a case of amnesia', lines: ['P1.1'] },
      { a: 2, b: 0, how: 'repeat of the pair', lines: ['P1.1'] },
      { a: 0, b: 1, how: 'links to a dropped concept', lines: ['P1.2'] },
      { a: 0, b: 3, how: 'no real lines', lines: ['P9.9'] },
      { a: 3, b: 3, how: 'itself', lines: ['P1.3'] },
    ],
  });

  it('maps Claude’s positions to the concepts that checked out and drops the rest', () => {
    const concepts = parseConcepts(reply, lines, new Set());
    expect(concepts.map((c) => c.name)).toEqual(['H.M.', 'Amnesia', 'Hippocampus']);
    const links = parseLinks(reply, lines, concepts);
    expect(links.map((l) => [l.a, l.b, l.how, l.lines.map((x) => x.ref)])).toEqual([
      [0, 1, 'H.M. is a case of amnesia', ['P1.1']],
    ]);
  });

  it('is empty when the reply has no links', () => {
    const noLinks = '{"concepts":[]}';
    expect(parseLinks(noLinks, lines, [])).toEqual([]);
  });
});
