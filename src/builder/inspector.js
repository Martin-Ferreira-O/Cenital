// Right-panel inspector. Wholesale re-render on every state change; fields commit on
// 'change' (blur/enter) so each edit is exactly one undo entry.

import { ZONE_TYPES, STATUSES, FIXTURES } from '../core/schema.js';
import { alignDeltas, distributeDeltas, round2 } from '../core/geometry.js';

export function deleteSelection(store) {
  const sel = store.state.selection;
  if (!sel.length) return;
  store.update((s) => {
    const labelIdx = sel.filter((i) => i.startsWith('label:')).map((i) => Number(i.slice(6)));
    const floor = store.floor();
    if (labelIdx.length) floor.labels = floor.labels.filter((_, i) => !labelIdx.includes(i));
    const ids = new Set(sel);
    floor.zones = floor.zones.filter((z) => !ids.has(z.id));
    s.selection = [];
  });
}

const prefixOf = (id) => (id.match(/^(.*)-\d+$/)?.[1] ?? id);

export function duplicateSelection(store) {
  const zones = store.selectedZones();
  if (!zones.length) return;
  store.update((s) => {
    const created = [];
    for (const zone of zones) {
      const copy = structuredClone(zone);
      copy.id = store.nextId(prefixOf(zone.id));
      if (copy.label) copy.label = copy.label.replace(/\d+$/, (n) => String(Number(n) + 1));
      if (copy.shape === 'polygon') copy.points = copy.points.map(([x, y]) => [x + 1, y + 1]);
      else if (copy.shape !== 'path') { copy.x += 1; copy.y += 1; }
      store.floor().zones.push(copy);
      created.push(copy.id);
    }
    s.selection = created;
  });
}

function arrayDuplicate(store, zone, count, dx, dy) {
  if (!(count >= 2)) return;
  store.update((s) => {
    const created = [zone.id];
    for (let i = 1; i < count; i += 1) {
      const copy = structuredClone(zone);
      copy.id = store.nextId(prefixOf(zone.id));
      if (copy.label) copy.label = `${copy.label.replace(/\s*\d+$/, '')} ${i + 1}`.trim();
      if (copy.shape === 'polygon') copy.points = copy.points.map(([x, y]) => [round2(x + dx * i), round2(y + dy * i)]);
      else { copy.x = round2(copy.x + dx * i); copy.y = round2(copy.y + dy * i); }
      store.floor().zones.push(copy);
      created.push(copy.id);
    }
    s.selection = created;
  });
}

// ---- DOM helpers ----

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}

function field(parent, labelText, input) {
  const wrap = el('label', 'bld-field', parent);
  el('span', 'bld-field-label', wrap, labelText);
  wrap.appendChild(input);
  return input;
}

function textInput(value, onCommit) {
  const i = document.createElement('input');
  i.type = 'text';
  i.value = value ?? '';
  i.addEventListener('change', () => onCommit(i.value.trim()));
  return i;
}

function numInput(value, onCommit, step = 0.1) {
  const i = document.createElement('input');
  i.type = 'number';
  i.step = step;
  i.value = value === undefined ? '' : round2(value);
  i.addEventListener('change', () => {
    const v = parseFloat(i.value);
    if (Number.isFinite(v)) onCommit(v);
  });
  return i;
}

function selectInput(value, options, onCommit) {
  const s = document.createElement('select');
  for (const [val, label] of options) {
    const o = el('option', null, s, label);
    o.value = val;
  }
  s.value = value ?? '';
  s.addEventListener('change', () => onCommit(s.value));
  return s;
}

// ---- panels ----

export function createInspector(root, store, canvas) {
  const editZone = (id, fn) => store.update(() => { const z = store.zone(id); if (z) fn(z); });

  function venuePanel(state) {
    el('h3', 'bld-h', root, 'Venue');
    const v = state.doc.venue;
    field(root, 'Nombre', textInput(v.name, (t) => t && store.update(() => { v.name = t; })));
    field(root, 'Ciudad', textInput(v.city, (t) => store.update(() => { v.city = t; })));
    field(root, 'Moneda', textInput(v.currency ?? 'CLP', (t) => t && store.update(() => { v.currency = t.toUpperCase(); })));
    const floor = store.floor();
    el('h3', 'bld-h', root, `Piso — ${floor.label}`);
    field(root, 'Nombre', textInput(floor.label, (t) => t && store.update(() => { floor.label = t; })));
    field(root, 'Ancho (m)', numInput(floor.size.width, (n) => n > 0 && store.update(() => { floor.size.width = n; })));
    field(root, 'Alto (m)', numInput(floor.size.height, (n) => n > 0 && store.update(() => { floor.size.height = n; })));
    if (state.doc.floors.length > 1) {
      const del = el('button', 'bld-btn bld-danger', root, 'Eliminar este piso');
      del.addEventListener('click', () => {
        if (!confirm(`¿Eliminar "${floor.label}" y sus ${floor.zones.length} zonas?`)) return;
        store.update((s) => {
          s.doc.floors = s.doc.floors.filter((f) => f.id !== floor.id);
          s.selection = [];
        });
      });
    }
    el('p', 'bld-hint', root, 'Selecciona una zona para editarla. V selección · R rect · C círculo · P polígono · T texto.');
  }

  function labelPanel(state, idx) {
    const floor = store.floor();
    const l = floor.labels?.[idx];
    if (!l) return;
    el('h3', 'bld-h', root, 'Texto');
    const edit = (fn) => store.update(() => fn(l));
    field(root, 'Texto', textInput(l.text, (t) => t && edit(() => { l.text = t; })));
    field(root, 'X', numInput(l.x, (n) => edit(() => { l.x = n; })));
    field(root, 'Y', numInput(l.y, (n) => edit(() => { l.y = n; })));
    field(root, 'Tamaño', numInput(l.size ?? 0.6, (n) => n > 0 && edit(() => { l.size = n; })));
    field(root, 'Rotación', numInput(l.rotation ?? 0, (n) => edit(() => { l.rotation = n || undefined; }), 5));
    el('button', 'bld-btn bld-danger', root, 'Eliminar').addEventListener('click', () => deleteSelection(store));
  }

  function zonePanel(state, zone) {
    el('h3', 'bld-h', root, `Zona — ${zone.id}`);
    field(root, 'ID', textInput(zone.id, (t) => {
      if (!t || t === zone.id) return;
      if (store.zoneIds().has(t)) { render(store.state); return; }
      store.update((s) => {
        zone.id = t;
        s.selection = [t];
      });
    }));
    field(root, 'Etiqueta', textInput(zone.label, (t) => editZone(zone.id, (z) => { z.label = t || undefined; })));
    field(root, 'Tipo', selectInput(zone.type, ZONE_TYPES.map((t) => [t, t]), (t) => editZone(zone.id, (z) => { z.type = t; })));
    if (zone.type === 'fixture') {
      field(root, 'Ícono', selectInput(zone.fixture ?? '', [['', '(ninguno)'], ...FIXTURES.map((f) => [f, f])],
        (f) => editZone(zone.id, (z) => { z.fixture = f || undefined; })));
    }
    field(root, 'Tier', selectInput(zone.tier ?? '', [['', '(sin tier)'], ...state.doc.tiers.map((t) => [t.id, t.label])],
      (t) => editZone(zone.id, (z) => { z.tier = t || undefined; })));
    field(root, 'Capacidad', numInput(zone.capacity, (n) => editZone(zone.id, (z) => { z.capacity = n > 0 ? Math.round(n) : undefined; }), 1));
    field(root, 'Estado', selectInput(zone.status ?? 'available', STATUSES.map((s) => [s, s]),
      (t) => editZone(zone.id, (z) => { z.status = t === 'available' ? undefined : t; })));
    field(root, 'Interactiva', selectInput(
      zone.interactive === undefined ? 'auto' : String(zone.interactive),
      [['auto', 'auto (según tier)'], ['true', 'sí'], ['false', 'no']],
      (v) => editZone(zone.id, (z) => { z.interactive = v === 'auto' ? undefined : v === 'true'; }),
    ));

    el('h3', 'bld-h', root, 'Geometría');
    const geo = el('div', 'bld-grid2', root);
    const num = (label, key, extra = {}) => field(geo, label, numInput(zone[key] ?? extra.def, (n) => {
      if (extra.min !== undefined && n < extra.min) return;
      editZone(zone.id, (z) => { z[key] = extra.optional && !n ? undefined : n; });
    }, extra.step));
    if (zone.shape === 'rect') {
      num('X', 'x'); num('Y', 'y');
      num('Ancho', 'w', { min: 0.1 }); num('Alto', 'h', { min: 0.1 });
      num('Rotación', 'rotation', { def: 0, optional: true, step: 5 });
      num('Radio esq.', 'rx', { def: 0, optional: true });
    } else if (zone.shape === 'circle') {
      num('Centro X', 'x'); num('Centro Y', 'y');
      num('Radio', 'r', { min: 0.1 });
    } else if (zone.shape === 'polygon') {
      el('p', 'bld-hint', root, `${zone.points.length} vértices — arrastra los puntos en el mapa.`);
    } else {
      el('p', 'bld-hint', root, 'Trazado SVG (path): editable solo a mano en el JSON.');
    }

    el('h3', 'bld-h', root, 'Duplicar');
    el('button', 'bld-btn', root, 'Duplicar (⌘D)').addEventListener('click', () => duplicateSelection(store));
    const arr = el('div', 'bld-grid3', root);
    const count = field(arr, 'Copias', numInput(6, () => {}, 1));
    const dx = field(arr, 'ΔX', numInput(zone.shape === 'circle' ? (zone.r * 2 + 0.5) : ((zone.w ?? 2) + 0.5), () => {}));
    const dy = field(arr, 'ΔY', numInput(0, () => {}));
    el('button', 'bld-btn', root, 'Duplicar en serie').addEventListener('click', () => {
      arrayDuplicate(store, zone, Math.round(parseFloat(count.value)), parseFloat(dx.value) || 0, parseFloat(dy.value) || 0);
    });
    el('button', 'bld-btn bld-danger', root, 'Eliminar').addEventListener('click', () => deleteSelection(store));
  }

  function multiPanel(state, zones) {
    el('h3', 'bld-h', root, `${zones.length} zonas seleccionadas`);
    field(root, 'Tier', selectInput('', [['', '(mantener)'], ...state.doc.tiers.map((t) => [t.id, t.label])],
      (t) => t && store.update(() => zones.forEach((z) => { store.zone(z.id).tier = t; }))));
    field(root, 'Estado', selectInput('', [['', '(mantener)'], ...STATUSES.map((s) => [s, s])],
      (t) => t && store.update(() => zones.forEach((z) => { store.zone(z.id).status = t === 'available' ? undefined : t; }))));

    const applyDeltas = (deltas) => store.update(() => {
      for (const [id, { dx, dy }] of Object.entries(deltas)) store.shiftItem(id, dx, dy);
    });
    const items = () => zones.map((z) => ({ id: z.id, box: canvas.zoneBBox(z) })).filter((i) => i.box);
    el('h3', 'bld-h', root, 'Alinear');
    const alignBox = el('div', 'bld-btnrow', root);
    for (const [mode, label] of [['left', '⊢'], ['hcenter', '⫱'], ['right', '⊣'], ['top', '⊤'], ['vcenter', '⫲'], ['bottom', '⊥']]) {
      const b = el('button', 'bld-btn bld-mini', alignBox, label);
      b.title = `Alinear ${mode}`;
      b.addEventListener('click', () => applyDeltas(alignDeltas(items(), mode)));
    }
    const distBox = el('div', 'bld-btnrow', root);
    el('button', 'bld-btn', distBox, 'Distribuir H').addEventListener('click', () => applyDeltas(distributeDeltas(items(), 'h')));
    el('button', 'bld-btn', distBox, 'Distribuir V').addEventListener('click', () => applyDeltas(distributeDeltas(items(), 'v')));
    el('button', 'bld-btn', root, 'Duplicar (⌘D)').addEventListener('click', () => duplicateSelection(store));
    el('button', 'bld-btn bld-danger', root, 'Eliminar').addEventListener('click', () => deleteSelection(store));
  }

  function render(state) {
    root.replaceChildren();
    const sel = state.selection;
    if (!sel.length) return venuePanel(state);
    if (sel.length === 1 && sel[0].startsWith('label:')) return labelPanel(state, Number(sel[0].slice(6)));
    const zones = store.selectedZones();
    if (zones.length === 1) return zonePanel(state, zones[0]);
    if (zones.length > 1) return multiPanel(state, zones);
    return venuePanel(state);
  }

  return { render };
}
