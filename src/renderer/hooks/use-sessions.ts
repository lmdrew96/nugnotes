import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

/**
 * Session mutations, with no subscription attached, so components that only
 * write (the notes panel, uploads) don't drag a read of every session along.
 * userId is derived from the JWT on the backend.
 */
export function useSessionMutations() {
  const createSession = useMutation(api.sessions.create);
  const updateSession = useMutation(api.sessions.update);
  const deleteSession = useMutation(api.sessions.softDelete);
  const restoreSession = useMutation(api.sessions.restore);
  const permanentDeleteSession = useMutation(api.sessions.permanentDelete);
  const mergeSessions = useMutation(api.sessions.mergeSessions);

  return {
    createSession,
    updateSession,
    deleteSession,
    restoreSession,
    permanentDeleteSession,
    mergeSessions,
  };
}

/**
 * The user's sessions, metadata only. Subscribe from components that actually
 * render a list — it re-runs on every write to any of the user's sessions.
 */
export function useSessionList() {
  const sessions = useQuery(api.sessions.listMetadata);
  return sessions ?? [];
}

/** Hook for getting a single session, with its notes joined. */
export function useSession(sessionId: Id<'sessions'> | null) {
  const session = useQuery(api.sessions.get, sessionId ? { id: sessionId } : 'skip');
  return session;
}

/**
 * Hook for trash management.
 * userId is now derived from the JWT token on the backend.
 */
export function useTrash() {
  const deletedSessions = useQuery(api.sessions.listDeletedMetadata);
  return deletedSessions || [];
}
