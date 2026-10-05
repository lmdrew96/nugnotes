/**
 * The notes editor's BlockNote schema: BlockNote's defaults plus font and
 * font-size text styles, and the keyboard fix below.
 */
import { BlockNoteSchema, createExtension, defaultStyleSpecs } from '@blocknote/core';
import { createReactStyleSpec } from '@blocknote/react';
import { Selection, TextSelection } from 'prosemirror-state';

/** A font family on a run of text (one of EDITOR_FONTS). */
const Font = createReactStyleSpec(
  { type: 'font', propSchema: 'string' },
  { render: ({ value, contentRef }) => <span style={{ fontFamily: value }} ref={contentRef} /> },
);

/** A font size on a run of text, stored as px ("18px"). */
const FontSize = createReactStyleSpec(
  { type: 'fontSize', propSchema: 'string' },
  { render: ({ value, contentRef }) => <span style={{ fontSize: value }} ref={contentRef} /> },
);

export const notesSchema = BlockNoteSchema.create({
  styleSpecs: { ...defaultStyleSpecs, font: Font, fontSize: FontSize },
});

export type NotesEditorInstance = typeof notesSchema.BlockNoteEditor;

/**
 * BlockNote binds Shift+Cmd+Up/Down to "move block". On a Mac those keys
 * select to the start/end of the document, which students reach for, so they
 * do that here instead (runs before BlockNote's own shortcuts).
 */
export const macSelectionShortcuts = createExtension({
  key: 'nugnotesMacSelection',
  runsBefore: ['default'],
  keyboardShortcuts: {
    'Shift-Mod-ArrowUp': ({ editor }) => {
      editor.transact((tr) =>
        tr.setSelection(
          TextSelection.create(tr.doc, tr.selection.anchor, Selection.atStart(tr.doc).from),
        ),
      );
      return true;
    },
    'Shift-Mod-ArrowDown': ({ editor }) => {
      editor.transact((tr) =>
        tr.setSelection(
          TextSelection.create(tr.doc, tr.selection.anchor, Selection.atEnd(tr.doc).to),
        ),
      );
      return true;
    },
  },
});
