/**
 * Read one session for whiskers and contradictions, after its concepts. Sonnet
 * (Nae, Nov 5), like the concept read.
 */
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction } from './_generated/server';
import type { RefLine } from './conceptText';
import { AI_MODEL_SONNET, callClaude } from './config';
import { buildGapPrompt, parseGaps } from './gapText';

export const read = internalAction({
  args: { sessionId: v.id('sessions'), queuedAt: v.number() },
  handler: async (ctx, { sessionId, queuedAt }): Promise<void> => {
    const input = await ctx.runQuery(internal.gaps.getGapInput, { sessionId, queuedAt });
    if (!input) return; // superseded, deleted, or no course
    const toRef = (l: RefLine) => ({
      sessionId,
      pageId: l.pageId as Id<'pages'> | undefined,
      sourcePage: l.sourcePage,
      line: l.line,
      quote: l.text,
    });
    try {
      if (input.lines.length === 0) {
        await ctx.runMutation(internal.gaps.saveGaps, {
          sessionId,
          queuedAt,
          whiskers: [],
          answered: [],
          contradictions: [],
        });
        return;
      }
      const reply = await callClaude({
        model: AI_MODEL_SONNET,
        // Room for Sonnet's thinking plus the lists.
        maxTokens: 16000,
        messages: [{ role: 'user', content: buildGapPrompt(input) }],
        onUsage: (usage) =>
          console.log(`[gaps] in=${usage.input_tokens} out=${usage.output_tokens}`),
      });
      const openKeys = new Map(
        input.known.filter((w) => w.status === 'open').map((w) => [w.key, w.id]),
      );
      const found = parseGaps(reply, input.lines, input.others, new Set(openKeys.keys()));
      const otherRef = new Map(input.others.map((o) => [o.ref, o.refData]));
      await ctx.runMutation(internal.gaps.saveGaps, {
        sessionId,
        queuedAt,
        whiskers: found.whiskers.map((w) => ({
          kind: w.kind,
          label: w.label,
          lines: w.lines.map(toRef),
        })),
        answered: found.answered.flatMap((a) => {
          const whiskerId = openKeys.get(a.whisker);
          return whiskerId ? [{ whiskerId, lines: a.lines.map(toRef) }] : [];
        }),
        contradictions: found.contradictions.flatMap((c) => {
          const b = otherRef.get(c.other.ref);
          return b ? [{ about: c.about, a: toRef(c.line), b }] : [];
        }),
      });
    } catch (error) {
      console.error(`[gaps] ${sessionId} failed:`, error);
      await ctx.runMutation(internal.concepts.markReadFailed, { sessionId, queuedAt });
    }
  },
});
