import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { requireAuth } from './authHelpers';
import { deleteRoomData } from './ydoc';
import { sessionDocKey } from './ydocKeys';

// List all sessions for the authenticated user (excluding deleted)
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    return await ctx.db
      .query('sessions')
      .withIndex('by_user_deleted', (q) => q.eq('userId', userId).eq('isDeleted', false))
      .order('desc')
      .collect();
  },
});

// Lightweight list — metadata only (strips notes, nuggetNotes, document text)
export const listMetadata = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_user_deleted', (q) => q.eq('userId', userId).eq('isDeleted', false))
      .order('desc')
      .collect();
    return sessions.map((s) => ({
      _id: s._id,
      _creationTime: s._creationTime,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      lectureType: s.lectureType,
      course: s.course,
    }));
  },
});

/** A single session, with its notes joined from sessionNotes. */
export const get = query({
  args: { id: v.id('sessions') },
  handler: async (ctx, args) => {
    // Owner-only. Shared sessions and study rooms read through
    // sessionSharing.getSharedSession / studyRooms, which do their own checks.
    // Returns null rather than throwing when signed out: this is subscribed
    // app-wide, and a throw during a sign-out transition would crash the tree.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const session = await ctx.db.get(args.id);
    if (!session || session.userId !== identity.subject) return null;

    // Join the notes' plain-text and markdown copies (the note itself is a Y.Doc — convex/ydoc.ts)
    const notesDoc = await ctx.db
      .query('sessionNotes')
      .withIndex('by_session', (q) => q.eq('sessionId', args.id))
      .unique();

    return {
      ...session,
      notesPlainText: notesDoc?.plainText,
      notesMarkdown: notesDoc?.markdown,
    };
  },
});

// Create a new session
export const create = mutation({
  args: {
    title: v.string(),
    lectureType: v.optional(v.string()),
    course: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const now = Date.now();
    return await ctx.db.insert('sessions', {
      userId,
      title: args.title,
      lectureType: args.lectureType ?? 'general',
      course: args.course,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });
  },
});

// Update session fields (the notes' plain-text/markdown copies are routed to sessionNotes)
export const update = mutation({
  args: {
    id: v.id('sessions'),
    title: v.optional(v.string()),
    lectureType: v.optional(v.string()),
    course: v.optional(v.string()),
    notesPlainText: v.optional(v.string()),
    notesMarkdown: v.optional(v.string()),
    nuggetNotes: v.optional(
      v.array(
        v.object({
          text: v.string(),
        }),
      ),
    ),
    documentText: v.optional(v.string()),
    documentStorageIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const { id, notesPlainText, notesMarkdown, ...otherUpdates } = args;

    // Being signed in is not enough — the session has to be yours.
    const session = await ctx.db.get(id);
    if (!session || session.userId !== userId || session.isDeleted) {
      throw new Error('Session not found');
    }

    // Route notes to separate sessionNotes table
    if (notesPlainText !== undefined || notesMarkdown !== undefined) {
      const existing = await ctx.db
        .query('sessionNotes')
        .withIndex('by_session', (q) => q.eq('sessionId', id))
        .unique();

      if (existing) {
        const notesPatch: Record<string, string | number> = { updatedAt: Date.now() };
        if (notesPlainText !== undefined) notesPatch.plainText = notesPlainText;
        if (notesMarkdown !== undefined) notesPatch.markdown = notesMarkdown;
        await ctx.db.patch(existing._id, notesPatch);
      } else {
        await ctx.db.insert('sessionNotes', {
          sessionId: id,
          userId,
          plainText: notesPlainText,
          markdown: notesMarkdown,
          updatedAt: Date.now(),
        });
      }
    }

    // Patch session with non-notes fields only
    const filteredUpdates = Object.fromEntries(
      Object.entries(otherUpdates).filter(([_, value]) => value !== undefined),
    );

    return await ctx.db.patch(id, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });
  },
});

// Add an uploaded document's extracted text and files to a session, after any
// documents already on it.
export const appendDocument = mutation({
  args: {
    id: v.id('sessions'),
    documentText: v.string(),
    documentStorageIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const session = await ctx.db.get(args.id);
    if (!session || session.userId !== userId || session.isDeleted) {
      throw new Error('Session not found');
    }
    await ctx.db.patch(args.id, {
      documentText: session.documentText
        ? `${session.documentText}\n\n---\n\n${args.documentText}`
        : args.documentText,
      documentStorageIds: [...(session.documentStorageIds ?? []), ...args.documentStorageIds],
      updatedAt: Date.now(),
    });
  },
});

// Soft delete a session (move to trash)
export const softDelete = mutation({
  args: { id: v.id('sessions') },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.patch(args.id, {
      isDeleted: true,
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// Restore a session from trash
export const restore = mutation({
  args: { id: v.id('sessions') },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.patch(args.id, {
      isDeleted: false,
      deletedAt: undefined,
      updatedAt: Date.now(),
    });
  },
});

// Permanently delete a session (cascades to sessionNotes and its Y.Doc data)
export const permanentDelete = mutation({
  args: { id: v.id('sessions') },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const session = await ctx.db.get(args.id);
    if (!session || session.userId !== userId) throw new Error('Session not found');

    // Cascade-delete associated sessionNotes
    const notesDoc = await ctx.db
      .query('sessionNotes')
      .withIndex('by_session', (q) => q.eq('sessionId', args.id))
      .unique();
    if (notesDoc) {
      await ctx.db.delete(notesDoc._id);
    }
    await deleteRoomData(ctx, sessionDocKey(args.id));

    return await ctx.db.delete(args.id);
  },
});

// List deleted sessions (trash) for the authenticated user
export const listDeleted = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    return await ctx.db
      .query('sessions')
      .withIndex('by_user_deleted', (q) => q.eq('userId', userId).eq('isDeleted', true))
      .order('desc')
      .collect();
  },
});

// Lightweight trash list — metadata only
export const listDeletedMetadata = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_user_deleted', (q) => q.eq('userId', userId).eq('isDeleted', true))
      .order('desc')
      .collect();
    return sessions.map((s) => ({
      _id: s._id,
      _creationTime: s._creationTime,
      title: s.title,
      createdAt: s.createdAt,
      lectureType: s.lectureType,
      course: s.course,
    }));
  },
});

// Clean up old deleted sessions (called by cron job, cascades to sessionNotes)
export const cleanupOldDeleted = internalMutation({
  args: {},
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const oldDeletedSessions = await ctx.db
      .query('sessions')
      .withIndex('by_deleted_at', (q) => q.eq('isDeleted', true))
      .collect();

    let deletedCount = 0;
    for (const session of oldDeletedSessions) {
      if (session.deletedAt && session.deletedAt < thirtyDaysAgo) {
        // Cascade-delete associated sessionNotes
        const notesDoc = await ctx.db
          .query('sessionNotes')
          .withIndex('by_session', (q) => q.eq('sessionId', session._id))
          .unique();
        if (notesDoc) {
          await ctx.db.delete(notesDoc._id);
        }
        await deleteRoomData(ctx, sessionDocKey(session._id));

        await ctx.db.delete(session._id);
        deletedCount++;
      }
    }

    console.log(`Cleaned up ${deletedCount} sessions older than 30 days`);
    return { deletedCount };
  },
});
