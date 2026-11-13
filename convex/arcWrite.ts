/**
 * Write arcs for a course's changed threads. Haiku (AI_MODEL), ten threads per
 * call: each arc is one line drawn from a few lines per session.
 */
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { buildArcPrompt, parseArcs } from './arcText';
import { AI_MODEL, callClaude } from './config';

const THREADS_PER_CALL = 10;

export const write = internalAction({
  args: { courseId: v.id('courses'), queuedAt: v.number() },
  handler: async (ctx, { courseId, queuedAt }): Promise<void> => {
    const input = await ctx.runQuery(internal.arcs.getArcInput, { courseId, queuedAt });
    if (!input) return; // superseded
    const arcs = [];
    for (let i = 0; i < input.threads.length; i += THREADS_PER_CALL) {
      const batch = input.threads.slice(i, i + THREADS_PER_CALL);
      try {
        const reply = await callClaude({
          model: AI_MODEL,
          maxTokens: 4000,
          messages: [{ role: 'user', content: buildArcPrompt(input.courseName, batch) }],
          onUsage: (usage) =>
            console.log(`[arcs] in=${usage.input_tokens} out=${usage.output_tokens}`),
        });
        for (const arc of parseArcs(reply, batch)) {
          const thread = batch.find((t) => t.key === arc.thread);
          if (!thread) continue;
          arcs.push({
            conceptId: thread.conceptId,
            text: arc.text,
            signature: thread.signature,
            cites: arc.cites.flatMap(
              (key) => thread.sessions.find((s) => s.key === key)?.cite ?? [],
            ),
          });
        }
      } catch (error) {
        // One bad batch shouldn't lose the others; its threads are retried next run.
        console.error(`[arcs] ${courseId} batch ${i / THREADS_PER_CALL + 1} failed:`, error);
      }
    }
    await ctx.runMutation(internal.arcs.saveArcs, {
      courseId,
      queuedAt,
      arcs,
      clear: input.clear,
      more: input.more,
    });
  },
});
