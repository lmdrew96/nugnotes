import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import { requireAuth } from './authHelpers';

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

    // Join notes from separate table (fallback to legacy fields during migration)
    const notesDoc = await ctx.db
      .query('sessionNotes')
      .withIndex('by_session', (q) => q.eq('sessionId', args.id))
      .unique();

    // Resolve notes: prefer content (TipTap JSON), fall back to wrapping plainText
    let notes = notesDoc?.content ?? session.notes;
    const notesPlainText = notesDoc?.plainText ?? session.notesPlainText;

    if (!notes && notesPlainText) {
      // Content was lost but plainText survived — wrap it as minimal TipTap JSON
      const paragraphs = notesPlainText.split('\n').filter(Boolean);
      const tiptapDoc = {
        type: 'doc',
        content: paragraphs.map((text: string) => ({
          type: 'paragraph',
          content: [{ type: 'text', text }],
        })),
      };
      notes = JSON.stringify(tiptapDoc);
    }

    return { ...session, notes, notesPlainText };
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

// Update session fields (notes are routed to sessionNotes table)
export const update = mutation({
  args: {
    id: v.id('sessions'),
    title: v.optional(v.string()),
    lectureType: v.optional(v.string()),
    course: v.optional(v.string()),
    notes: v.optional(v.string()),
    notesPlainText: v.optional(v.string()),
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
    const { id, notes, notesPlainText, ...otherUpdates } = args;

    // Being signed in is not enough — the session has to be yours.
    const session = await ctx.db.get(id);
    if (!session || session.userId !== userId || session.isDeleted) {
      throw new Error('Session not found');
    }

    // Route notes to separate sessionNotes table
    if (notes !== undefined || notesPlainText !== undefined) {
      const existing = await ctx.db
        .query('sessionNotes')
        .withIndex('by_session', (q) => q.eq('sessionId', id))
        .unique();

      if (existing) {
        const notesPatch: Record<string, string | number> = { updatedAt: Date.now() };
        if (notes !== undefined) notesPatch.content = notes;
        if (notesPlainText !== undefined) notesPatch.plainText = notesPlainText;
        await ctx.db.patch(existing._id, notesPatch);
      } else {
        await ctx.db.insert('sessionNotes', {
          sessionId: id,
          userId,
          content: notes,
          plainText: notesPlainText,
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

// Permanently delete a session (cascades to sessionNotes)
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

        await ctx.db.delete(session._id);
        deletedCount++;
      }
    }

    console.log(`Cleaned up ${deletedCount} sessions older than 30 days`);
    return { deletedCount };
  },
});

// Merge multiple session fragments into one.
// primaryId is the session whose _id is kept; secondaryIds are soft-deleted after merge.
// All sessions are sorted chronologically before merging, so content reads in order
// regardless of which fragment the user selected as "primary."
export const mergeSessions = mutation({
  args: {
    primaryId: v.id('sessions'),
    secondaryIds: v.array(v.id('sessions')),
    newTitle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    if (args.secondaryIds.length === 0) throw new Error('No secondary sessions specified');

    const primary = await ctx.db.get(args.primaryId);
    if (!primary || primary.userId !== userId || primary.isDeleted) {
      throw new Error('Primary session not found');
    }

    const secondaries: Doc<'sessions'>[] = [];
    for (const id of args.secondaryIds) {
      const s = await ctx.db.get(id);
      if (!s || s.userId !== userId || s.isDeleted) {
        throw new Error(`Session not found: ${id}`);
      }
      secondaries.push(s);
    }

    // Sort all fragments chronologically so content reads in order
    const allSessions = [primary, ...secondaries].sort((a, b) => a.createdAt - b.createdAt);

    const allNuggetNotes: NonNullable<Doc<'sessions'>['nuggetNotes']> = [];
    const allDocumentTexts: string[] = [];
    const allDocumentStorageIds: string[] = [];

    for (const session of allSessions) {
      allNuggetNotes.push(...(session.nuggetNotes ?? []));
      if (session.documentText) allDocumentTexts.push(session.documentText);
      allDocumentStorageIds.push(...(session.documentStorageIds ?? []));
    }

    // Fetch sessionNotes in chronological order, then merge TipTap JSON content arrays
    const notesDocs: (Doc<'sessionNotes'> | null)[] = [];
    for (const session of allSessions) {
      const notesDoc = await ctx.db
        .query('sessionNotes')
        .withIndex('by_session', (q) => q.eq('sessionId', session._id))
        .unique();
      notesDocs.push(notesDoc);
    }

    const hasAnyNotes = notesDocs.some((d) => d?.content || d?.plainText);
    if (hasAnyNotes) {
      const combinedContent: unknown[] = [];
      let combinedPlainText = '';
      let first = true;

      for (const notesDoc of notesDocs) {
        if (!notesDoc?.content && !notesDoc?.plainText) continue;

        if (!first) {
          combinedContent.push({ type: 'horizontalRule' });
          combinedPlainText += '\n\n---\n\n';
        }

        if (notesDoc.content) {
          try {
            const parsed = JSON.parse(notesDoc.content) as { content?: unknown[] };
            combinedContent.push(...(parsed.content ?? []));
          } catch {
            combinedContent.push({
              type: 'paragraph',
              content: [{ type: 'text', text: notesDoc.content }],
            });
          }
        }

        if (notesDoc.plainText) combinedPlainText += notesDoc.plainText;
        first = false;
      }

      const mergedJson = JSON.stringify({ type: 'doc', content: combinedContent });
      const primaryIdx = allSessions.findIndex((s) => s._id === args.primaryId);
      const primaryNotesDoc = primaryIdx >= 0 ? notesDocs[primaryIdx] : null;

      if (primaryNotesDoc) {
        await ctx.db.patch(primaryNotesDoc._id, {
          content: mergedJson,
          plainText: combinedPlainText,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert('sessionNotes', {
          sessionId: args.primaryId,
          userId,
          content: mergedJson,
          plainText: combinedPlainText,
          updatedAt: Date.now(),
        });
      }
    }

    // Update the primary session with combined data
    await ctx.db.patch(args.primaryId, {
      title: args.newTitle ?? primary.title,
      nuggetNotes: allNuggetNotes.length > 0 ? allNuggetNotes : undefined,
      documentText: allDocumentTexts.length > 0 ? allDocumentTexts.join('\n\n---\n\n') : undefined,
      documentStorageIds: allDocumentStorageIds.length > 0 ? allDocumentStorageIds : undefined,
      updatedAt: Date.now(),
    });

    // Soft-delete secondary sessions
    const now = Date.now();
    for (const secondary of secondaries) {
      await ctx.db.patch(secondary._id, {
        isDeleted: true,
        deletedAt: now,
        updatedAt: now,
      });
    }

    return args.primaryId;
  },
});
