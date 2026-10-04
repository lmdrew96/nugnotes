import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Id } from '../../../convex/_generated/dataModel';

/** A saved Nugget note on the active session. */
export interface NuggetNote {
  text: string;
}

interface SessionContextValue {
  /** The currently active session ID (the one open in the editor or study view) */
  activeSessionId: Id<'sessions'> | null;
  setActiveSessionId: (id: Id<'sessions'> | null) => void;

  /** Nugget notes on the active session, passed to Nugget chat as context */
  nuggetNotes: NuggetNote[];
  setNuggetNotes: (notes: NuggetNote[]) => void;

  /** Chat drawer open/close state */
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [activeSessionId, setActiveSessionId] = useState<Id<'sessions'> | null>(null);
  const [nuggetNotes, setNuggetNotes] = useState<NuggetNote[]>([]);
  const [chatOpen, setChatOpen] = useState(false);

  const stableSetActiveSessionId = useCallback(
    (id: Id<'sessions'> | null) => setActiveSessionId(id),
    [],
  );
  const stableSetNuggetNotes = useCallback((notes: NuggetNote[]) => setNuggetNotes(notes), []);
  const stableSetChatOpen = useCallback((open: boolean) => setChatOpen(open), []);

  const value = useMemo(
    () => ({
      activeSessionId,
      setActiveSessionId: stableSetActiveSessionId,
      nuggetNotes,
      setNuggetNotes: stableSetNuggetNotes,
      chatOpen,
      setChatOpen: stableSetChatOpen,
    }),
    [
      activeSessionId,
      stableSetActiveSessionId,
      nuggetNotes,
      stableSetNuggetNotes,
      chatOpen,
      stableSetChatOpen,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionContext(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }
  return ctx;
}
