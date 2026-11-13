/**
 * Group a course's concepts into themes. Haiku (AI_MODEL): it only names and
 * sorts a list of concept names, no reading of the notes themselves.
 */
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction } from './_generated/server';
import { AI_MODEL, callClaude } from './config';
import { buildThemePrompt, parseThemes } from './themeText';

export const group = internalAction({
  args: { courseId: v.id('courses'), queuedAt: v.number() },
  handler: async (ctx, { courseId, queuedAt }): Promise<void> => {
    const input = await ctx.runQuery(internal.themes.getGroupInput, { courseId, queuedAt });
    if (!input) return; // superseded
    if (input.tooFew) {
      await ctx.runMutation(internal.themes.finishGrouping, { courseId, queuedAt, failed: false });
      return;
    }
    try {
      const reply = await callClaude({
        model: AI_MODEL,
        maxTokens: 8000,
        messages: [{ role: 'user', content: buildThemePrompt(input) }],
        onUsage: (usage) =>
          console.log(`[themes] in=${usage.input_tokens} out=${usage.output_tokens}`),
      });
      const conceptId = new Map(input.concepts.map((c) => [c.key, c.id]));
      const themeId = new Map(input.themes.map((t) => [t.key, t.id]));
      const toGroup = (g: { key: string | null; name: string; concepts: string[] }) => ({
        existingId: g.key ? themeId.get(g.key) : undefined,
        name: g.name,
        conceptIds: g.concepts.flatMap((k) => conceptId.get(k) ?? []) as Id<'concepts'>[],
      });
      const themes = parseThemes(reply, new Set(conceptId.keys()), new Set(themeId.keys()));
      await ctx.runMutation(internal.themes.saveGrouping, {
        courseId,
        queuedAt,
        themes: themes.map((t) => ({ ...toGroup(t), subthemes: t.subthemes.map(toGroup) })),
      });
    } catch (error) {
      console.error(`[themes] ${courseId} failed:`, error);
      await ctx.runMutation(internal.themes.finishGrouping, { courseId, queuedAt, failed: true });
    }
  },
});
