'use node';
/**
 * Read a source PDF's text, page by page, with unpdf (PDF.js's serverless
 * build). The PDF's own text layer, not Claude: exact wording, real page
 * numbers, no cost. Scanned pages with no text layer come back empty.
 */
import { v } from 'convex/values';
import { extractText } from 'unpdf';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { r2 } from './r2';

/** Longer than any real reading; stops a pathological file from flooding the table. */
const MAX_PAGES = 600;

export const extract = internalAction({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, { sessionId }): Promise<void> => {
    const source = await ctx.runQuery(internal.sources.getForExtraction, { sessionId });
    if (!source) return; // deleted while queued
    try {
      const url = await r2.getUrl(source.storageKey);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`PDF download failed: ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const { text } = await extractText(bytes, { mergePages: false });
      const texts = text.slice(0, MAX_PAGES).map((page) => page.trim());
      console.log(`[sourceExtract] ${sessionId}: ${text.length} pages`);
      await ctx.runMutation(internal.sources.savePages, { sessionId, texts });
    } catch (error) {
      console.error(`[sourceExtract] ${sessionId} failed:`, error);
      await ctx.runMutation(internal.sources.markFailed, { sessionId });
    }
  },
});
