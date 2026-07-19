// Builder state. THE RULE: every committed mutation goes through update() (one undo
// snapshot, one wholesale re-render). Transient drag state must NOT touch the store —
// patch the dragged elements' DOM directly and commit once at pointerup.

import { validate } from '../core/schema.js';
import { shiftZone } from '../core/geometry.js';

const AUTOSAVE_KEY = 'mapa-discos:doc';

export function blankDoc() {
  return {
    schemaVersion: '1.0',
    venue: { name: 'Mi Club', city: '', currency: 'CLP' },
    tiers: [
      { id: 'general', label: 'General', color: '#5b7fdb', price: 10000, fee: 1750 },
    ],
    floors: [
      { id: 'main', label: 'Piso 1', size: { width: 24, height: 16 }, zones: [], labels: [] },
    ],
  };
}

export function loadAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const result = validate(JSON.parse(raw));
    return result.ok ? result.venue : null;
  } catch {
    return null;
  }
}

export function createStore(initialDoc) {
  const state = {
    doc: initialDoc,
    floorId: initialDoc.floors[0].id,
    tool: 'select',
    selection: [],       // zone ids, or a single 'label:<index>'
    grid: { size: 0.5, snap: true },
    preview: false,
  };
  const undoStack = [];
  const redoStack = [];
  const subs = new Set();
  let saveTimer = null;

  const notify = () => subs.forEach((fn) => fn(state));
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state.doc)); } catch { /* full/private */ }
    }, 500);
  };

  // after an undo/redo/import the selection and floor may point at dead objects
  const reconcile = () => {
    if (!state.doc.floors.some((f) => f.id === state.floorId)) {
      state.floorId = state.doc.floors[0].id;
    }
    const ids = new Set(store.floor().zones.map((z) => z.id));
    state.selection = state.selection.filter((id) => (id.startsWith('label:')
      ? store.floor().labels?.[Number(id.slice(6))] !== undefined
      : ids.has(id)));
  };

  const store = {
    state,
    get doc() { return state.doc; },
    floor: () => state.doc.floors.find((f) => f.id === state.floorId),
    zone(id) {
      for (const f of state.doc.floors) {
        const z = f.zones.find((zz) => zz.id === id);
        if (z) return z;
      }
      return null;
    },
    zoneIds() {
      return new Set(state.doc.floors.flatMap((f) => f.zones.map((z) => z.id)));
    },
    selectedZones: () => state.selection.filter((id) => !id.startsWith('label:')).map((id) => store.zone(id)).filter(Boolean),

    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },

    /** Committed document mutation: snapshot -> mutate -> notify -> autosave. */
    update(fn, { undoable = true } = {}) {
      if (undoable) {
        undoStack.push(structuredClone(state.doc));
        if (undoStack.length > 100) undoStack.shift();
        redoStack.length = 0;
      }
      fn(state);
      reconcile();
      notify();
      scheduleSave();
    },

    /** UI-only change (tool, selection, floor, grid): no undo entry, no autosave. */
    setUI(fn) {
      fn(state);
      notify();
    },

    undo() {
      if (!undoStack.length) return;
      redoStack.push(structuredClone(state.doc));
      state.doc = undoStack.pop();
      reconcile();
      notify();
      scheduleSave();
    },

    redo() {
      if (!redoStack.length) return;
      undoStack.push(structuredClone(state.doc));
      state.doc = redoStack.pop();
      reconcile();
      notify();
      scheduleSave();
    },

    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,

    /** Translate a selection item (zone id or 'label:<i>'). Call inside update(). */
    shiftItem(id, dx, dy) {
      if (id.startsWith('label:')) {
        const l = store.floor().labels?.[Number(id.slice(6))];
        if (l) { l.x += dx; l.y += dy; }
      } else {
        const z = store.zone(id);
        if (z) shiftZone(z, dx, dy);
      }
    },

    /** Unique slug: nextId('mesa') -> mesa-1, mesa-2, ... across all floors. */
    nextId(prefix) {
      const ids = store.zoneIds();
      let n = 1;
      while (ids.has(`${prefix}-${n}`)) n += 1;
      return `${prefix}-${n}`;
    },
  };
  return store;
}
