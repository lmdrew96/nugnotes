/**
 * NuggetChat - chat for Q&A about a session's notes and uploaded documents.
 * Runs on the callClaude default model (see convex/config.ts) — it does not
 * pass its own, so naming a model here would drift the moment that changes.
 * Provides contextual responses based on the session's material.
 * Accepts lecture type and Nugget's AI-generated notes for richer context.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { v } from 'convex/values';
import { api } from './_generated/api';
import { action } from './_generated/server';
import { callClaude } from './config';
import { enforceLimit, requireUserId } from './rateLimits';

/** Most document text a chat carries — a stack of PDFs mustn't make every turn huge. */
export const CHAT_DOCUMENT_CHARS = 60_000;

export interface ChatPromptInput {
  documentText?: string;
  notes?: string;
  nuggetNotes?: string;
  lectureType?: string;
  currentDateTime?: string;
}

/**
 * Builds the system prompt as cacheable blocks.
 *
 * Exported so the prefix-stability property can be tested directly: the cached
 * block must be byte-identical across turns that differ only in volatile inputs.
 * A silent regression there is exactly how prompt caching fails — no error, just
 * a 0% hit rate that costs more than not caching at all.
 */
export function buildChatSystemPrompt({
  documentText,
  notes,
  nuggetNotes,
  lectureType,
  currentDateTime,
}: ChatPromptInput): Anthropic.Messages.TextBlockParam[] {
  // The system prompt is built in two halves so the expensive part can be cached.
  //
  // CACHED: personality, lecture type, and the uploaded documents. Documents
  // rarely change during a conversation and are usually the bulk of the prompt,
  // so re-sending them at full price every turn is the cost worth avoiding.
  //
  // UNCACHED: the student's notes, Nugget's key points, and the current time.
  // Notes change as the student types and the clock every minute, and caching
  // is a prefix match — anything volatile placed before the documents would
  // invalidate them on every message.
  let systemPrompt = `You are Nugget, a friendly and helpful AI study companion in NugNotes, a note-taking app for students. You help students understand their study material, answer questions, and provide study assistance.

Your personality:
- Warm, encouraging, and concise
- You genuinely care about helping students learn
- Use markdown formatting (bold, lists, code blocks) to make responses scannable
- Keep responses focused — students are busy
- Occasional cat puns are welcome but keep them subtle

`;

  if (lectureType && lectureType !== 'general') {
    systemPrompt += `## Lecture Type\nThis is a **${lectureType}** lecture. Tailor your explanations accordingly.\n\n`;
  }

  const documents = documentText?.trim().slice(0, CHAT_DOCUMENT_CHARS);
  if (documents) {
    systemPrompt += `## Uploaded Documents\nText extracted from the documents, photos and handwriting the student uploaded to this session:\n\n${documents}\n\n`;
  }

  // ── everything below here is volatile and must stay after the breakpoint ──
  let volatilePrompt = '';

  if (notes) {
    volatilePrompt += `## Student's Notes\nThe student has taken these notes:\n\n${notes}\n\n`;
  }

  if (nuggetNotes) {
    volatilePrompt += `## Nugget's Key Points\nKey points you pulled out of this session earlier:\n\n${nuggetNotes}\n\n`;
  }

  if (currentDateTime) {
    volatilePrompt += `## Current Date & Time\n${currentDateTime}\n\n`;
  }

  if (!documents && !notes && !nuggetNotes) {
    volatilePrompt += `\nNote: The student hasn't included any notes or documents in this conversation. You can still help with general study questions, but encourage them to open a session, write some notes or upload a document for more specific help.\n`;
  }

  // Only mark a breakpoint when there are documents worth caching. Haiku's
  // minimum cacheable prefix is 4096 tokens — below that a breakpoint silently
  // does nothing, so short sessions just skip it.
  const system: Anthropic.Messages.TextBlockParam[] = documents
    ? [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
        ...(volatilePrompt ? [{ type: 'text' as const, text: volatilePrompt }] : []),
      ]
    : [{ type: 'text', text: systemPrompt + volatilePrompt }];

  return system;
}

/** Most prior turns sent back to the model. */
const MAX_HISTORY = 40;

/**
 * One chat turn. Runs as the signed-in student: the session's notes, documents
 * and key points are loaded here by id (the caller must own the session), never
 * taken from the browser, and every message counts against their chat limit.
 */
export const send = action({
  args: {
    message: v.string(),
    conversationHistory: v.array(
      v.object({ role: v.union(v.literal('user'), v.literal('assistant')), content: v.string() }),
    ),
    sessionId: v.optional(v.id('sessions')),
    includeNotes: v.boolean(),
    includeDocuments: v.boolean(),
    currentDateTime: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ response: string }> => {
    const userId = await requireUserId(ctx);
    await enforceLimit(ctx, 'aiChat', userId);

    // null when there's no session open or it isn't theirs — chat still works,
    // just without session material.
    const session = args.sessionId
      ? await ctx.runQuery(api.sessions.get, { id: args.sessionId })
      : null;
    const keyPoints = session?.nuggetNotes?.map((n) => `- ${n.text}`).join('\n');

    const system = buildChatSystemPrompt({
      documentText: args.includeDocuments ? session?.documentText : undefined,
      notes: args.includeNotes ? session?.notesPlainText : undefined,
      nuggetNotes: args.includeNotes ? keyPoints || undefined : undefined,
      lectureType: session?.lectureType,
      currentDateTime: args.currentDateTime,
    });
    const cachedChars = system[0].cache_control ? system[0].text.length : 0;

    const response = await callClaude({
      maxTokens: 1024,
      system,
      onUsage: (usage) => {
        // The only reliable signal that the cache is working. If
        // cache_read_input_tokens stays 0 across turns of one conversation,
        // something in the prefix is still varying. cachedChars tells a miss
        // from a prefix too small to cache (Haiku: under ~16k chars).
        console.log(
          `[nuggetChat] tokens in=${usage.input_tokens} cached_chars=${cachedChars} cache_write=${usage.cache_creation_input_tokens ?? 0} cache_read=${usage.cache_read_input_tokens ?? 0}`,
        );
      },
      messages: [
        ...args.conversationHistory.slice(-MAX_HISTORY),
        { role: 'user' as const, content: args.message },
      ],
    });
    return { response };
  },
});
