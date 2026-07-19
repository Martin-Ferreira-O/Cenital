// Global keymap. Guarded against typing contexts.

import { isTyping } from './canvas.js';
import { deleteSelection, duplicateSelection } from './inspector.js';

export function attachShortcuts({ store, tools, signal }) {
  window.addEventListener('keydown', (e) => {
    if (isTyping(e) || store.state.preview) return;
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? store.redo() : store.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicateSelection(store);
      return;
    }
    if (mod) return;

    switch (e.key) {
      case 'v': case 'V': store.setUI((s) => { s.tool = 'select'; }); break;
      case 'r': case 'R': store.setUI((s) => { s.tool = 'rect'; }); break;
      case 'c': case 'C': store.setUI((s) => { s.tool = 'circle'; }); break;
      case 'p': case 'P': store.setUI((s) => { s.tool = 'polygon'; }); break;
      case 't': case 'T': store.setUI((s) => { s.tool = 'label'; }); break;
      case 'Escape': case 'Enter':
        tools.onKey(e.key);
        break;
      case 'Delete': case 'Backspace':
        e.preventDefault();
        deleteSelection(store);
        break;
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
        if (!store.state.selection.length) return;
        e.preventDefault();
        const step = e.shiftKey ? 0.1 : store.state.grid.size;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        store.update(() => { for (const id of store.state.selection) store.shiftItem(id, dx, dy); });
        break;
      }
      default:
    }
  }, { signal });
}
