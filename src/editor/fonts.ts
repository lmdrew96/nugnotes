/**
 * Fonts and sizes offered in the notes editor's toolbar. The self-hosted
 * families are declared in src/renderer/styles/editor-fonts.css; keep the two
 * lists in step.
 */

export const EDITOR_FONTS = [
  'Inter',
  'Work Sans',
  'Manrope',
  'Quicksand',
  'Space Grotesk',
  'Lora',
  'Newsreader',
  'Source Serif 4',
  'Fraunces',
  'Geist Mono',
  'JetBrains Mono',
  // System fonts, for text pasted from Word or Docs.
  'Arial',
  'Times New Roman',
];

/** What text without a font style renders in (set on the editor in globals.css). */
export const DEFAULT_EDITOR_FONT = 'Inter';

/** Point-style sizes, stored on the text as px. */
export const EDITOR_FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40];

/** What text without a size style renders at. */
export const DEFAULT_EDITOR_FONT_SIZE = 16;
