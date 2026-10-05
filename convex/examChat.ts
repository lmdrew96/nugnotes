/**
 * Exam Chat — Multi-session Nugget Chat for exam rooms.
 * Uses the Exam Room Brain's topic index as context instead of every session's raw material.
 * Haiku handles per-message chat; the brain provides intelligent context routing.
 */

import { ConvexError, v } from 'convex/values';
import { api, internal } from './_generated/api';
import { action, internalQuery, mutation, query } from './_generated/server';
import { requireAuth } from './authHelpers';
import { callClaude } from './config';
import { enforceLimit, requireUserId } from './rateLimits';

// ─── Chat action ─────────────────────────────────────────────

/** Most prior turns sent back to the model. */
const MAX_HISTORY = 40;

/** The room's exam date, if the caller is a member of the room; null otherwise. */
export const getChatRoom = internalQuery({
  args: { examRoomId: v.id('examRooms'), userId: v.string() },
  handler: async (ctx, { examRoomId, userId }) => {
    const member = await ctx.db
      .query('examRoomMembers')
      .withIndex('by_room_user', (q) => q.eq('examRoomId', examRoomId).eq('userId', userId))
      .unique();
    if (!member) return null;
    const room = await ctx.db.get(examRoomId);
    return room ? { examDate: room.examDate ?? null } : null;
  },
});

/**
 * One exam-room chat turn. Runs as the signed-in student, who must be a member
 * of the room; the room's knowledge map and exam date are loaded here, never
 * taken from the browser, and every message counts against their chat limit.
 */
export const send = action({
  args: {
    examRoomId: v.id('examRooms'),
    message: v.string(),
    conversationHistory: v.array(
      v.object({ role: v.union(v.literal('user'), v.literal('assistant')), content: v.string() }),
    ),
    currentDateTime: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ response: string }> => {
    const userId = await requireUserId(ctx);
    const room = await ctx.runQuery(internal.examChat.getChatRoom, {
      examRoomId: args.examRoomId,
      userId,
    });
    if (!room) throw new ConvexError({ code: 'NOT_FOUND', message: 'Exam room not found.' });
    await enforceLimit(ctx, 'aiChat', userId);

    // Runs as the caller, and checks room membership itself.
    const { brainContext, sessionTitles } = await ctx.runQuery(api.examBrain.getBrainContext, {
      examRoomId: args.examRoomId,
    });
    const { currentDateTime } = args;
    const examDate = room.examDate;

    let systemPrompt = `You are Nugget, a friendly and expert AI study companion in NugNotes' Exam Study Room. You're helping a student prepare for an exam by reviewing multiple lecture sessions at once.

Your personality:
- Warm, encouraging, and concise
- You genuinely care about helping students ace their exams
- Use markdown formatting (bold, lists, code blocks) to make responses scannable
- Keep responses focused — exam prep time is precious
- Occasional cat puns are welcome but keep them subtle

## Exam Room Context
The student has ${(sessionTitles as string[])?.length ?? 0} sessions loaded for exam prep:
${(sessionTitles as string[])?.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') ?? 'No sessions yet'}

`;

    if (currentDateTime) {
      systemPrompt += `## Current Date & Time\n${currentDateTime}\n`;
      if (examDate) {
        const examTs = Number(examDate);
        const endOfExamDay = examTs + 24 * 60 * 60 * 1000 - 1;
        const now = Date.now();
        if (now > endOfExamDay) {
          systemPrompt += 'The exam date has passed.\n';
        } else if (now >= examTs) {
          systemPrompt += 'The exam is TODAY!\n';
        } else {
          const daysLeft = Math.ceil((examTs - now) / (1000 * 60 * 60 * 24));
          systemPrompt += `The exam is in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.\n`;
        }
      }
      systemPrompt += '\n';
    }

    if (brainContext) {
      systemPrompt += `## Knowledge Map (Topics & Concepts)\n${brainContext}\n\n`;
    }

    systemPrompt += `## Your Role
- Answer questions about ANY of the loaded sessions
- Help the student understand connections between topics across sessions
- Quiz them informally if they ask
- Suggest which areas to focus on based on their questions
- If they ask about something not in the knowledge map, let them know it might not be covered in their sessions

`;

    const response = await callClaude({
      maxTokens: 1024,
      system: systemPrompt,
      messages: [
        ...args.conversationHistory.slice(-MAX_HISTORY),
        { role: 'user' as const, content: args.message },
      ],
    });
    return { response };
  },
});

// ─── Queries ─────────────────────────────────────────────────

/** Get chat history for the current user in an exam room. */
export const getExamChatHistory = query({
  args: { examRoomId: v.id('examRooms') },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    return await ctx.db
      .query('examChatHistory')
      .withIndex('by_room_user', (q) => q.eq('examRoomId', args.examRoomId).eq('userId', userId))
      .unique();
  },
});

// ─── Mutations ──────────────────────────────────────────────

/** Save/update chat history for the current user in an exam room. */
export const saveExamChatHistory = mutation({
  args: {
    examRoomId: v.id('examRooms'),
    messages: v.array(
      v.object({
        role: v.string(),
        content: v.string(),
        timestamp: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const existing = await ctx.db
      .query('examChatHistory')
      .withIndex('by_room_user', (q) => q.eq('examRoomId', args.examRoomId).eq('userId', userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        messages: args.messages,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert('examChatHistory', {
        examRoomId: args.examRoomId,
        userId,
        messages: args.messages,
        updatedAt: Date.now(),
      });
    }
  },
});
