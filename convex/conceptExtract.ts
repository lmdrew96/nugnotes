/**
 * Read one session (or source) for concepts, against the course's known ones.
 * Haiku, per the spec's "linking might run on Haiku" (to be compared with
 * Sonnet on the PSYC 100 backfill).
 */
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction } from './_generated/server';
import { buildConceptPrompt, parseConcepts } from './conceptText';
import { AI_MODEL, callClaude } from './config';

export const read = internalAction({
  args: { sessionId: v.id('sessions'), queuedAt: v.number() },
  handler: async (ctx, { sessionId, queuedAt }): Promise<void> => {
    const input = await ctx.runQuery(internal.concepts.getReadInput, { sessionId, queuedAt });
    if (!input) return; // superseded, deleted, or no course
    try {
      if (input.lines.length === 0) {
        await ctx.runMutation(internal.concepts.saveRead, { sessionId, queuedAt, concepts: [] });
        return;
      }
      const reply = await callClaude({
        model: AI_MODEL,
        maxTokens: 8000,
        messages: [{ role: 'user', content: buildConceptPrompt(input) }],
        onUsage: (usage) =>
          console.log(`[concepts] in=${usage.input_tokens} out=${usage.output_tokens}`),
      });
      const byKey = new Map(input.known.map((c) => [c.key, c.id]));
      const found = parseConcepts(reply, input.lines, new Set(byKey.keys()));
      await ctx.runMutation(internal.concepts.saveRead, {
        sessionId,
        queuedAt,
        concepts: found.map((c) => ({
          existingId: c.existing ? byKey.get(c.existing) : undefined,
          name: c.name,
          kind: c.kind,
          aliases: c.aliases,
          mentions: c.lines.map((l) => ({
            pageId: l.pageId as Id<'pages'> | undefined,
            sourcePage: l.sourcePage,
            line: l.line,
            quote: l.text,
          })),
        })),
      });
    } catch (error) {
      console.error(`[concepts] ${sessionId} failed:`, error);
      await ctx.runMutation(internal.concepts.markReadFailed, { sessionId, queuedAt });
    }
  },
});
