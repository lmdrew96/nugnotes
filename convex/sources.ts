/**
 * Sources: PDFs (slides, readings) uploaded into a course and dated like a
 * class session. A source is a session with kind 'source'; its text is read
 * page by page into sourcePages (convex/sourceExtract.ts) so later features can
 * quote "p. 12". The text is kept as the document has it — never summarized
 * into the notes.
 */
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  type MutationCtx,
  type QueryCtx,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { requireAuth } from './authHelpers';
import { isDateKey } from './dateKey';
import { r2 } from './r2';

/** Signed PDF links last a week, like page photos. */
const FILE_URL_SECONDS = 7 * 24 * 60 * 60;

export interface SourcePage {
  page: number;
  text: string;
}

const pagesOf = (ctx: QueryCtx, sessionId: Id<'sessions'>): Promise<Doc<'sourcePages'>[]> =>
  ctx.db
    .query('sourcePages')
    .withIndex('by_session_page', (q) => q.eq('sessionId', sessionId))
    .collect();

/** A source's pages as one block for the AI tools, each tagged with its page number. */
export const sourcePagesToText = (pages: SourcePage[]): string =>
  pages
    .filter((p) => p.text.trim().length > 0)
    .map((p) => `[p. ${p.page}]\n${p.text.trim()}`)
    .join('\n\n');

/** Load a source's pages (for sessions.get and other server reads). */
export const loadSourcePages = async (
  ctx: QueryCtx,
  sessionId: Id<'sessions'>,
): Promise<SourcePage[]> =>
  (await pagesOf(ctx, sessionId)).map(({ page, text }) => ({ page, text }));

const queueExtraction = async (ctx: MutationCtx, sessionId: Id<'sessions'>): Promise<void> => {
  await ctx.db.patch(sessionId, { sourceStatus: 'pending' });
  await ctx.scheduler.runAfter(0, internal.sourceExtract.extract, { sessionId });
};

/** Add an uploaded PDF to a course as a dated source, and start reading it. */
export const create = mutation({
  args: {
    courseId: v.id('courses'),
    classDate: v.string(),
    storageKey: v.string(),
    fileName: v.string(),
  },
  handler: async (ctx, { courseId, classDate, storageKey, fileName }): Promise<Id<'sessions'>> => {
    const userId = await requireAuth(ctx);
    const course = await ctx.db.get(courseId);
    if (!course || course.userId !== userId) throw new Error('Course not found');
    if (!isDateKey(classDate)) {
      throw new ConvexError({ code: 'BAD_DATE', message: 'That date doesn’t look right.' });
    }
    const name = fileName.trim().slice(0, 200) || 'Reading.pdf';
    const now = Date.now();
    const sessionId = await ctx.db.insert('sessions', {
      userId,
      title: name.replace(/\.pdf$/i, ''),
      lectureType: 'general',
      courseId,
      classDate,
      kind: 'source',
      sourceFile: { storageKey, name },
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });
    await queueExtraction(ctx, sessionId);
    return sessionId;
  },
});

/** A source's pages, status and a link to the PDF. Owner only; null otherwise. */
export const get = query({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== identity.subject || session.kind !== 'source') {
      return null;
    }
    const file = session.sourceFile;
    return {
      status: session.sourceStatus,
      fileName: file?.name,
      fileUrl: file ? await r2.getUrl(file.storageKey, { expiresIn: FILE_URL_SECONDS }) : null,
      pages: await loadSourcePages(ctx, sessionId),
    };
  },
});

/** Read a source again after it failed. */
export const retry = mutation({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }): Promise<void> => {
    const userId = await requireAuth(ctx);
    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== userId || session.kind !== 'source') {
      throw new Error('Source not found');
    }
    if (session.sourceStatus === 'pending') return;
    await queueExtraction(ctx, sessionId);
  },
});

/** Delete a source's pages and its PDF (permanent session delete). */
export const deleteSourceData = async (ctx: MutationCtx, session: Doc<'sessions'>) => {
  for (const page of await pagesOf(ctx, session._id)) await ctx.db.delete(page._id);
  if (session.sourceFile) await r2.deleteObject(ctx, session.sourceFile.storageKey);
};

// ── Used by the extraction action ──

export const getForExtraction = internalQuery({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    return session?.sourceFile ? { storageKey: session.sourceFile.storageKey } : null;
  },
});

export const savePages = internalMutation({
  args: { sessionId: v.id('sessions'), texts: v.array(v.string()) },
  handler: async (ctx, { sessionId, texts }): Promise<void> => {
    const session = await ctx.db.get(sessionId);
    if (!session) return; // deleted while it was being read
    for (const old of await pagesOf(ctx, sessionId)) await ctx.db.delete(old._id);
    for (const [index, text] of texts.entries()) {
      await ctx.db.insert('sourcePages', {
        userId: session.userId,
        sessionId,
        page: index + 1,
        text,
      });
    }
    await ctx.db.patch(sessionId, { sourceStatus: 'done', updatedAt: Date.now() });
  },
});

export const markFailed = internalMutation({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }): Promise<void> => {
    const session = await ctx.db.get(sessionId);
    if (session) await ctx.db.patch(sessionId, { sourceStatus: 'failed' });
  },
});
