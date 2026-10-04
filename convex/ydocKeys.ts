/**
 * A SuperDoc document's key in the ydoc tables. Notes belong either to a
 * session (owner only) or to a study room (its members), so the key carries
 * the kind: `session:<id>` or `room:<id>`. Shared by the client and Convex.
 */
export type DocKey = `session:${string}` | `room:${string}`;

export const sessionDocKey = (sessionId: string): DocKey => `session:${sessionId}`;
export const roomDocKey = (roomId: string): DocKey => `room:${roomId}`;

export function parseDocKey(key: string): { kind: 'session' | 'room'; id: string } | null {
  const sep = key.indexOf(':');
  if (sep < 0) return null;
  const kind = key.slice(0, sep);
  const id = key.slice(sep + 1);
  if ((kind !== 'session' && kind !== 'room') || !id) return null;
  return { kind, id };
}
