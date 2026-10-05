/**
 * Study Rooms — Ephemeral group study sessions with shared session viewing and chat.
 */

import { ConvexError, v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { requireAuth } from './authHelpers';
import { verifyFriendship } from './messagingHelpers';

// ─── Helpers ──────────────────────────────────────────────────

/**
 * The caller's membership row, or null. Queries an open room view subscribes
 * to return null instead of throwing when this is null: closing a room deletes
 * every member row, so anyone still looking at it is suddenly not a member.
 */
export async function findRoomMember(ctx: QueryCtx, roomId: Id<'studyRooms'>, userId: string) {
  return await ctx.db
    .query('studyRoomMembers')
    .withIndex('by_room_user', (q) => q.eq('roomId', roomId).eq('userId', userId))
    .unique();
}

export async function requireRoomMember(ctx: QueryCtx, roomId: Id<'studyRooms'>, userId: string) {
  const member = await findRoomMember(ctx, roomId, userId);
  if (!member) throw new ConvexError('Not a room member');
  return member;
}

export async function requireRoomHost(ctx: QueryCtx, roomId: Id<'studyRooms'>, userId: string) {
  const member = await requireRoomMember(ctx, roomId, userId);
  if (member.role !== 'host') throw new ConvexError('Only the host can do this');
  return member;
}

async function getProfileForUser(ctx: QueryCtx, userId: string) {
  return await ctx.db
    .query('userProfiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
}

export async function postSystemMessage(
  ctx: MutationCtx,
  roomId: Id<'studyRooms'>,
  content: string,
) {
  await ctx.db.insert('studyRoomMessages', {
    roomId,
    senderId: 'system',
    content,
    messageType: 'system',
    createdAt: Date.now(),
  });
}

// ─── Queries ──────────────────────────────────────────────────

/** List all active rooms where the current user is a member. */
export const listMyRooms = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const memberships = await ctx.db
      .query('studyRoomMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const rooms = await Promise.all(
      memberships.map(async (membership) => {
        const room = await ctx.db.get(membership.roomId);
        if (!room || !room.isActive) return null;

        const [hostProfile, members] = await Promise.all([
          getProfileForUser(ctx, room.hostUserId),
          ctx.db
            .query('studyRoomMembers')
            .withIndex('by_room', (q) => q.eq('roomId', room._id))
            .collect(),
        ]);

        return {
          roomId: room._id,
          name: room.name,
          hasJoined: membership.hasJoined,
          memberCount: members.length,
          host: {
            userId: room.hostUserId,
            displayName: hostProfile?.displayName ?? 'Unknown',
            username: hostProfile?.username ?? 'unknown',
          },
          createdAt: room.createdAt,
        };
      }),
    );

    return rooms.filter(Boolean).sort((a, b) => (b?.createdAt ?? 0) - (a?.createdAt ?? 0));
  },
});

/** Get full room data with enriched members. Null once the caller isn't a member (e.g. the room closed). */
export const getRoom = query({
  args: { roomId: v.id('studyRooms') },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    if (!(await findRoomMember(ctx, args.roomId, userId))) return null;

    const room = await ctx.db.get(args.roomId);
    if (!room) return null;

    const memberDocs = await ctx.db
      .query('studyRoomMembers')
      .withIndex('by_room', (q) => q.eq('roomId', args.roomId))
      .collect();

    const now = Date.now();
    const members = await Promise.all(
      memberDocs.map(async (member) => {
        const profile = await getProfileForUser(ctx, member.userId);

        return {
          userId: member.userId,
          role: member.role,
          hasJoined: member.hasJoined,
          isOnline: now - member.lastSeenAt < 60_000,
          displayName: profile?.displayName ?? 'Unknown',
          username: profile?.username ?? 'unknown',
          avatarUrl: profile?.avatarUrl,
        };
      }),
    );

    return {
      ...room,
      members,
    };
  },
});

/** Get room chat messages (last 100). Null once the caller isn't a member. */
export const getRoomMessages = query({
  args: { roomId: v.id('studyRooms') },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    if (!(await findRoomMember(ctx, args.roomId, userId))) return null;

    const allMessages = await ctx.db
      .query('studyRoomMessages')
      .withIndex('by_room', (q) => q.eq('roomId', args.roomId))
      .order('asc')
      .collect();

    // Take last 100
    const messages = allMessages.slice(-100);

    // Enrich with sender display names
    const enriched = await Promise.all(
      messages.map(async (msg) => {
        if (msg.messageType === 'system') {
          return { ...msg, senderName: 'System' };
        }
        const profile = await getProfileForUser(ctx, msg.senderId);
        return {
          ...msg,
          senderName: profile?.displayName ?? 'Unknown',
        };
      }),
    );

    return enriched;
  },
});

/** Count of rooms the user has been invited to but hasn't joined yet (for badge). */
export const pendingRoomCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const memberships = await ctx.db
      .query('studyRoomMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const pending = memberships.filter((m) => !m.hasJoined);
    const rooms = await Promise.all(pending.map((m) => ctx.db.get(m.roomId)));
    return rooms.filter((r) => r?.isActive).length;
  },
});

/** Get the pinned session data for a room. Returns null if no session pinned. */
export const getRoomPinnedSession = query({
  args: { roomId: v.id('studyRooms') },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    if (!(await findRoomMember(ctx, args.roomId, userId))) return null;

    const room = await ctx.db.get(args.roomId);
    if (!room || !room.pinnedSessionId) return null;

    const pinnedId = room.pinnedSessionId;
    const session = await ctx.db.get(pinnedId);
    if (!session || session.isDeleted) return null;

    // Join notes from sessionNotes table (same pattern as sessionSharing.getSharedSession)
    const notesDoc = await ctx.db
      .query('sessionNotes')
      .withIndex('by_session', (q) => q.eq('sessionId', pinnedId))
      .unique();

    // Get owner profile
    const ownerProfile = await getProfileForUser(ctx, session.userId);

    return {
      ...session,
      notesPlainText: notesDoc?.plainText,
      notesMarkdown: notesDoc?.markdown,
      owner: {
        userId: session.userId,
        displayName: ownerProfile?.displayName ?? 'Unknown',
        username: ownerProfile?.username ?? 'unknown',
      },
    };
  },
});

// ─── Mutations ────────────────────────────────────────────────

/** Create a new study room and invite friends. */
export const createRoom = mutation({
  args: {
    name: v.string(),
    friendIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    if (!args.name.trim()) throw new ConvexError('Room name is required');
    if (args.friendIds.length === 0) throw new ConvexError('Invite at least one friend');

    // Verify all invitees are friends
    for (const friendId of args.friendIds) {
      await verifyFriendship(ctx, userId, friendId);
    }

    const now = Date.now();

    // Create room
    const roomId = await ctx.db.insert('studyRooms', {
      name: args.name.trim(),
      hostUserId: userId,
      isActive: true,
      createdAt: now,
    });

    // Add host as member
    await ctx.db.insert('studyRoomMembers', {
      roomId,
      userId,
      role: 'host',
      hasJoined: true,
      lastSeenAt: now,
      createdAt: now,
    });

    // Add invited friends as members
    for (const friendId of args.friendIds) {
      await ctx.db.insert('studyRoomMembers', {
        roomId,
        userId: friendId,
        role: 'member',
        hasJoined: false,
        lastSeenAt: 0,
        createdAt: now,
      });
    }

    // System message
    const profile = await getProfileForUser(ctx, userId);
    await postSystemMessage(ctx, roomId, `${profile?.displayName ?? 'Host'} created the room`);

    return roomId;
  },
});

/** Mark the current user as having joined the room. */
export const joinRoom = mutation({
  args: { roomId: v.id('studyRooms') },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const member = await requireRoomMember(ctx, args.roomId, userId);

    const room = await ctx.db.get(args.roomId);
    if (!room?.isActive) throw new ConvexError('Room is no longer active');

    if (!member.hasJoined) {
      await ctx.db.patch(member._id, { hasJoined: true, lastSeenAt: Date.now() });
      const profile = await getProfileForUser(ctx, userId);
      await postSystemMessage(
        ctx,
        args.roomId,
        `${profile?.displayName ?? 'Someone'} joined the room`,
      );
    }
  },
});

/** Leave a room. If the host leaves, closes the room. */
export const leaveRoom = mutation({
  args: { roomId: v.id('studyRooms') },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const member = await requireRoomMember(ctx, args.roomId, userId);

    const room = await ctx.db.get(args.roomId);
    if (!room?.isActive) throw new ConvexError('Room is no longer active');

    const profile = await getProfileForUser(ctx, userId);

    if (member.role === 'host') {
      // Host leaving closes the room
      await ctx.db.patch(args.roomId, { isActive: false });
      await postSystemMessage(
        ctx,
        args.roomId,
        `${profile?.displayName ?? 'Host'} closed the room`,
      );

      // Remove all members
      const allMembers = await ctx.db
        .query('studyRoomMembers')
        .withIndex('by_room', (q) => q.eq('roomId', args.roomId))
        .collect();
      for (const m of allMembers) {
        await ctx.db.delete(m._id);
      }
    } else {
      await ctx.db.delete(member._id);
      await postSystemMessage(
        ctx,
        args.roomId,
        `${profile?.displayName ?? 'Someone'} left the room`,
      );
    }
  },
});

/** Close a room (host only). */
export const closeRoom = mutation({
  args: { roomId: v.id('studyRooms') },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireRoomHost(ctx, args.roomId, userId);

    const room = await ctx.db.get(args.roomId);
    if (!room?.isActive) throw new ConvexError('Room is already closed');

    await ctx.db.patch(args.roomId, { isActive: false });

    const profile = await getProfileForUser(ctx, userId);
    await postSystemMessage(ctx, args.roomId, `${profile?.displayName ?? 'Host'} closed the room`);

    // Remove all members
    const allMembers = await ctx.db
      .query('studyRoomMembers')
      .withIndex('by_room', (q) => q.eq('roomId', args.roomId))
      .collect();
    for (const m of allMembers) {
      await ctx.db.delete(m._id);
    }
  },
});

/** Send a chat message in a room. */
export const sendRoomMessage = mutation({
  args: {
    roomId: v.id('studyRooms'),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireRoomMember(ctx, args.roomId, userId);

    const room = await ctx.db.get(args.roomId);
    if (!room?.isActive) throw new ConvexError('Room is no longer active');

    if (!args.content.trim()) throw new ConvexError('Message cannot be empty');

    await ctx.db.insert('studyRoomMessages', {
      roomId: args.roomId,
      senderId: userId,
      content: args.content.trim(),
      messageType: 'text',
      createdAt: Date.now(),
    });
  },
});

/** Pin a session for the room (host only). */
export const pinSession = mutation({
  args: {
    roomId: v.id('studyRooms'),
    sessionId: v.id('sessions'),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireRoomHost(ctx, args.roomId, userId);

    // Verify host owns the session
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.isDeleted) throw new ConvexError('Session not found');
    if (session.userId !== userId) throw new ConvexError('You can only pin your own sessions');

    await ctx.db.patch(args.roomId, {
      pinnedSessionId: args.sessionId,
      pinnedSessionOwnerId: userId,
    });

    const profile = await getProfileForUser(ctx, userId);
    await postSystemMessage(
      ctx,
      args.roomId,
      `${profile?.displayName ?? 'Host'} pinned "${session.title}"`,
    );
  },
});

/** Unpin the current session (host only). */
export const unpinSession = mutation({
  args: { roomId: v.id('studyRooms') },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireRoomHost(ctx, args.roomId, userId);

    await ctx.db.patch(args.roomId, {
      pinnedSessionId: undefined,
      pinnedSessionOwnerId: undefined,
    });

    const profile = await getProfileForUser(ctx, userId);
    await postSystemMessage(
      ctx,
      args.roomId,
      `${profile?.displayName ?? 'Host'} unpinned the session`,
    );
  },
});

/** Update presence heartbeat. */
export const heartbeat = mutation({
  args: { roomId: v.id('studyRooms') },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const member = await ctx.db
      .query('studyRoomMembers')
      .withIndex('by_room_user', (q) => q.eq('roomId', args.roomId).eq('userId', userId))
      .unique();

    if (member) {
      await ctx.db.patch(member._id, { lastSeenAt: Date.now() });
    }
  },
});

/** Invite another friend to the room (host only). */
export const inviteToRoom = mutation({
  args: {
    roomId: v.id('studyRooms'),
    friendId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireRoomHost(ctx, args.roomId, userId);

    const room = await ctx.db.get(args.roomId);
    if (!room?.isActive) throw new ConvexError('Room is no longer active');

    // Verify friendship
    await verifyFriendship(ctx, userId, args.friendId);

    // Check not already a member
    const existing = await ctx.db
      .query('studyRoomMembers')
      .withIndex('by_room_user', (q) => q.eq('roomId', args.roomId).eq('userId', args.friendId))
      .unique();
    if (existing) throw new ConvexError('User is already in this room');

    const now = Date.now();
    await ctx.db.insert('studyRoomMembers', {
      roomId: args.roomId,
      userId: args.friendId,
      role: 'member',
      hasJoined: false,
      lastSeenAt: 0,
      createdAt: now,
    });

    const friendProfile = await getProfileForUser(ctx, args.friendId);
    await postSystemMessage(
      ctx,
      args.roomId,
      `${friendProfile?.displayName ?? 'A friend'} was invited to the room`,
    );
  },
});
