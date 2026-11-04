/**
 * Shared configuration + AI utilities for Convex backend
 */

import Anthropic from '@anthropic-ai/sdk';
import { ConvexError } from 'convex/values';

/**
 * AI Model Configuration
 * Haiku 5.5  — fast, cost-effective for per-message chat, study tools, games
 * Sonnet 5.5 — higher capability for session indexing (exam room brain)
 *
 * Neither accepts temperature/top_p/top_k (a non-default value is a 400), so
 * callClaude doesn't take them.
 */
export const AI_MODEL = 'claude-haiku-5-5';
export const AI_MODEL_SONNET = 'claude-sonnet-5-5';

/** Shown when the model declines a request (stop_reason "refusal"). */
export const AI_DECLINED = {
  code: 'AI_DECLINED',
  message: "Nugget can't help with that one. Try rewording it or using different material.",
} as const;

// ─── Shared Claude API Utility ──────────────────────────────

type MessageContent = string | Anthropic.Messages.ContentBlockParam[];

/**
 * A plain string, or structured blocks when part of the prompt should be cached.
 *
 * Caching is a strict PREFIX match: any byte change invalidates everything after
 * it. So a block carrying `cache_control` must be preceded only by content that
 * is stable across calls, and anything volatile (timestamps, per-request values)
 * has to come after it. Getting that order wrong doesn't error — it silently
 * yields a 0% hit rate and costs MORE than not caching, since writes bill at
 * ~1.25x.
 */
type SystemPrompt = string | Anthropic.Messages.TextBlockParam[];

interface CallClaudeOptions {
  /** Model to use. Defaults to AI_MODEL (Haiku). */
  model?: string;
  maxTokens: number;
  system?: SystemPrompt;
  messages: Array<{ role: 'user' | 'assistant'; content: MessageContent }>;
  /**
   * Receives the response's token usage. Mainly for confirming a cache is
   * actually working — `cache_read_input_tokens` stuck at 0 across repeated
   * calls means something in the prefix is still varying.
   */
  onUsage?: (usage: Anthropic.Messages.Usage) => void;
}

/**
 * Single entry point for all Anthropic API calls.
 * Handles client creation, API key validation, and response extraction.
 */
export async function callClaude(options: CallClaudeOptions): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const model = options.model ?? AI_MODEL;
  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model,
    max_tokens: options.maxTokens,
    // Haiku 4.5 never thought; Haiku 5.5 thinks by default (effort medium),
    // which would eat the small max_tokens these routes were sized for. Keep
    // it thinking-off, as before. Sonnet keeps its default adaptive thinking.
    ...(model === AI_MODEL && { thinking: { type: 'disabled' as const } }),
    ...(options.system && { system: options.system }),
    messages: options.messages,
  });

  options.onUsage?.(response.usage);

  if (response.stop_reason === 'refusal') throw new ConvexError(AI_DECLINED);

  // A response can start with thinking blocks; the answer is the text blocks.
  return response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
}
