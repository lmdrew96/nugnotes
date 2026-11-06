import { describe, expect, it } from 'vitest';
import { buildQuizPrompt, parseQuiz } from '../convex/quizText';

describe('parseQuiz', () => {
  it('keeps well-formed questions that cite real lines', () => {
    const reply = `\`\`\`json
${JSON.stringify({
  questions: [
    {
      question: 'What is negative reinforcement?',
      options: ['Removing something bad', 'Adding something bad', 'Ignoring', 'Rewarding'],
      correctIndex: 0,
      explanation: 'Your notes say removing an unpleasant stimulus increases behavior.',
      lines: ['1S1.2', '[1S1.2]'],
    },
    { question: 'No lines', options: ['a', 'b', 'c', 'd'], correctIndex: 1, lines: ['9P9.9'] },
    { question: 'Three options', options: ['a', 'b', 'c'], correctIndex: 0, lines: ['1S1.2'] },
    { question: 'Bad answer', options: ['a', 'b', 'c', 'd'], correctIndex: 4, lines: ['1S1.2'] },
  ],
})}
\`\`\``;
    const questions = parseQuiz(reply, new Set(['1S1.2']));
    expect(questions).toHaveLength(1);
    expect(questions[0].refs).toEqual(['1S1.2']);
    expect(questions[0].correctIndex).toBe(0);
  });

  it('throws when the reply is not JSON', () => {
    expect(() => parseQuiz('nope', new Set())).toThrow();
  });
});

describe('buildQuizPrompt', () => {
  it('keeps a thread quiz on its concept', () => {
    const prompt = buildQuizPrompt({
      courseName: 'PSYC 100',
      scope: 'the thread on Weber’s law',
      focus: { name: 'Weber’s law', aliases: ['JND rule'] },
      lines: [{ ref: '1P1.1', text: 'Weber’s law: JND is a constant proportion', line: 0 }],
      count: 5,
    });
    expect(prompt).toContain('Every question must be about "Weber’s law" (also written: JND rule)');
    expect(prompt).toContain('[1P1.1] Weber’s law: JND is a constant proportion');
    expect(prompt).toContain('Write 5 questions');
  });
});
