/**
 * Per-user limits on everything that spends Anthropic credits or posts to
 * GitHub. Generous for a student studying, tight enough that one account (or a
 * stolen session) can't run up the bill.
 */
import { HOUR, MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
import { ConvexError } from 'convex/values';
import { components } from './_generated/api';
import type { ActionCtx, MutationCtx } from './_generated/server';

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  /** Nugget chat and exam chat messages. */
  aiChat: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 10 },
  /** Study tools, generated notes, key points, exam tools, games. */
  aiGenerate: { kind: 'token bucket', rate: 60, period: HOUR, capacity: 15 },
  /** Reading uploaded documents and handwriting (vision — the priciest call). */
  documentParse: { kind: 'token bucket', rate: 30, period: HOUR, capacity: 10 },
  /** Bug reports filed as public GitHub issues. */
  bugReport: { kind: 'fixed window', rate: 5, period: HOUR },
});

export type LimitName = 'aiChat' | 'aiGenerate' | 'documentParse' | 'bugReport';

/** Consume one unit for this user, or throw the friendly error the UI shows. */
export async function enforceLimit(ctx: ActionCtx | MutationCtx, name: LimitName, userId: string) {
  const status = await rateLimiter.limit(ctx, name, { key: userId });
  if (!status.ok) {
    const seconds = Math.max(1, Math.ceil(status.retryAfter / 1000));
    throw new ConvexError({
      code: 'RATE_LIMITED',
      message: `You're going a bit fast — try again in ${seconds} second${seconds === 1 ? '' : 's'}.`,
    });
  }
}

/** The signed-in user's id, or the friendly not-signed-in error. */
export async function requireUserId(ctx: ActionCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity)
    throw new ConvexError({ code: 'NOT_AUTHENTICATED', message: 'Please sign in again.' });
  return identity.subject;
}
