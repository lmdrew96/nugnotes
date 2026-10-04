import { ConvexError } from 'convex/values';

/**
 * A message fit to show the student. Backend errors meant for them are thrown
 * as ConvexError({ code, message }) — production redacts plain Error messages
 * — so prefer that message, and fall back to the error's own text.
 */
export function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: unknown } | string;
    if (typeof data === 'string') return data;
    if (typeof data?.message === 'string') return data.message;
  }
  return fallback;
}
