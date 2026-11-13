import { describe, expect, it } from 'vitest';
import { type ArcThread, buildArcPrompt, parseArcs } from '../convex/arcText';

const threads: ArcThread[] = [
  {
    key: 'A1',
    name: 'Elaboration',
    sessions: [
      { key: 'S1', date: 'Oct 14', isSource: false, lines: ['elaboration → deeper encoding'] },
      { key: 'S2', date: 'Oct 21', isSource: false, lines: ['study tip: elaborate'] },
    ],
  },
];

describe('parseArcs', () => {
  it('keeps arcs citing 2+ of the thread’s own sessions', () => {
    const reply =
      '{"arcs":[{"thread":"A1","arc":"Encoding idea (Oct 14), then a study tip (Oct 21).","cites":["S1","S2","S9"]},{"thread":"A1","arc":"dupe","cites":["S1","S2"]},{"thread":"A7","arc":"x","cites":["S1","S2"]}]}';
    expect(parseArcs(reply, threads)).toEqual([
      {
        thread: 'A1',
        text: 'Encoding idea (Oct 14), then a study tip (Oct 21).',
        cites: ['S1', 'S2'],
      },
    ]);
  });

  it('drops an arc citing only one session', () => {
    expect(parseArcs('{"arcs":[{"thread":"A1","arc":"x","cites":["S1"]}]}', threads)).toEqual([]);
  });

  it('throws when the reply is not the JSON shape', () => {
    expect(() => parseArcs('no', threads)).toThrow();
  });

  it('lists each session’s date and lines in the prompt', () => {
    expect(buildArcPrompt('PSYC 100', threads)).toContain('[S2] Oct 21\n  study tip: elaborate');
  });
});
