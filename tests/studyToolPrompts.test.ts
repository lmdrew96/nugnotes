import { describe, expect, it } from 'vitest';
import { MATERIAL_CHARS, buildMaterial } from '../convex/studyMaterial';
import {
  getConceptMapPrompt,
  getEli5Prompt,
  getFlashcardPrompt,
  getJeopardyPrompt,
  getKeyConceptsPrompt,
  getQuizPrompt,
  getSummaryPrompt,
} from '../convex/studyToolPrompts';

/**
 * The session's material is sent as a cached prefix shared by every study tool.
 * Caching is a byte-exact prefix match, so these guard the two ways it breaks
 * silently: the prefix varying between tools, and session text leaking into a
 * per-tool instruction.
 */
describe('study tool prompt caching shape', () => {
  const documentText = 'The mitochondria is the powerhouse of the cell. '.repeat(1000);
  const notes = 'ATP synthesis happens in the inner membrane.';

  it('builds the same material prefix every time for the same session', () => {
    expect(buildMaterial({ notes, documentText })).toBe(buildMaterial({ notes, documentText }));
  });

  it('caps long material at MATERIAL_CHARS', () => {
    const input = buildMaterial({ documentText });
    expect(input.length).toBeLessThan(MATERIAL_CHARS + 100);
  });

  it('is long enough to clear Haiku 4.5’s 4096-token cache minimum on a real session', () => {
    // ~4 chars per token is a rough rule; this just checks the cap isn't
    // quietly lowered back under the threshold.
    expect(MATERIAL_CHARS / 4).toBeGreaterThan(4096);
  });

  it('never puts session text in the per-tool instructions', () => {
    const instructions = [
      getSummaryPrompt('stem'),
      getKeyConceptsPrompt('stem'),
      getFlashcardPrompt('stem', 10),
      getQuizPrompt('stem', 10),
      getConceptMapPrompt('stem'),
      getEli5Prompt('stem'),
      getJeopardyPrompt('stem'),
    ];
    for (const instruction of instructions) {
      expect(instruction).not.toContain("STUDENT'S NOTES");
      expect(instruction).not.toContain('mitochondria');
      expect(instruction.toLowerCase()).not.toContain('lecture content');
    }
  });
});
