import { describe, expect, it } from 'vitest';
import { CHAT_DOCUMENT_CHARS, buildChatSystemPrompt } from '../convex/nuggetChat';

const DOCUMENTS = 'Lorem ipsum chapter text. '.repeat(200);

const base = {
  documentText: DOCUMENTS,
  notes: 'my notes',
  nuggetNotes: 'key points',
  lectureType: 'stem',
  currentDateTime: 'Monday, September 1, 2026 at 9:15 AM',
};

/** The block carrying cache_control, if any. */
function cachedBlock(blocks: ReturnType<typeof buildChatSystemPrompt>) {
  return blocks.find((b) => b.cache_control);
}

describe('buildChatSystemPrompt cache prefix', () => {
  it('marks a breakpoint when there are documents to cache', () => {
    const blocks = buildChatSystemPrompt(base);
    expect(cachedBlock(blocks)).toBeDefined();
    expect(cachedBlock(blocks)?.text).toContain(DOCUMENTS.trim().slice(0, 40));
  });

  it('keeps the cached block byte-identical as volatile inputs change', () => {
    // The whole point. Caching is a strict prefix match, so if anything that
    // changes between turns leaks into the cached block, the hit rate is zero.
    const first = cachedBlock(buildChatSystemPrompt(base))?.text;
    const later = cachedBlock(
      buildChatSystemPrompt({
        ...base,
        notes: 'my notes, now much longer after more typing',
        nuggetNotes: 'key points plus three more',
        currentDateTime: 'Monday, September 1, 2026 at 9:47 AM',
      }),
    )?.text;

    expect(first).toBeDefined();
    expect(later).toBe(first);
  });

  it('keeps the clock out of the cached block', () => {
    // currentDateTime has minute granularity — inside the cached block it
    // would invalidate the documents every minute.
    const blocks = buildChatSystemPrompt(base);
    expect(cachedBlock(blocks)?.text).not.toContain('9:15 AM');
    expect(blocks.map((b) => b.text).join('')).toContain('9:15 AM');
  });

  it('keeps the student and Nugget notes out of the cached block', () => {
    const cached = cachedBlock(buildChatSystemPrompt(base))?.text ?? '';
    expect(cached).not.toContain('my notes');
    expect(cached).not.toContain('key points');
  });

  it('invalidates the prefix when the documents change, as it must', () => {
    const grown = cachedBlock(
      buildChatSystemPrompt({ ...base, documentText: `${DOCUMENTS} and another upload` }),
    )?.text;
    expect(grown).not.toBe(cachedBlock(buildChatSystemPrompt(base))?.text);
  });

  it('skips the breakpoint entirely with no documents', () => {
    // Nothing worth caching, and a short prefix would silently no-op anyway.
    const blocks = buildChatSystemPrompt({ ...base, documentText: undefined });
    expect(cachedBlock(blocks)).toBeUndefined();
    expect(blocks).toHaveLength(1);
  });

  it('still includes every section it is given', () => {
    const all = buildChatSystemPrompt(base)
      .map((b) => b.text)
      .join('');
    expect(all).toContain('Uploaded Documents');
    expect(all).toContain("Student's Notes");
    expect(all).toContain("Nugget's Key Points");
    expect(all).toContain('Lecture Type');
  });

  it('caps how much document text a chat carries', () => {
    const huge = 'x'.repeat(CHAT_DOCUMENT_CHARS + 5_000);
    const cached = cachedBlock(buildChatSystemPrompt({ ...base, documentText: huge }))?.text ?? '';
    expect(cached).toContain('x'.repeat(CHAT_DOCUMENT_CHARS));
    expect(cached).not.toContain('x'.repeat(CHAT_DOCUMENT_CHARS + 1));
  });
});
