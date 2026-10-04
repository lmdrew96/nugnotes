import { ConvexError, v } from 'convex/values';
import { api } from './_generated/api';
import { action } from './_generated/server';
import { callClaude } from './config';
import { type LectureType, getNoteGenerationPrompt } from './prompts';

/** Most document text one generation reads (~10k tokens). */
const NOTE_SOURCE_CHARS = 40_000;

/**
 * Turn a session's uploaded documents into markdown notes. Reads the session
 * as the caller, so only its owner can run this; the editor appends the result.
 */
export const generateNotes = action({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }): Promise<{ notes: string }> => {
    const session = await ctx.runQuery(api.sessions.get, { id: sessionId });
    if (!session) throw new ConvexError({ code: 'NOT_FOUND', message: 'Session not found.' });
    const documentText = session.documentText?.trim();
    if (!documentText) {
      throw new ConvexError({
        code: 'NO_DOCUMENT',
        message: 'Upload a document first, then Nugget can turn it into notes.',
      });
    }

    const prompt = getNoteGenerationPrompt(
      documentText.slice(0, NOTE_SOURCE_CHARS),
      (session.lectureType || 'general') as LectureType,
      session.notesPlainText,
    );
    const notes = await callClaude({
      maxTokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });
    return { notes };
  },
});
