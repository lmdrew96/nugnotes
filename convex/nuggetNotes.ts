/**
 * Nugget's key points — a short bullet list of what matters most in a session,
 * pulled from its notes and uploaded documents when the student asks. Saved on
 * the session (sessions.nuggetNotes), shown in the Study view's Nugget Notes
 * tab and passed to Nugget chat as context.
 */
import { ConvexError, v } from 'convex/values';
import { api } from './_generated/api';
import { action } from './_generated/server';
import { callClaude } from './config';
import { type LectureType, getKeyPointsPrompt, parseKeyPoints } from './prompts';
import { buildMaterial, requireEnoughMaterial } from './studyMaterial';

export const generateKeyPoints = action({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }): Promise<{ count: number }> => {
    // Runs as the caller: a session that isn't theirs comes back null.
    const session = await ctx.runQuery(api.sessions.get, { id: sessionId });
    if (!session) throw new ConvexError({ code: 'NOT_FOUND', message: 'Session not found.' });
    const material = { notes: session.notesPlainText, documentText: session.documentText };
    requireEnoughMaterial(material);

    const reply = await callClaude({
      maxTokens: 600,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: getKeyPointsPrompt(
            buildMaterial(material),
            (session.lectureType || 'general') as LectureType,
          ),
        },
      ],
    });
    const points = parseKeyPoints(reply);
    if (points.length === 0) {
      throw new ConvexError({
        code: 'NO_KEY_POINTS',
        message: "Nugget couldn't find clear key points this time. Try again in a moment.",
      });
    }

    await ctx.runMutation(api.sessions.update, {
      id: sessionId,
      nuggetNotes: points.map((text) => ({ text })),
    });
    return { count: points.length };
  },
});
