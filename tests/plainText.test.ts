import { describe, expect, it } from 'vitest';
import { blocksToPlainText } from '../src/editor/plain-text';

const text = (t: string) => ({ type: 'text', text: t, styles: {} });

describe('blocksToPlainText', () => {
  it('joins blocks with blank lines, nested children in order', () => {
    const blocks = [
      { content: [text('Morphology')], children: [] },
      {
        content: [text('free morpheme: '), text('basically words')],
        children: [{ content: [text('free content morphemes')], children: [] }],
      },
    ];
    expect(blocksToPlainText(blocks)).toBe(
      'Morphology\n\nfree morpheme: basically words\n\nfree content morphemes',
    );
  });

  it('reads link text and skips empty blocks', () => {
    const blocks = [
      { content: [text('See '), { type: 'link', href: 'x', content: [text('the reading')] }] },
      { content: [] },
      { content: undefined },
    ];
    expect(blocksToPlainText(blocks)).toBe('See the reading');
  });

  it('reads tables row by row', () => {
    const blocks = [
      {
        content: {
          type: 'tableContent',
          rows: [
            { cells: [[text('verb')], [text('past')]] },
            { cells: [{ content: [text('go')] }, { content: [text('went')] }] },
          ],
        },
      },
    ];
    expect(blocksToPlainText(blocks)).toBe('verb\tpast\ngo\twent');
  });
});
