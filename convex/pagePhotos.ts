/**
 * Page photos for AI features. The transcript is a hidden index: it picks which
 * pages matter (the ones its concepts are found on), and the photos themselves
 * go to Claude, so it reads the student's real layout, arrows and drawings.
 * The transcript text still goes along as a fallback.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { type ActionCtx, internalQuery } from './_generated/server';
import { MAX_PAGE_IMAGES } from './config';
import { formatDateKey } from './dateKey';
import { r2 } from './r2';
import { NO_NOTES } from './transcriptText';

export interface PagePhoto {
  storageKey: string;
  /** "Oct 21 · PSYC 100 · Page 2", shown to Claude above the image. */
  label: string;
}

export interface PickedPages {
  photos: PagePhoto[];
  /** Pages in scope before the cap. */
  total: number;
}

/**
 * The pages of these sessions worth sending, most relevant first up to the
 * cap, then back in class and page order. Relevant = how many concept mentions
 * the index found on the page (only the given concepts', when given; then a
 * page none of them is on isn't in scope). Blank pages are skipped. The caller
 * must already have checked the sessions are the student's.
 */
export const pick = internalQuery({
  args: {
    sessionIds: v.array(v.id('sessions')),
    conceptIds: v.optional(v.array(v.id('concepts'))),
  },
  handler: async (ctx, { sessionIds, conceptIds }): Promise<PickedPages> => {
    const focus = conceptIds ? new Set(conceptIds) : null;
    const candidates: { page: Doc<'pages'>; score: number; when: string; label: string }[] = [];
    for (const sessionId of sessionIds) {
      const session = await ctx.db.get(sessionId);
      if (!session || session.isDeleted || session.kind === 'source') continue;
      const mentions = await ctx.db
        .query('conceptMentions')
        .withIndex('by_session', (q) => q.eq('sessionId', sessionId))
        .collect();
      const score = new Map<Id<'pages'>, number>();
      for (const m of mentions) {
        if (!m.pageId || (focus && !focus.has(m.conceptId))) continue;
        score.set(m.pageId, (score.get(m.pageId) ?? 0) + 1);
      }
      const pages = await ctx.db
        .query('pages')
        .withIndex('by_session_order', (q) => q.eq('sessionId', sessionId))
        .collect();
      const date = session.classDate ? formatDateKey(session.classDate) : '';
      for (const page of pages) {
        const blank = page.transcript?.length === 1 && page.transcript[0].text === NO_NOTES;
        const s = score.get(page._id) ?? 0;
        if (blank || (focus && s === 0)) continue;
        candidates.push({
          page,
          score: s,
          when: `${session.classDate ?? ''}|${session.createdAt}|${String(page.order).padStart(4, '0')}`,
          label: [date, session.title, `Page ${page.order + 1}`].filter(Boolean).join(' · '),
        });
      }
    }
    const picked = [...candidates]
      .sort((a, b) => b.score - a.score || a.when.localeCompare(b.when))
      .slice(0, MAX_PAGE_IMAGES)
      .sort((a, b) => a.when.localeCompare(b.when));
    return {
      photos: picked.map((c) => ({ storageKey: c.page.storageKey, label: c.label })),
      total: candidates.length,
    };
  },
});

/**
 * Content blocks for the photos: each labelled, then the image. No cache
 * breakpoint: the signed URLs differ on every call, so a cached copy would
 * never be read and the write would only cost extra.
 */
export const photoBlocks = async (
  photos: PagePhoto[],
): Promise<Anthropic.Messages.ContentBlockParam[]> => {
  const blocks: Anthropic.Messages.ContentBlockParam[] = [];
  for (const photo of photos) {
    blocks.push({ type: 'text', text: `[${photo.label}]` });
    blocks.push({ type: 'image', source: { type: 'url', url: await r2.getUrl(photo.storageKey) } });
  }
  return blocks;
};

/** A session's pages as image blocks, plus the "read N of M" note when capped. */
export const sessionPhotos = async (
  ctx: ActionCtx,
  sessionId: Id<'sessions'>,
): Promise<{ blocks: Anthropic.Messages.ContentBlockParam[]; note?: string }> => {
  const picked = await ctx.runQuery(internal.pagePhotos.pick, { sessionIds: [sessionId] });
  return { blocks: await photoBlocks(picked.photos), note: pagesNote(picked) };
};

/** What the model is told about the photos, put before the instruction. */
export const PHOTOS_NOTE =
  'The images above are photos of the student’s own handwritten pages, each labelled with its date and page. They are the original: read them directly, including layout, arrows, boxes and drawings, and ignore anything crossed out. The transcript in the study material is a rough index of the same pages; when they disagree, trust the photo.';

/** "Read 12 of 40 pages" for the UI, or nothing when every page was read. */
export const pagesNote = (picked: PickedPages): string | undefined =>
  picked.total > picked.photos.length
    ? `Nugget read the ${picked.photos.length} most relevant of ${picked.total} pages.`
    : undefined;
