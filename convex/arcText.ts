/**
 * Arcs: one line per thread on how the idea moved across the course, citing
 * the sessions it draws on. The prompt and checking the reply; pure, so it
 * can be tested.
 */

const MAX_ARC_CHARS = 220;

export interface ArcThread {
  /** A1, A2… for the prompt. */
  key: string;
  name: string;
  /** In class order. S1, S2… are only unique within the thread. */
  sessions: { key: string; date: string; isSource: boolean; lines: string[] }[];
}

export const buildArcPrompt = (courseName: string, threads: ArcThread[]): string => {
  const blocks = threads
    .map(
      (t) =>
        `<thread key="${t.key}" name="${t.name.replace(/"/g, "'")}">\n${t.sessions
          .map(
            (s) =>
              `[${s.key}] ${s.date}${s.isSource ? ' (reading)' : ''}\n${s.lines.map((l) => `  ${l}`).join('\n')}`,
          )
          .join('\n')}\n</thread>`,
    )
    .join('\n\n');
  return `A student's notes for ${courseName} come back to some ideas in several sessions. For each thread below you get the lines that mention the idea, session by session in class order. Marks: ~~crossed out~~ is not content; [?] is an unreadable word.

${blocks}

For each thread, write its arc: ONE line on how the idea moved across the course, e.g. "Started as an encoding idea (Oct 14), came back as a study strategy (Oct 21)." Say what changed between sessions: introduced, defined, given an example, contrasted, applied. Use only what the lines say, never outside facts. At most 30 words, with the dates in parentheses.

Reply with JSON only, no code fences:
{"arcs":[{"thread":"A1","arc":"…","cites":["S1","S3"]}]}

cites: the session keys of that thread the arc draws on (at least 2).`;
};

export interface ParsedArc {
  thread: string;
  text: string;
  cites: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Claude's reply → arcs. Dropped: unknown threads, repeats, cites that aren't
 * that thread's sessions, and arcs citing fewer than two sessions. Throws only
 * when the reply isn't the JSON shape at all.
 */
export const parseArcs = (reply: string, threads: ArcThread[]): ParsedArc[] => {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : reply).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Arc reply had no JSON');
  const parsed: unknown = JSON.parse(body.slice(start, end + 1));
  if (!isRecord(parsed) || !Array.isArray(parsed.arcs)) throw new Error('Arc reply missing arcs');
  const sessionsOf = new Map(threads.map((t) => [t.key, new Set(t.sessions.map((s) => s.key))]));
  const done = new Set<string>();
  const out: ParsedArc[] = [];
  for (const item of parsed.arcs) {
    if (!isRecord(item) || typeof item.thread !== 'string' || typeof item.arc !== 'string')
      continue;
    const valid = sessionsOf.get(item.thread);
    if (!valid || done.has(item.thread)) continue;
    const cites = [
      ...new Set(
        (Array.isArray(item.cites) ? item.cites : []).filter(
          (c): c is string => typeof c === 'string' && valid.has(c),
        ),
      ),
    ];
    const text = item.arc.trim().slice(0, MAX_ARC_CHARS);
    if (!text || cites.length < 2) continue;
    done.add(item.thread);
    out.push({ thread: item.thread, text, cites });
  }
  return out;
};
