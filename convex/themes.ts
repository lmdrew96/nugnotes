/**
 * Themes: a course's concepts grouped into its handful of big topics, the top
 * level of the Threads screen. Claude groups them (convex/themeGroup.ts) once a
 * course's sessions are read; the student renames, moves a concept, or
 * dismisses a theme, and regrouping keeps those corrections.
 */
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  type MutationCtx,
  type QueryCtx,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { requireAuth } from './authHelpers';
import type { ExistingTheme, ThemeConcept } from './themeText';

/** Wait a little, so a burst of finished reads leads to one grouping. */
const GROUP_DELAY_MS = 5_000;
/** Too few concepts to be worth grouping. */
const MIN_CONCEPTS = 6;

const themesOfCourse = (ctx: QueryCtx, courseId: Id<'courses'>) =>
  ctx.db
    .query('themes')
    .withIndex('by_course', (q) => q.eq('courseId', courseId))
    .collect();

/** Live sessions of a course, and which of them each concept shows up in. */
const courseStats = async (ctx: QueryCtx, courseId: Id<'courses'>) => {
  const sessions = (
    await ctx.db
      .query('sessions')
      .withIndex('by_course', (q) => q.eq('courseId', courseId))
      .collect()
  ).filter((s) => !s.isDeleted);
  const live = new Map(sessions.map((s) => [s._id, s]));
  const mentions = await ctx.db
    .query('conceptMentions')
    .withIndex('by_course', (q) => q.eq('courseId', courseId))
    .collect();
  const sessionsOf = new Map<Id<'concepts'>, Set<Id<'sessions'>>>();
  for (const m of mentions) {
    if (!live.has(m.sessionId)) continue;
    const set = sessionsOf.get(m.conceptId) ?? new Set();
    set.add(m.sessionId);
    sessionsOf.set(m.conceptId, set);
  }
  return { sessions: live, sessionsOf };
};

/** Queue a regrouping of a course's themes. A later queue supersedes an earlier one. */
export const queueThemes = async (ctx: MutationCtx, courseId: Id<'courses'>): Promise<void> => {
  const queuedAt = Date.now();
  await ctx.db.patch(courseId, { themesStatus: 'pending', themesQueuedAt: queuedAt });
  await ctx.scheduler.runAfter(GROUP_DELAY_MS, internal.themeGroup.group, { courseId, queuedAt });
};

/** A session's read finished (or failed): regroup once the course has none left reading. */
export const afterSessionRead = async (
  ctx: MutationCtx,
  courseId: Id<'courses'>,
): Promise<void> => {
  const reading = await ctx.db
    .query('sessions')
    .withIndex('by_course', (q) => q.eq('courseId', courseId))
    .filter((q) =>
      q.and(q.eq(q.field('conceptsStatus'), 'pending'), q.neq(q.field('isDeleted'), true)),
    )
    .first();
  if (!reading) await queueThemes(ctx, courseId);
};

const requireOwnCourse = async (ctx: QueryCtx, courseId: Id<'courses'>) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const course = await ctx.db.get(courseId);
  return course && course.userId === identity.subject ? course : null;
};

const requireOwnTheme = async (ctx: MutationCtx, themeId: Id<'themes'>) => {
  const userId = await requireAuth(ctx);
  const theme = await ctx.db.get(themeId);
  if (!theme || theme.userId !== userId) throw new Error('Theme not found');
  return theme;
};

// ── Reads for the UI ──

/**
 * A course's themes, each with its threads (concepts in 2+ sessions, its
 * sub-themes' included), the sessions it spans and their date range.
 */
export const listForCourse = query({
  args: { courseId: v.id('courses') },
  handler: async (ctx, { courseId }) => {
    const course = await requireOwnCourse(ctx, courseId);
    if (!course) return null;
    const { sessions, sessionsOf } = await courseStats(ctx, courseId);
    const themes = await themesOfCourse(ctx, courseId);
    const concepts = (
      await ctx.db
        .query('concepts')
        .withIndex('by_course', (q) => q.eq('courseId', courseId))
        .collect()
    ).filter((c) => !c.dismissed && (sessionsOf.get(c._id)?.size ?? 0) > 0);
    const topOf = (themeId: Id<'themes'>) => {
      const theme = themes.find((t) => t._id === themeId);
      return theme?.parentId ?? themeId;
    };
    const shown = themes
      .filter((t) => !t.dismissed)
      .map((t) => {
        const own = concepts.filter(
          (c) => c.themeId && (t.parentId ? c.themeId === t._id : topOf(c.themeId) === t._id),
        );
        const spanned = new Set(own.flatMap((c) => [...(sessionsOf.get(c._id) ?? [])]));
        const dates = [...spanned]
          .flatMap((id) => sessions.get(id)?.classDate ?? [])
          .sort((a, b) => a.localeCompare(b));
        return {
          _id: t._id,
          name: t.name,
          parentId: t.parentId,
          threadCount: own.filter((c) => (sessionsOf.get(c._id)?.size ?? 0) >= 2).length,
          sessionCount: spanned.size,
          from: dates[0],
          to: dates[dates.length - 1],
        };
      })
      .filter((t) => t.sessionCount > 0)
      .sort((a, b) => b.threadCount - a.threadCount || a.name.localeCompare(b.name));
    return {
      status: course.themesStatus,
      themes: shown,
      dismissed: themes.filter((t) => t.dismissed).map((t) => ({ _id: t._id, name: t.name })),
    };
  },
});

// ── Student actions ──

/** Name a theme yourself; regrouping keeps the name. */
export const rename = mutation({
  args: { themeId: v.id('themes'), name: v.string() },
  handler: async (ctx, { themeId, name }): Promise<void> => {
    await requireOwnTheme(ctx, themeId);
    const trimmed = name.trim().slice(0, 60);
    if (!trimmed) throw new Error('A theme needs a name');
    await ctx.db.patch(themeId, { name: trimmed, renamed: true, updatedAt: Date.now() });
  },
});

/**
 * Dismiss a wrong theme: its concepts (and its sub-themes') are regrouped
 * elsewhere and the grouping isn't suggested again. Bringing it back regroups too.
 */
export const setDismissed = mutation({
  args: { themeId: v.id('themes'), dismissed: v.boolean() },
  handler: async (ctx, { themeId, dismissed }): Promise<void> => {
    const theme = await requireOwnTheme(ctx, themeId);
    const now = Date.now();
    await ctx.db.patch(themeId, { dismissed, updatedAt: now });
    if (dismissed) {
      const all = await themesOfCourse(ctx, theme.courseId);
      const ids = new Set([
        themeId,
        ...all.filter((t) => t.parentId === themeId).map((t) => t._id),
      ]);
      for (const sub of all) {
        if (sub.parentId === themeId) await ctx.db.patch(sub._id, { dismissed: true });
      }
      const concepts = await ctx.db
        .query('concepts')
        .withIndex('by_course', (q) => q.eq('courseId', theme.courseId))
        .collect();
      for (const c of concepts) {
        if (c.themeId && ids.has(c.themeId)) {
          await ctx.db.patch(c._id, { themeId: undefined, themePinned: false });
        }
      }
    }
    await queueThemes(ctx, theme.courseId);
  },
});

/** Move a concept to another theme (or sub-theme); regrouping leaves it there. */
export const moveConcept = mutation({
  args: { conceptId: v.id('concepts'), themeId: v.id('themes') },
  handler: async (ctx, { conceptId, themeId }): Promise<void> => {
    const theme = await requireOwnTheme(ctx, themeId);
    const concept = await ctx.db.get(conceptId);
    if (!concept || concept.userId !== theme.userId || concept.courseId !== theme.courseId) {
      throw new Error('Concept not found');
    }
    await ctx.db.patch(conceptId, { themeId, themePinned: true, updatedAt: Date.now() });
  },
});

/** Group a course's concepts into themes now (e.g. a course read before themes existed). */
export const group = mutation({
  args: { courseId: v.id('courses') },
  handler: async (ctx, { courseId }): Promise<void> => {
    const userId = await requireAuth(ctx);
    const course = await ctx.db.get(courseId);
    if (!course || course.userId !== userId) throw new Error('Course not found');
    await queueThemes(ctx, courseId);
  },
});

// ── Used by the grouping action ──

export const getGroupInput = internalQuery({
  args: { courseId: v.id('courses'), queuedAt: v.number() },
  handler: async (ctx, { courseId, queuedAt }) => {
    const course = await ctx.db.get(courseId);
    if (!course || course.themesQueuedAt !== queuedAt) return null; // superseded
    const { sessionsOf } = await courseStats(ctx, courseId);
    const themes = await themesOfCourse(ctx, courseId);
    const live = themes.filter((t) => !t.dismissed);
    const themeKey = new Map(live.map((t, i) => [t._id, `T${i + 1}`]));
    const existing: (ExistingTheme & { id: Id<'themes'> })[] = live.map((t) => ({
      key: themeKey.get(t._id) ?? '',
      id: t._id,
      name: t.name,
      renamed: t.renamed,
      parent: t.parentId ? themeKey.get(t.parentId) : undefined,
    }));
    // Concepts the student placed stay put, so they aren't sent to be grouped.
    const free = (
      await ctx.db
        .query('concepts')
        .withIndex('by_course', (q) => q.eq('courseId', courseId))
        .collect()
    ).filter((c) => !c.dismissed && !c.themePinned && (sessionsOf.get(c._id)?.size ?? 0) > 0);
    const concepts: (ThemeConcept & { id: Id<'concepts'> })[] = free.map((c, i) => ({
      key: `C${i + 1}`,
      id: c._id,
      name: c.name,
      aliases: c.aliases,
      sessions: sessionsOf.get(c._id)?.size ?? 0,
      theme: c.themeId ? themeKey.get(c.themeId) : undefined,
    }));
    return {
      courseName: course.name,
      concepts,
      themes: existing,
      dismissed: themes.filter((t) => t.dismissed).map((t) => t.name),
      tooFew: concepts.length < MIN_CONCEPTS,
    };
  },
});

const groupArg = v.object({
  existingId: v.optional(v.id('themes')),
  name: v.string(),
  conceptIds: v.array(v.id('concepts')),
});

export const saveGrouping = internalMutation({
  args: {
    courseId: v.id('courses'),
    queuedAt: v.number(),
    themes: v.array(v.object({ ...groupArg.fields, subthemes: v.array(groupArg) })),
  },
  handler: async (ctx, { courseId, queuedAt, themes }): Promise<void> => {
    const course = await ctx.db.get(courseId);
    if (!course || course.themesQueuedAt !== queuedAt) return; // superseded
    const all = await themesOfCourse(ctx, courseId);
    const byId = new Map(all.map((t) => [t._id, t]));
    const kept = new Set<Id<'themes'>>();
    const placedIn = new Map<Id<'concepts'>, Id<'themes'>>();
    const now = Date.now();

    const save = async (
      g: { existingId?: Id<'themes'>; name: string; conceptIds: Id<'concepts'>[] },
      parentId?: Id<'themes'>,
    ): Promise<Id<'themes'>> => {
      const old = g.existingId ? byId.get(g.existingId) : undefined;
      let id: Id<'themes'>;
      if (old && !old.dismissed) {
        id = old._id;
        await ctx.db.patch(id, {
          name: old.renamed ? old.name : g.name,
          parentId,
          updatedAt: now,
        });
      } else {
        id = await ctx.db.insert('themes', {
          userId: course.userId,
          courseId,
          name: g.name,
          parentId,
          renamed: false,
          dismissed: false,
          createdAt: now,
          updatedAt: now,
        });
      }
      kept.add(id);
      for (const c of g.conceptIds) placedIn.set(c, id);
      return id;
    };
    for (const t of themes) {
      const id = await save(t);
      for (const sub of t.subthemes) await save(sub, id);
    }

    const concepts = await ctx.db
      .query('concepts')
      .withIndex('by_course', (q) => q.eq('courseId', courseId))
      .collect();
    const pinnedThemes = new Set<Id<'themes'>>();
    for (const c of concepts) {
      if (c.themePinned && c.themeId) {
        pinnedThemes.add(c.themeId);
        continue;
      }
      const themeId = placedIn.get(c._id);
      if (themeId !== c.themeId) await ctx.db.patch(c._id, { themeId });
    }
    // Drop themes nothing is in any more (dismissed ones stay, to stay dismissed).
    for (const t of all) {
      if (t.dismissed || kept.has(t._id) || pinnedThemes.has(t._id)) continue;
      const hasKeptChild = all.some((c) => c.parentId === t._id && kept.has(c._id));
      if (!hasKeptChild) await ctx.db.delete(t._id);
    }
    await ctx.db.patch(courseId, { themesStatus: 'done' });
  },
});

export const finishGrouping = internalMutation({
  args: { courseId: v.id('courses'), queuedAt: v.number(), failed: v.boolean() },
  handler: async (ctx, { courseId, queuedAt, failed }): Promise<void> => {
    const course = await ctx.db.get(courseId);
    if (course?.themesQueuedAt === queuedAt) {
      await ctx.db.patch(courseId, { themesStatus: failed ? 'failed' : 'done' });
    }
  },
});
