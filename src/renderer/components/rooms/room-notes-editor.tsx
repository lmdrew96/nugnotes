import { Users } from 'lucide-react';
import { Suspense, lazy } from 'react';
import type { Id } from '../../../../convex/_generated/dataModel';
import { roomDocKey } from '../../../../convex/ydocKeys';

// The editor is a big chunk; load it only when the room's notes tab opens.
const NotesEditor = lazy(() => import('@/components/notes-editor'));

// Room notes live only in the editor (no derived copy is read anywhere else).
const ignoreSnapshot = () => {};

interface RoomNotesEditorProps {
  roomId: Id<'studyRooms'>;
}

/** The study room's shared notes: one document every member edits live. */
export function RoomNotesEditor({ roomId }: RoomNotesEditorProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        Everyone in the room can edit these notes, live.
      </p>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl glass">
        <Suspense
          fallback={<p className="p-4 text-sm text-muted-foreground">Loading the editor…</p>}
        >
          <NotesEditor
            key={roomId}
            docKey={roomDocKey(roomId)}
            onSnapshot={ignoreSnapshot}
            className="flex-1"
          />
        </Suspense>
      </div>
    </div>
  );
}
