import { describe, expect, it } from 'vitest';
import {
  MAX_KEY_POINTS,
  getKeyPointsPrompt,
  getNoteGenerationPrompt,
  parseKeyPoints,
} from '../convex/prompts';

describe('getNoteGenerationPrompt', () => {
  it('works from the uploaded documents, not a transcript', () => {
    const prompt = getNoteGenerationPrompt('Chapter 4: Enzymes', 'stem');
    expect(prompt).toContain('STUDY MATERIAL:\nChapter 4: Enzymes');
    expect(prompt.toLowerCase()).not.toContain('transcript');
  });

  it("frames the student's notes as context to complement", () => {
    const prompt = getNoteGenerationPrompt('reading', 'general', 'my own notes');
    expect(prompt).toContain("THE STUDENT'S NOTES SO FAR:\nmy own notes");
    expect(prompt).toContain('Do NOT simply repeat their notes');
  });

  it('omits the notes section when there are none', () => {
    for (const notes of [undefined, '', '   ']) {
      expect(getNoteGenerationPrompt('reading', 'general', notes)).not.toContain("STUDENT'S NOTES");
    }
  });
});

describe('key points', () => {
  it('asks for a bounded bullet list from the material', () => {
    const prompt = getKeyPointsPrompt("STUDENT'S NOTES:\nphotosynthesis", 'stem');
    expect(prompt).toContain(`3-${MAX_KEY_POINTS} bullet points`);
    expect(prompt).toContain('photosynthesis');
  });

  it('parses bullets, strips bold, drops scraps and caps the count', () => {
    const reply = [
      'Here are the key points:',
      '- **ATP** carries energy in cells',
      '• Enzymes lower activation energy',
      '- ok',
      ...Array.from({ length: 12 }, (_, i) => `- Extra point number ${i}`),
    ].join('\n');
    const points = parseKeyPoints(reply);
    expect(points[0]).toBe('ATP carries energy in cells');
    expect(points[1]).toBe('Enzymes lower activation energy');
    expect(points).not.toContain('ok');
    expect(points).toHaveLength(MAX_KEY_POINTS);
  });
});
