/**
 * Themes: the prompt that groups a course's concepts, and checking Claude's
 * reply. Pure, so it can be tested.
 */

/** Room for a handful of top-level themes and a few sub-themes each. */
const MAX_THEMES = 10;
const MAX_SUBTHEMES = 6;

export interface ThemeConcept {
  /** C1, C2… for the prompt. */
  key: string;
  name: string;
  aliases: string[];
  /** Sessions (and sources) it shows up in. */
  sessions: number;
  /** Its current theme's key, if grouped. */
  theme?: string;
}

export interface ExistingTheme {
  /** T1, T2… for the prompt. */
  key: string;
  name: string;
  /** The student named it: keep using it under this name. */
  renamed: boolean;
  /** Key of its parent, for a sub-theme. */
  parent?: string;
}

const describeConcepts = (concepts: ThemeConcept[]): string =>
  concepts
    .map(
      (c) =>
        `${c.key}: ${c.name}${c.aliases.length ? ` (also: ${c.aliases.slice(0, 3).join(', ')})` : ''} · ${c.sessions} session${c.sessions === 1 ? '' : 's'}${c.theme ? ` · now in ${c.theme}` : ''}`,
    )
    .join('\n');

const describeThemes = (themes: ExistingTheme[]): string =>
  themes.length === 0
    ? 'None yet.'
    : themes
        .map(
          (t) =>
            `${t.key}: ${t.name}${t.parent ? ` (inside ${t.parent})` : ''}${t.renamed ? ' [named by the student: keep it, under this name]' : ''}`,
        )
        .join('\n');

export const buildThemePrompt = (opts: {
  courseName: string;
  concepts: ThemeConcept[];
  themes: ExistingTheme[];
  /** Groupings the student dismissed: don't suggest them again. */
  dismissed: string[];
}): string => `You organize the concepts from a student's notes for ${opts.courseName} into the course's big themes, like the units of a syllabus (for an intro psychology course: Memory, Perception, Development, the Brain, Social psychology, Learning & study strategies). You never write explanations.

Themes already in this course:
${describeThemes(opts.themes)}
${opts.dismissed.length ? `\nThe student rejected these groupings, so don't suggest them again: ${opts.dismissed.join(', ')}\n` : ''}
Concepts (key: name · how many sessions mention it · its current theme):
${describeConcepts(opts.concepts)}

Reply with JSON only, no code fences:
{"themes":[{"key":"T1 or null","name":"…","concepts":["C1","C4"],"subthemes":[{"key":"T5 or null","name":"…","concepts":["C2","C3"]}]}]}

Rules:
- 5 to 8 top-level themes (fewer if the course has few concepts). Each a broad topic of the course, named in 1 to 4 plain words.
- Put every concept in exactly one place: a theme's concepts, or one of its sub-themes' concepts.
- Keep things stable: reuse an existing theme's key when it is still the same topic, and leave concepts where they are unless they clearly fit elsewhere. A theme named by the student keeps its key and its name.
- Sub-themes only where the grouping is obvious (Memory → Explicit memory → Episodic, Semantic): a theme can have sub-themes, but a sub-theme never has its own. Most themes need none.
- key: an existing theme's key, or null for a new one. Only keys from the list.`;

export interface ParsedGroup {
  key: string | null;
  name: string;
  concepts: string[];
}

export interface ParsedTheme extends ParsedGroup {
  subthemes: ParsedGroup[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string') : [];

/**
 * Claude's reply → themes. Unknown concept or theme keys are dropped, a concept
 * placed twice keeps its first place, a theme key used twice is only reused
 * once, and themes left with no concepts are dropped. Throws only when the
 * reply isn't the JSON shape at all.
 */
export const parseThemes = (
  reply: string,
  conceptKeys: Set<string>,
  themeKeys: Set<string>,
): ParsedTheme[] => {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : reply).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Theme reply had no JSON');
  const parsed: unknown = JSON.parse(body.slice(start, end + 1));
  if (!isRecord(parsed) || !Array.isArray(parsed.themes)) {
    throw new Error('Theme reply missing themes');
  }
  const placed = new Set<string>();
  const usedKeys = new Set<string>();
  const group = (item: Record<string, unknown>): ParsedGroup | null => {
    if (typeof item.name !== 'string' || !item.name.trim()) return null;
    const rawKey = typeof item.key === 'string' ? item.key.trim() : '';
    const key = themeKeys.has(rawKey) && !usedKeys.has(rawKey) ? rawKey : null;
    if (key) usedKeys.add(key);
    const concepts = strings(item.concepts)
      .map((c) => c.trim())
      .filter((c) => conceptKeys.has(c) && !placed.has(c));
    for (const c of concepts) placed.add(c);
    return { key, name: item.name.trim().slice(0, 60), concepts };
  };
  const out: ParsedTheme[] = [];
  for (const item of parsed.themes.slice(0, MAX_THEMES)) {
    if (!isRecord(item)) continue;
    const top = group(item);
    if (!top) continue;
    const subthemes = (Array.isArray(item.subthemes) ? item.subthemes : [])
      .slice(0, MAX_SUBTHEMES)
      .flatMap((sub) => (isRecord(sub) ? (group(sub) ?? []) : []))
      .filter((sub) => sub.concepts.length > 0);
    if (top.concepts.length === 0 && subthemes.length === 0) continue;
    out.push({ ...top, subthemes });
  }
  return out;
};
