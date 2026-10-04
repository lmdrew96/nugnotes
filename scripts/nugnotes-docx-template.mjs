// The DOCX every new note starts from (ported from Folio). Its styles are what
// SuperDoc's style menu offers and what Word sees on export.
//
// Colours are left automatic on purpose: SuperDoc paints "auto" text as plain
// black, which the app's CSS maps to the theme's foreground — an explicit
// colour would stay put and vanish on a dark page.
import { Document, Packer, Paragraph } from 'docx';

const pt = (n) => n * 2; // docx run sizes are half-points
const twips = (n) => n * 20; // paragraph spacing is in twentieths of a point

/** @param {string} font  The prose font family (stored in the DOCX). */
export async function buildNugNotesTemplate(font) {
  const heading = (size, { before, bold = false }) => ({
    run: { font, size: pt(size), bold, color: 'auto' },
    paragraph: {
      spacing: { before: twips(before), after: twips(6), line: 264 },
      keepNext: true,
      keepLines: true,
    },
  });

  const doc = new Document({
    title: 'Notes',
    styles: {
      default: {
        document: {
          run: { font, size: pt(12) },
          // Line spacing in 240ths of a line: 1.4 lines, 6pt between paragraphs.
          paragraph: { spacing: { line: 336, after: twips(6) } },
        },
        title: heading(26, { before: 0 }),
        heading1: heading(20, { before: 16, bold: true }),
        heading2: heading(16, { before: 14, bold: true }),
        heading3: heading(14, { before: 12, bold: true }),
        // Defined explicitly: left out, the docx library supplies Word's blue.
        heading4: heading(12, { before: 12, bold: true }),
        heading5: heading(12, { before: 10 }),
        heading6: heading(11, { before: 10 }),
        footnoteText: { run: { font, size: pt(10) } },
      },
      paragraphStyles: [
        {
          id: 'Quote',
          name: 'Quote',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font, italics: true },
          paragraph: { indent: { left: twips(28) } },
        },
      ],
    },
    sections: [{ children: [new Paragraph({})] }],
  });
  return Packer.toBuffer(doc);
}
