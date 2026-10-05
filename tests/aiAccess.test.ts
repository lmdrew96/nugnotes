// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// The AI and bug-report entry points: signed-in only, context loaded on the
// server (never trusted from the client), and rate-limited per user.
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { ConvexError } from 'convex/values';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../convex/_generated/api';
import schema from '../convex/schema';

const callClaude = vi.fn(async (_opts: { system: unknown }) => 'Meow!');
vi.mock('../convex/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../convex/config')>()),
  callClaude: (opts: { system: unknown }) => callClaude(opts),
}));

const modules = import.meta.glob('../convex/**/*.*s');
const newTest = () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
};

const ALICE = { subject: 'user_alice' };
const MALLORY = { subject: 'user_mallory' };

const chatArgs = {
  message: 'hi',
  conversationHistory: [],
  includeNotes: true,
  includeDocuments: true,
};

/** The error's `code`, for asserting on ConvexError rejections. */
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    if (err instanceof ConvexError) return (err.data as { code: string }).code;
    throw err;
  }
  throw new Error('expected a rejection');
};

describe('AI entry points', () => {
  beforeEach(() => callClaude.mockClear());

  it('rejects signed-out callers before spending anything', async () => {
    const t = newTest();
    expect(await codeOf(t.action(api.nuggetChat.send, chatArgs))).toBe('NOT_AUTHENTICATED');
    expect(
      await codeOf(
        t.action(api.reportBug.submit, {
          title: 't',
          description: 'd',
          browserInfo: 'b',
          appVersion: '0',
          pageUrl: 'u',
        }),
      ),
    ).toBe('NOT_AUTHENTICATED');
    expect(callClaude).not.toHaveBeenCalled();
  });

  it("reads the caller's own session material, and never someone else's", async () => {
    const t = newTest();
    const sessionId = await t.withIdentity(ALICE).mutation(api.sessions.create, { title: 'Bio' });
    await t
      .withIdentity(ALICE)
      .mutation(api.sessions.update, { id: sessionId, notesPlainText: 'mitochondria secret' });

    await t.withIdentity(ALICE).action(api.nuggetChat.send, { ...chatArgs, sessionId });
    expect(JSON.stringify(callClaude.mock.calls[0][0].system)).toContain('mitochondria secret');

    await t.withIdentity(MALLORY).action(api.nuggetChat.send, { ...chatArgs, sessionId });
    expect(JSON.stringify(callClaude.mock.calls[1][0].system)).not.toContain('mitochondria secret');
  });

  it("refuses exam chat for a room the caller isn't in", async () => {
    const t = newTest();
    const examRoomId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert('examRooms', {
        name: 'Final',
        hostUserId: ALICE.subject,
        status: 'studying',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert('examRoomMembers', {
        examRoomId: id,
        userId: ALICE.subject,
        role: 'host',
        hasJoined: true,
        lastSeenAt: now,
        createdAt: now,
      });
      return id;
    });
    const args = { examRoomId, message: 'hi', conversationHistory: [] };

    expect(await codeOf(t.withIdentity(MALLORY).action(api.examChat.send, args))).toBe('NOT_FOUND');
    expect((await t.withIdentity(ALICE).action(api.examChat.send, args)).response).toBe('Meow!');
  });

  it('rate-limits chat per user', async () => {
    const t = newTest();
    const alice = t.withIdentity(ALICE);
    for (let i = 0; i < 10; i++) await alice.action(api.nuggetChat.send, chatArgs);
    expect(await codeOf(alice.action(api.nuggetChat.send, chatArgs))).toBe('RATE_LIMITED');
    expect(callClaude).toHaveBeenCalledTimes(10);

    // Alice's burst doesn't touch anyone else's budget.
    await t.withIdentity(MALLORY).action(api.nuggetChat.send, chatArgs);
    expect(callClaude).toHaveBeenCalledTimes(11);
  });
});
