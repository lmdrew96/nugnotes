import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, mutation, query } from './_generated/server';
import { requireAuth } from './authHelpers';

const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** The signed-in student's courses, A → Z. */
export const list = query({
  args: {},
  handler: async (ctx): Promise<Doc<'courses'>[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const courses = await ctx.db
      .query('courses')
      .withIndex('by_user', (q) => q.eq('userId', identity.subject))
      .collect();
    return courses.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Find a course by name (case-insensitive) or create it. */
const findOrCreate = async (
  ctx: MutationCtx,
  userId: string,
  name: string,
): Promise<Id<'courses'>> => {
  const existing = await ctx.db
    .query('courses')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
  const match = existing.find((c) => sameName(c.name, name));
  if (match) return match._id;
  return await ctx.db.insert('courses', { userId, name: name.trim(), createdAt: Date.now() });
};

/** Add a course. Adding a name that already exists returns the existing one. */
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }): Promise<Id<'courses'>> => {
    const userId = await requireAuth(ctx);
    const trimmed = name.trim();
    if (!trimmed) throw new ConvexError({ code: 'EMPTY_NAME', message: 'Give the course a name.' });
    if (trimmed.length > 80) {
      throw new ConvexError({ code: 'NAME_TOO_LONG', message: 'Keep the course name short.' });
    }
    return await findOrCreate(ctx, userId, trimmed);
  },
});

/** Remove a course. Only an empty one: sessions are never left pointing at nothing. */
export const remove = mutation({
  args: { id: v.id('courses') },
  handler: async (ctx, { id }): Promise<void> => {
    const userId = await requireAuth(ctx);
    const course = await ctx.db.get(id);
    if (!course || course.userId !== userId) throw new Error('Course not found');
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_course', (q) => q.eq('courseId', id))
      .first();
    if (session) {
      throw new ConvexError({
        code: 'COURSE_IN_USE',
        message: `${course.name} still has sessions (check the trash too). Move or delete them first.`,
      });
    }
    await ctx.db.delete(id);
  },
});
