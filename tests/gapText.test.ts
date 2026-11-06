import { describe, expect, it } from 'vitest';
import { sourceLines } from '../convex/conceptText';
import { type OtherLine, buildGapPrompt, parseGaps } from '../convex/gapText';

const lines = sourceLines([
  {
    page: 1,
    text: "Absolute threshold - see reading ch. 4\nWeber's law: JND is a constant amount\nQ: why do smells fade?",
  },
]);
const others: OtherLine[] = [
  {
    ref: 'E1',
    text: "Weber's law: JND is a constant proportion",
    line: 2,
    sourcePage: 1,
    sessionId: 'other',
    where: 'Oct 1, 2026, Week 4',
  },
];

describe('parseGaps', () => {
  it('keeps checked whiskers, answers and contradictions and drops the rest', () => {
    const reply = JSON.stringify({
      whiskers: [
        { kind: 'follow-up', label: 'what to read in ch. 4', lines: ['S1.1'] },
        { kind: 'question', label: 'why smells fade', lines: ['[S1.3]'] },
        { kind: 'made-up', label: 'bad kind', lines: ['S1.1'] },
        { kind: 'undefined', label: 'no real line', lines: ['S9.9'] },
      ],
      answered: [
        { whisker: 'W1', lines: ['S1.2'] },
        { whisker: 'W7', lines: ['S1.2'] },
      ],
      contradictions: [
        { about: "Weber's law", line: 'S1.2', other: 'E1' },
        { about: 'bad other', line: 'S1.2', other: 'E5' },
      ],
    });
    const found = parseGaps(reply, lines, others, new Set(['W1']));
    expect(found.whiskers.map((w) => [w.kind, w.label, w.lines[0].ref])).toEqual([
      ['follow-up', 'what to read in ch. 4', 'S1.1'],
      ['question', 'why smells fade', 'S1.3'],
    ]);
    expect(found.answered.map((a) => a.whisker)).toEqual(['W1']);
    expect(found.contradictions).toHaveLength(1);
    expect(found.contradictions[0].other.text).toBe("Weber's law: JND is a constant proportion");
  });

  it('throws when the reply is not JSON', () => {
    expect(() => parseGaps('no idea', lines, others, new Set())).toThrow();
  });
});

describe('buildGapPrompt', () => {
  it('lists only open whiskers in the answer checklist', () => {
    const prompt = buildGapPrompt({
      title: 'Week 9',
      isSource: false,
      lines,
      others,
      known: [
        { key: 'W1', kind: 'question', label: 'why smells fade', status: 'open' },
        { key: 'W2', kind: 'undefined', label: 'definition of JND', status: 'answered' },
      ],
    });
    const checklist = prompt.slice(prompt.indexOf('Open whiskers to check'));
    expect(checklist).toContain('W1: why smells fade');
    expect(checklist.split('Lines from other sessions')[0]).not.toContain('W2');
  });
});
