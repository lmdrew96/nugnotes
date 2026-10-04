import { describe, expect, it } from 'vitest';
import { normalizeSuperDocMarkdown } from '../src/superdoc/markdown';

const label = (text: string) =>
  `<span data-superdoc-list-label data-superdoc-list-suffix="tab">${text}&#9;</span>`;

describe('normalizeSuperDocMarkdown', () => {
  it('turns a SuperDoc bullet list into markdown bullets (real 2.18 output)', () => {
    const md = `Photosynthesis basics\n\n<ul data-superdoc-list-labels="explicit"><li style="list-style-type:none">${label('•')}Light reactions happen in the thylakoid</li><li style="list-style-type:none">${label('•')}Calvin cycle makes glucose</li></ul>`;
    expect(normalizeSuperDocMarkdown(md)).toBe(
      'Photosynthesis basics\n\n- Light reactions happen in the thylakoid\n- Calvin cycle makes glucose',
    );
  });

  it('numbers ordered lists and indents nested ones', () => {
    const md = `<ol><li>${label('1.')}First<ul><li>${label('•')}Detail</li></ul></li><li>${label('2.')}Second</li></ol>`;
    expect(normalizeSuperDocMarkdown(md)).toBe('1. First\n  - Detail\n2. Second');
  });

  it('keeps inline marks and links, decodes entities, drops underline', () => {
    const md = `<ul><li>${label('•')}<strong>ATP</strong> &amp; <em>NADPH</em> via <a href="https://x.dev/?a=1&amp;b=2">link</a> <u>under</u></li></ul>`;
    expect(normalizeSuperDocMarkdown(md)).toBe(
      '- **ATP** & *NADPH* via [link](https://x.dev/?a=1&b=2) under',
    );
  });

  it('strips underline tags outside lists and leaves other markdown alone', () => {
    expect(normalizeSuperDocMarkdown('# Title\n\nSome <u>key</u> **term**.')).toBe(
      '# Title\n\nSome key **term**.',
    );
  });

  it('handles text after a list', () => {
    const md = `<ul><li>${label('•')}One</li></ul>\n\nAfter the list`;
    expect(normalizeSuperDocMarkdown(md)).toBe('- One\n\nAfter the list');
  });
});
