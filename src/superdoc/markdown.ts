/**
 * Clean up SuperDoc's markdown so the app's markdown renderer can show it.
 *
 * SuperDoc 2.18's getMarkdown/projectMarkdown emit lists as raw HTML —
 * `<ul data-superdoc-list-labels><li style="list-style-type:none"><span
 * data-superdoc-list-label …>•&#9;</span>Text<ul>…nested…</ul></li></ul>` —
 * and underline as `<u>…</u>`. This turns each list back into markdown list
 * lines (keeping nesting and inline marks) and drops underline tags, which
 * markdown has no syntax for. Everything else passes through untouched.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X'
          ? Number.parseInt(e.slice(2), 16)
          : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[e.toLowerCase()] ?? whole;
  });

/** Inline HTML tags inside list items → their markdown delimiters. */
const MARK_DELIMITERS: Record<string, string> = {
  strong: '**',
  b: '**',
  em: '*',
  i: '*',
  s: '~~',
  del: '~~',
  strike: '~~',
  code: '`',
};

const TOKEN = /<(\/?)([a-z0-9]+)([^>]*)>|[^<]+/gi;

/** One top-level `<ul>`/`<ol>` region (nested lists included) → markdown lines. */
function listToMarkdown(html: string): string {
  const lines: string[] = [];
  const lists: { ordered: boolean; count: number }[] = [];
  let item: string | null = null; // text of the <li> being read, until flushed
  let inLabel = false;
  const hrefs: string[] = [];

  const flushItem = () => {
    if (item === null) return;
    const list = lists.at(-1);
    const text = item.replace(/\s+/g, ' ').trim();
    if (list && text) {
      list.count += 1;
      const marker = list.ordered ? `${list.count}.` : '-';
      lines.push(`${'  '.repeat(lists.length - 1)}${marker} ${text}`);
    }
    item = null;
  };

  for (const [token, close, rawTag, attrs] of html.matchAll(TOKEN)) {
    if (!rawTag) {
      if (item !== null && !inLabel) item += decodeEntities(token);
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (tag === 'ul' || tag === 'ol') {
      if (close) lists.pop();
      else {
        flushItem(); // an item whose nested list starts now
        lists.push({ ordered: tag === 'ol', count: 0 });
      }
    } else if (tag === 'li') {
      if (close) flushItem();
      else item = '';
    } else if (tag === 'span' && /data-superdoc-list-label/i.test(attrs)) {
      inLabel = !close;
    } else if (tag === 'span' && close && inLabel) {
      inLabel = false;
    } else if (item !== null && !inLabel) {
      if (tag === 'br') item += ' ';
      else if (tag === 'a') {
        if (close) item += `](${hrefs.pop() ?? ''})`;
        else {
          hrefs.push(decodeEntities(/\bhref\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? ''));
          item += '[';
        }
      } else if (MARK_DELIMITERS[tag]) item += MARK_DELIMITERS[tag];
      // <u>, plain spans and anything else carry no markdown.
    }
  }
  flushItem();
  return lines.join('\n');
}

export function normalizeSuperDocMarkdown(markdown: string): string {
  let out = '';
  let i = 0;
  const open = /<(ul|ol)\b/gi;
  while (true) {
    open.lastIndex = i;
    const start = open.exec(markdown);
    if (!start) break;
    // Find where this list closes, counting nested lists.
    const tags = /<(\/?)(ul|ol)\b[^>]*>/gi;
    tags.lastIndex = start.index;
    let depth = 0;
    let end = markdown.length;
    for (let m = tags.exec(markdown); m; m = tags.exec(markdown)) {
      depth += m[1] ? -1 : 1;
      if (depth === 0) {
        end = m.index + m[0].length;
        break;
      }
    }
    out += markdown.slice(i, start.index);
    out += listToMarkdown(markdown.slice(start.index, end));
    i = end;
  }
  out += markdown.slice(i);
  return out
    .replace(/<\/?u>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
