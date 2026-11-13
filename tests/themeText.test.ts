import { describe, expect, it } from 'vitest';
import { buildThemePrompt, parseThemes } from '../convex/themeText';

const concepts = new Set(['C1', 'C2', 'C3', 'C4', 'C5']);
const themes = new Set(['T1', 'T2']);

describe('parseThemes', () => {
  it('keeps known keys, places each concept once, and allows one level of sub-themes', () => {
    const reply = `\`\`\`json
{"themes":[
  {"key":"T1","name":"Memory","concepts":["C1","C9"],"subthemes":[{"key":null,"name":"Explicit memory","concepts":["C2","C1"]}]},
  {"key":"T7","name":"Perception","concepts":["C3","C2"],"subthemes":[]},
  {"key":"T1","name":"Brain","concepts":["C4"]}
]}
\`\`\``;
    expect(parseThemes(reply, concepts, themes)).toEqual([
      {
        key: 'T1',
        name: 'Memory',
        concepts: ['C1'],
        subthemes: [{ key: null, name: 'Explicit memory', concepts: ['C2'] }],
      },
      { key: null, name: 'Perception', concepts: ['C3'], subthemes: [] },
      { key: null, name: 'Brain', concepts: ['C4'], subthemes: [] },
    ]);
  });

  it('drops themes left with no concepts', () => {
    const reply =
      '{"themes":[{"key":null,"name":"Empty","concepts":["C9"]},{"key":"T2","name":"Social","concepts":["C5"]}]}';
    expect(parseThemes(reply, concepts, themes).map((t) => t.name)).toEqual(['Social']);
  });

  it('throws when the reply is not the JSON shape', () => {
    expect(() => parseThemes('Sorry, no.', concepts, themes)).toThrow();
    expect(() => parseThemes('{"groups":[]}', concepts, themes)).toThrow();
  });
});

describe('buildThemePrompt', () => {
  it('lists themes, student names, dismissed groupings and concepts', () => {
    const prompt = buildThemePrompt({
      courseName: 'PSYC 100',
      concepts: [
        { key: 'C1', name: 'Long-term memory', aliases: ['LTM'], sessions: 3, theme: 'T1' },
      ],
      themes: [{ key: 'T1', name: 'How we remember', renamed: true }],
      dismissed: ['Misc'],
    });
    expect(prompt).toContain('T1: How we remember [named by the student');
    expect(prompt).toContain("don't suggest them again: Misc");
    expect(prompt).toContain('C1: Long-term memory (also: LTM) · 3 sessions · now in T1');
  });
});
