/**
 * The notes editor's formatting toolbar: BlockNote's default buttons with a
 * font and a font-size menu after the block-type menu.
 */
import {
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
  useActiveStyles,
  useBlockNoteEditor,
  useComponentsContext,
  usePortalElement,
} from '@blocknote/react';
import {
  DEFAULT_EDITOR_FONT,
  DEFAULT_EDITOR_FONT_SIZE,
  EDITOR_FONTS,
  EDITOR_FONT_SIZES,
} from './fonts';
import { notesSchema } from './schema';

function FontSelect() {
  const editor = useBlockNoteEditor(notesSchema);
  const Components = useComponentsContext();
  const portalElement = usePortalElement();
  const current = useActiveStyles(editor).font ?? DEFAULT_EDITOR_FONT;
  if (!Components) return null;
  return (
    <Components.FormattingToolbar.Select
      className="bn-select nugnotes-font-select"
      portalElement={portalElement}
      items={EDITOR_FONTS.map((font) => ({
        text: font,
        icon: <span style={{ fontFamily: font }}>Aa</span>,
        isSelected: font === current,
        onClick: () => {
          if (font === DEFAULT_EDITOR_FONT) editor.removeStyles({ font: '' });
          else editor.addStyles({ font });
          editor.focus();
        },
      }))}
    />
  );
}

function FontSizeSelect() {
  const editor = useBlockNoteEditor(notesSchema);
  const Components = useComponentsContext();
  const portalElement = usePortalElement();
  const active = useActiveStyles(editor).fontSize;
  const current = active ? Number.parseInt(active, 10) : DEFAULT_EDITOR_FONT_SIZE;
  if (!Components) return null;
  return (
    <Components.FormattingToolbar.Select
      className="bn-select nugnotes-size-select"
      portalElement={portalElement}
      items={EDITOR_FONT_SIZES.map((size) => ({
        text: String(size),
        icon: null,
        isSelected: size === current,
        onClick: () => {
          if (size === DEFAULT_EDITOR_FONT_SIZE) editor.removeStyles({ fontSize: '' });
          else editor.addStyles({ fontSize: `${size}px` });
          editor.focus();
        },
      }))}
    />
  );
}

const NotesToolbar = () => {
  const [blockTypeSelect, ...rest] = getFormattingToolbarItems();
  return (
    <FormattingToolbar>
      {blockTypeSelect}
      <FontSelect key="fontSelect" />
      <FontSizeSelect key="fontSizeSelect" />
      {rest}
    </FormattingToolbar>
  );
};

export const NotesFormattingToolbar = () => (
  <FormattingToolbarController formattingToolbar={NotesToolbar} />
);
