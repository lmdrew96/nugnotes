import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  type MutationCtx,
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server';
import { queueConceptsWhenPagesRead } from './concepts';
import { AI_MODEL_SONNET, callClaude } from './config';
import { r2 } from './r2';
import { TRANSCRIBE_PROMPT, toTranscriptLines } from './transcriptText';

/**
 * Mark a page as being read and schedule Claude to transcribe it. Called when a
 * page is added or retaken, and when the student asks to (re)read pages.
 */
export const queueTranscription = async (ctx: MutationCtx, pageId: Id<'pages'>): Promise<void> => {
  await ctx.db.patch(pageId, { transcriptStatus: 'pending', transcript: undefined });
  await ctx.scheduler.runAfter(0, internal.transcribe.transcribePage, { pageId });
};

export const getPage = internalQuery({
  args: { pageId: v.id('pages') },
  handler: async (ctx, { pageId }) => {
    const page = await ctx.db.get(pageId);
    return page ? { storageKey: page.storageKey } : null;
  },
});

/** Save only if the page still shows the photo that was read (no retake since). */
export const saveTranscript = internalMutation({
  args: {
    pageId: v.id('pages'),
    storageKey: v.string(),
    lines: v.array(v.object({ text: v.string() })),
  },
  handler: async (ctx, { pageId, storageKey, lines }): Promise<void> => {
    const page = await ctx.db.get(pageId);
    if (!page || page.storageKey !== storageKey) return;
    await ctx.db.patch(pageId, { transcriptStatus: 'done', transcript: lines });
    await queueConceptsWhenPagesRead(ctx, page.sessionId);
  },
});

export const markFailed = internalMutation({
  args: { pageId: v.id('pages'), storageKey: v.string() },
  handler: async (ctx, { pageId, storageKey }): Promise<void> => {
    const page = await ctx.db.get(pageId);
    if (!page || page.storageKey !== storageKey) return;
    await ctx.db.patch(pageId, { transcriptStatus: 'failed' });
    await queueConceptsWhenPagesRead(ctx, page.sessionId);
  },
});

/**
 * Read one page photo with Claude vision. Sonnet, because handwriting is the
 * hard part and every later feature trusts this text.
 */
export const transcribePage = internalAction({
  args: { pageId: v.id('pages') },
  handler: async (ctx, { pageId }): Promise<void> => {
    const page = await ctx.runQuery(internal.transcribe.getPage, { pageId });
    if (!page) return; // deleted while queued
    try {
      const url = await r2.getUrl(page.storageKey);
      const reply = await callClaude({
        model: AI_MODEL_SONNET,
        // Room for Sonnet's thinking plus a dense page.
        maxTokens: 16000,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'url', url } },
              { type: 'text', text: TRANSCRIBE_PROMPT },
            ],
          },
        ],
        onUsage: (usage) =>
          console.log(`[transcribe] in=${usage.input_tokens} out=${usage.output_tokens}`),
      });
      const lines = toTranscriptLines(reply);
      if (lines.length === 0) throw new Error('Empty transcript');
      await ctx.runMutation(internal.transcribe.saveTranscript, {
        pageId,
        storageKey: page.storageKey,
        lines,
      });
    } catch (error) {
      console.error(`[transcribe] page ${pageId} failed:`, error);
      await ctx.runMutation(internal.transcribe.markFailed, {
        pageId,
        storageKey: page.storageKey,
      });
    }
  },
});
