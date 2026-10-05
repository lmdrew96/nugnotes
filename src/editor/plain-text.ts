/**
 * The plain-text copy of a note that the AI features read (sessionNotes
 * .notesPlainText): one paragraph per block, nested blocks included in order,
 * separated by blank lines.
 */

type Inline = { type: string; text?: string; content?: unknown };
type TableContent = { type: 'tableContent'; rows: { cells: unknown[] }[] };
export type PlainBlock = {
  content?: Inline[] | TableContent | unknown;
  children?: PlainBlock[];
};

const inlineText = (content: unknown): string => {
  if (!Array.isArray(content)) return '';
  return content
    .map((item: Inline) => {
      if (typeof item.text === 'string') return item.text;
      // Links (and other wrappers) hold their text one level down.
      return inlineText(item.content);
    })
    .join('');
};

const cellText = (cell: unknown): string =>
  // A cell is either inline content directly or { content: Inline[] }.
  Array.isArray(cell) ? inlineText(cell) : inlineText((cell as { content?: unknown })?.content);

const blockText = (block: PlainBlock): string => {
  const { content } = block;
  if ((content as TableContent | undefined)?.type === 'tableContent') {
    return (content as TableContent).rows
      .map((row) => row.cells.map(cellText).join('\t'))
      .join('\n');
  }
  return inlineText(content);
};

export function blocksToPlainText(blocks: PlainBlock[]): string {
  const paragraphs: string[] = [];
  const walk = (list: PlainBlock[]) => {
    for (const block of list) {
      const text = blockText(block).trim();
      if (text) paragraphs.push(text);
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
  return paragraphs.join('\n\n');
}
