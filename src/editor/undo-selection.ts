/**
 * Puts the cursor back where it was when a change is undone or redone.
 *
 * y-prosemirror saves the cursor for each undo step as a Yjs relative
 * position: a pointer to the character after it. Two things go wrong with
 * that. Undoing a change re-creates the text it removed as new Yjs items, so a
 * pointer into removed text (splitting a line with Return removes the second
 * half) no longer finds its character and lands elsewhere — often the start of
 * the next line. And the saved spot is only handed over on Yjs's
 * 'stack-item-popped' event, which fires after the undo has already redrawn
 * the note.
 *
 * So each undo step also keeps the plain ProseMirror document and selection
 * from just before the change. When undo brings the document back to exactly
 * that state (always, unless a classmate edited the room note in between),
 * that selection is restored as-is; otherwise y-prosemirror's relative
 * position is the best guess left.
 */
import { createExtension } from '@blocknote/core';
import {
  AllSelection,
  type EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
} from 'prosemirror-state';
import {
  type getRelativeSelection,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
  yUndoPluginKey,
} from 'y-prosemirror';

type Doc = EditorState['doc'];

interface BeforeChange {
  doc: Doc;
  selection: Selection;
}

type StackItemEvent = { stackItem: { meta: Map<unknown, unknown> } };

const beforeChangeKey = new PluginKey<BeforeChange>('nugnotesBeforeChange');

const undoSelectionPlugin = new Plugin<BeforeChange>({
  key: beforeChangeKey,
  state: {
    init: (_config, state) => ({ doc: state.doc, selection: state.selection }),
    // Yjs records an undo step while the change is being synced, right after
    // the change is dispatched — so the state before that dispatch is the one
    // to come back to. Follow-up transactions that plugins append to it (e.g.
    // BlockNote giving a new block its id) keep the state from before the
    // original, or a split would be remembered half-done.
    apply: (tr, value, oldState) =>
      tr.getMeta('appendedTransaction')
        ? value
        : { doc: oldState.doc, selection: oldState.selection },
  },
  view: (view) => {
    const undoManager = yUndoPluginKey.getState(view.state)?.undoManager;
    if (!undoManager) return {};

    const remember = ({ stackItem }: StackItemEvent) => {
      const beforeChange = beforeChangeKey.getState(view.state);
      if (beforeChange) stackItem.meta.set(beforeChangeKey, beforeChange);
    };

    const restore = ({ stackItem }: StackItemEvent) => {
      const binding = ySyncPluginKey.getState(view.state)?.binding;
      if (binding) {
        // y-prosemirror parks its saved spot on the binding after the undo has
        // finished, so the next remote update would jump the cursor there.
        // Cleared after every 'stack-item-popped' listener has run.
        queueMicrotask(() => {
          binding.beforeTransactionSelection = null;
        });
      }
      const { doc, tr } = view.state;
      const beforeChange = stackItem.meta.get(beforeChangeKey) as BeforeChange | undefined;
      const selection = beforeChange?.doc.eq(doc)
        ? Selection.fromJSON(doc, beforeChange.selection.toJSON())
        : binding && fromRelativeSelection(binding, stackItem.meta.get(binding), doc);
      if (selection) view.dispatch(tr.setSelection(selection).setMeta('addToHistory', false));
    };

    undoManager.on('stack-item-added', remember);
    undoManager.on('stack-item-popped', restore);
    return {
      destroy: () => {
        undoManager.off('stack-item-added', remember);
        undoManager.off('stack-item-popped', restore);
      },
    };
  },
});

type Binding = NonNullable<ReturnType<typeof ySyncPluginKey.getState>>['binding'];

/** Resolve y-prosemirror's saved relative selection against the current note. */
const fromRelativeSelection = (
  binding: NonNullable<Binding>,
  saved: unknown,
  doc: Doc,
): Selection | null => {
  const relSel = saved as ReturnType<typeof getRelativeSelection> | undefined;
  if (!relSel?.anchor || !relSel.head) return null;
  if (relSel.type === 'all') return new AllSelection(doc);
  const anchor = relativePositionToAbsolutePosition(
    binding.doc,
    binding.type,
    relSel.anchor,
    binding.mapping,
  );
  const head = relativePositionToAbsolutePosition(
    binding.doc,
    binding.type,
    relSel.head,
    binding.mapping,
  );
  if (anchor === null || head === null) return null;
  if (relSel.type === 'node') return NodeSelection.create(doc, anchor);
  return TextSelection.between(doc.resolve(anchor), doc.resolve(head));
};

export const undoSelection = createExtension({
  key: 'nugnotesUndoSelection',
  prosemirrorPlugins: [undoSelectionPlugin],
});
