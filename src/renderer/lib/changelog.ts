/**
 * User-facing changelog.
 *
 * Entries are hand-written from the release history in plain language — this is
 * what users read, not a commit log. Newest first; `CHANGELOG[0]` is treated as
 * the current release everywhere else in the app.
 *
 * When you cut a release, add an entry here with the same version you put in
 * package.json. The "What's New" badge keys off `version`, so an entry with a
 * version newer than the one a user last saw is what makes the dot appear.
 */

export type ChangeKind = 'added' | 'improved' | 'fixed';

export interface ChangelogChange {
  kind: ChangeKind;
  text: string;
}

export interface ChangelogEntry {
  /** Canonical semver used for ordering and unseen-comparison. */
  version: string;
  /**
   * Display override for entries that cover a run of releases that shipped
   * together (e.g. '0.2.0 – 0.2.3'). Ordering still uses `version`.
   */
  label?: string;
  /** ISO date (YYYY-MM-DD) the release shipped. */
  date: string;
  title: string;
  changes: ChangelogChange[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.3.2',
    date: '2026-10-04',
    title: 'Nugget, locked down',
    changes: [
      {
        kind: 'fixed',
        text: 'Nugget chat, exam chat, bug reports and document reading now only work for signed-in students, and only ever see your own sessions and rooms.',
      },
      {
        kind: 'improved',
        text: 'If you send a lot of AI requests in a row, Nugget asks you to wait a few seconds instead of failing silently.',
      },
    ],
  },
  {
    version: '0.3.1',
    date: '2026-10-04',
    title: 'No more lost last words',
    changes: [
      {
        kind: 'fixed',
        text: 'Leaving a note right after typing no longer loses your last edit — NugNotes shows “Saving…” for a moment and waits for it.',
      },
      {
        kind: 'improved',
        text: 'Switching between a session’s tabs keeps your notes open, so coming back is instant.',
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-10-04',
    title: 'Nugget reads your notes and documents',
    changes: [
      {
        kind: 'added',
        text: 'Ask Nugget to pull out the key points of a session, from your notes and documents.',
      },
      {
        kind: 'improved',
        text: 'Study tools, games and exam rooms now work from your typed notes as well as uploads.',
      },
      {
        kind: 'improved',
        text: 'Nugget chat can see the documents you uploaded, not just your notes.',
      },
      {
        kind: 'improved',
        text: 'If a session is too empty to study from, Nugget tells you what to add instead of failing.',
      },
    ],
  },
  {
    version: '0.2.1',
    date: '2026-10-04',
    title: 'Safer builds',
    changes: [
      {
        kind: 'fixed',
        text: 'NugNotes can no longer be built pointing at another app’s servers by mistake.',
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-10-04',
    title: 'A new notes editor',
    changes: [
      {
        kind: 'added',
        text: 'Notes now use a Word-style editor with fonts, tables, images and real lists.',
      },
      {
        kind: 'added',
        text: 'Study room notes are live: everyone in the room edits the same page at once.',
      },
      {
        kind: 'improved',
        text: 'Generated notes are added to the end of your notes instead of replacing anything.',
      },
      {
        kind: 'improved',
        text: 'Your notes save as you type, and you are told if they ever stop syncing.',
      },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-04',
    title: 'Hello, NugNotes',
    changes: [
      {
        kind: 'added',
        text: 'Start a session by typing — it saves itself, no record button needed.',
      },
      {
        kind: 'added',
        text: 'Add documents, photos and handwriting to the session you are writing.',
      },
      {
        kind: 'improved',
        text: 'Edit your notes right from the Study view.',
      },
    ],
  },
];

export const LATEST_VERSION = CHANGELOG[0].version;

/**
 * Compares two dot-separated version strings.
 * Returns a negative number if `a` is older than `b`, positive if newer, 0 if equal.
 */
export function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  const length = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < length; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Entries newer than `sinceVersion`. A null/absent version means the user has
 * never opened the changelog, in which case nothing is "unseen" — we don't want
 * to greet a brand-new user with 20 releases of history they never missed.
 */
export function entriesSince(sinceVersion: string | null): ChangelogEntry[] {
  if (!sinceVersion) return [];
  return CHANGELOG.filter((entry) => compareVersions(entry.version, sinceVersion) > 0);
}

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** Formats an entry's ISO date for display. Parsed as UTC so it never shifts a day. */
export function formatEntryDate(isoDate: string): string {
  return DATE_FORMATTER.format(new Date(`${isoDate}T00:00:00Z`));
}
