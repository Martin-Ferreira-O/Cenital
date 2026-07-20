// Right panel: step tabs + task overview / zone / multi-select / label panels.
// Wholesale re-render on every state change; fields commit on 'change' (blur/enter)
// so each edit is exactly one undo entry.

import { ZONE_TYPES, STATUSES, FIXTURES } from '../core/schema.js';
import { formatMoney, finalPrice } from '../core/money.js';
import { alignDeltas, distributeDeltas, round2 } from '../core/geometry.js';
import { ALIGN_ICONS } from './icons.js';

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

/** Sellable zones (tables) still missing a tier — surfaced in step 2 and the tab dot. */
export function untieredZones(doc) {
  return doc.floors.flatMap((f) => f.zones).filter((z) => z.type === 'table' && !z.tier);
}

const STATUS_LABELS = { available: 'Disponible', limited: 'Pocas', soldout: 'Agotado', reserved: 'Reservado' };

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

/** X / AN style prefixed number box. */
function numBox(parent, prefix, value, onCommit, step = 0.1) {
  const wrap = el('div', 'bld-numbox', parent);
  el('span', null, wrap, prefix);
  const i = numInput(value, onCommit, step);
  wrap.appendChild(i);
  return i;
}

// ---- step tabs ----

export function createSteps(root, store) {
  function render(state) {
    root.replaceChildren();
    const zones = state.doc.floors.flatMap((f) => f.zones);
    const showingTiers = state.panel === 'tiers' && !state.selection.length;

    const tab = (labelHtml, current, onClick) => {
      const b = el('button', 'bld-step-tab', root);
      b.classList.toggle('current', current);
      b.innerHTML = `<span>${labelHtml}</span><span class="bld-step-bar"></span>`;
      b.addEventListener('click', onClick);
      return b;
    };
    tab(zones.length ? '✓ Dibuja' : '1 Dibuja', !showingTiers,
      () => store.setUI((s) => { s.panel = 'draw'; s.selection = []; }));
    const dot = untieredZones(state.doc).length ? '<span class="bld-warn-dot"></span>' : '';
    tab(`2 Precios${dot}`, showingTiers,
      () => store.setUI((s) => { s.panel = 'tiers'; s.selection = []; }));
    tab('3 Publica', false, () => store.setUI((s) => { s.preview = true; }));
  }
  return { render };
}

// ---- panels ----

export function createInspector(root, store, canvas, actions) {
  const editZone = (id, fn) => store.update(() => { const z = store.zone(id); if (z) fn(z); });
  const deselect = () => store.setUI((s) => { s.selection = []; });
  const tierById = (state, id) => state.doc.tiers.find((t) => t.id === id);

  function tasksPanel(state) {
    const zones = state.doc.floors.flatMap((f) => f.zones);
    const floor = store.floor();

    // 1 — Dibuja
    const s1 = el('div', 'bld-sect', root);
    const h1 = el('div', 'bld-task-head', s1);
    el('div', 'bld-step-n gold', h1, zones.length ? '✓' : '1');
    el('span', 'bld-h', h1, 'Dibuja');
    el('span', 'bld-task-count', h1, zones.length === 1 ? '1 zona' : `${zones.length} zonas`);
    el('div', 'bld-task-text', s1, zones.length
      ? 'Clic en una zona para editarla · arrastra para mover · ⇧ clic suma a la selección.'
      : 'Elige una herramienta en el riel y arrastra sobre el lienzo. Después suma barras, mesas y cabinas desde Fijos.');

    // 2 — Precios
    const s2 = el('div', 'bld-sect', root);
    const h2 = el('div', 'bld-task-head', s2);
    el('div', 'bld-step-n', h2, '2');
    el('span', 'bld-h pending', h2, 'Precios');
    const addTier = el('button', 'bld-mini-gold', h2, '+ Tier');
    addTier.addEventListener('click', () => store.setUI((s) => { s.panel = 'tiers'; s.selection = []; }));
    if (!state.doc.tiers.length) {
      const box = el('div', 'bld-empty-tiers', s2);
      el('b', null, box, 'Aún no hay tiers');
      el('span', null, box, 'Crea «General» con un precio y asígnalo a tus zonas.');
    } else {
      for (const tier of state.doc.tiers) {
        const line = el('div', 'bld-tier-line', s2);
        el('span', 'bld-swatch', line).style.background = tier.color;
        el('span', 'bld-tier-line-name', line, tier.label);
        el('span', 'bld-tier-line-price', line, formatMoney(finalPrice(tier), state.doc.venue.currency));
        line.addEventListener('click', () => store.setUI((s) => { s.panel = 'tiers'; s.selection = []; }));
      }
      const missing = untieredZones(state.doc);
      if (missing.length) {
        el('div', 'bld-tier-warn-line', s2,
          `● ${missing.length === 1 ? '1 zona sin tier' : `${missing.length} zonas sin tier`} — revísalas`);
      }
    }

    // 3 — Publica
    const s3 = el('div', 'bld-sect', root);
    const h3 = el('div', 'bld-task-head', s3);
    el('div', 'bld-step-n', h3, '3');
    el('span', 'bld-h pending', h3, 'Publica');
    const col = el('div', 'bld-col', s3);
    const pub = (label, onClick) => {
      const b = el('button', 'bld-btn', col, label);
      b.disabled = !zones.length;
      b.addEventListener('click', onClick);
      return b;
    };
    pub('▶ Vista previa', () => store.setUI((s) => { s.preview = true; }));
    pub('Exportar venue.json', actions.exportDoc);
    const embedBtn = pub('Copiar código de embed', async () => {
      await actions.copyEmbed();
      embedBtn.textContent = 'Copiado ✓';
      setTimeout(() => { embedBtn.textContent = 'Copiar código de embed'; }, 1200);
    });
    if (!zones.length) el('div', 'bld-pub-note', col, 'Se habilitan cuando tengas al menos una zona.');

    // venue / floor settings
    const sSet = el('div', 'bld-sect', root);
    const det = el('details', 'bld-settings', sSet);
    el('summary', null, det, `Ajustes del piso — ${floor.label}`);
    const setCol = el('div', 'bld-col', det);
    field(setCol, 'Nombre del piso', textInput(floor.label, (t) => t && store.update(() => { floor.label = t; })));
    const dims = el('div', 'bld-grid2', setCol);
    field(dims, 'Ancho (m)', numInput(floor.size.width, (n) => n > 0 && store.update(() => { floor.size.width = n; })));
    field(dims, 'Alto (m)', numInput(floor.size.height, (n) => n > 0 && store.update(() => { floor.size.height = n; })));
    field(setCol, 'Moneda', textInput(state.doc.venue.currency ?? 'CLP',
      (t) => t && store.update(() => { state.doc.venue.currency = t.toUpperCase(); })));
    if (state.doc.floors.length > 1) {
      const del = el('button', 'bld-btn bld-btn-danger', setCol, 'Eliminar este piso');
      del.addEventListener('click', () => {
        if (!confirm(`¿Eliminar "${floor.label}" y sus ${floor.zones.length} zonas?`)) return;
        store.update((s) => {
          s.doc.floors = s.doc.floors.filter((f) => f.id !== floor.id);
          s.selection = [];
        });
      });
    }

    // footer
    const foot = el('div', 'bld-panel-foot', root);
    el('span', null, foot, 'Guardado automático ✓');
    const imp = el('button', 'bld-link', foot, 'Importar JSON');
    imp.addEventListener('click', actions.importPrompt);
  }

  function labelPanel(state, idx) {
    const floor = store.floor();
    const l = floor.labels?.[idx];
    if (!l) return;
    const head = el('div', 'bld-panel-head', root);
    el('span', 'bld-panel-title', head, l.text);
    el('span', 'bld-type-chip', head, 'Texto');
    el('button', 'bld-close', head, '×').addEventListener('click', deselect);

    const body = el('div', 'bld-sect bld-col', root);
    const edit = (fn) => store.update(() => fn(l));
    field(body, 'Texto', textInput(l.text, (t) => t && edit(() => { l.text = t; })));
    const grid = el('div', 'bld-grid2', body);
    field(grid, 'X', numInput(l.x, (n) => edit(() => { l.x = n; })));
    field(grid, 'Y', numInput(l.y, (n) => edit(() => { l.y = n; })));
    field(grid, 'Tamaño', numInput(l.size ?? 0.6, (n) => n > 0 && edit(() => { l.size = n; })));
    field(grid, 'Rotación', numInput(l.rotation ?? 0, (n) => edit(() => { l.rotation = n || undefined; }), 5));

    const danger = el('div', 'bld-danger-row', root);
    el('button', 'bld-danger-link', danger, 'Eliminar texto').addEventListener('click', () => deleteSelection(store));
    el('span', 'bld-kbd-dim', danger, 'Supr');
  }

  function zonePanel(state, zone) {
    const tier = tierById(state, zone.tier);

    const head = el('div', 'bld-panel-head', root);
    const sw = el('span', 'bld-swatch', head);
    if (tier) sw.style.background = tier.color;
    el('span', 'bld-panel-title', head, zone.label || zone.id);
    el('span', 'bld-type-chip', head,
      { area: 'Área', table: 'Mesa', fixture: 'Fijo', wall: 'Muro' }[zone.type] ?? zone.type);
    el('button', 'bld-close', head, '×').addEventListener('click', deselect);

    // identity + selling
    const sell = el('div', 'bld-sect bld-col', root);
    field(sell, 'Etiqueta', textInput(zone.label, (t) => editZone(zone.id, (z) => { z.label = t || undefined; })));
    const row = el('div', 'bld-grid-tier', sell);
    const tierWrap = el('label', 'bld-field', row);
    el('span', 'bld-field-label', tierWrap, 'Tier · precio');
    const tierBox = el('div', 'bld-numbox', tierWrap);
    const tierSw = el('span', 'bld-swatch', tierBox);
    if (tier) tierSw.style.background = tier.color;
    tierBox.appendChild(selectInput(zone.tier ?? '', [
      ['', '(sin tier)'],
      ...state.doc.tiers.map((t) => [t.id, `${t.label} · ${formatMoney(finalPrice(t), state.doc.venue.currency)}`]),
    ], (t) => editZone(zone.id, (z) => { z.tier = t || undefined; })));
    field(row, 'Capacidad', numInput(zone.capacity, (n) => editZone(zone.id, (z) => { z.capacity = n > 0 ? Math.round(n) : undefined; }), 1));

    const stWrap = el('label', 'bld-field', sell);
    el('span', 'bld-field-label', stWrap, 'Estado');
    const seg = el('div', 'bld-seg', stWrap);
    for (const st of STATUSES) {
      const b = el('button', null, seg, STATUS_LABELS[st]);
      b.dataset.status = st;
      b.classList.toggle('active', (zone.status ?? 'available') === st);
      b.addEventListener('click', () => editZone(zone.id, (z) => { z.status = st === 'available' ? undefined : st; }));
    }

    // geometry
    const geoSect = el('div', 'bld-sect', root);
    el('div', 'bld-h', geoSect, 'Posición y tamaño');
    if (zone.shape === 'rect') {
      const g = el('div', 'bld-grid2', geoSect);
      numBox(g, 'X', zone.x, (n) => editZone(zone.id, (z) => { z.x = n; }));
      numBox(g, 'Y', zone.y, (n) => editZone(zone.id, (z) => { z.y = n; }));
      numBox(g, 'AN', zone.w, (n) => n >= 0.1 && editZone(zone.id, (z) => { z.w = n; }));
      numBox(g, 'AL', zone.h, (n) => n >= 0.1 && editZone(zone.id, (z) => { z.h = n; }));
    } else if (zone.shape === 'circle') {
      const g = el('div', 'bld-grid2', geoSect);
      numBox(g, 'X', zone.x, (n) => editZone(zone.id, (z) => { z.x = n; }));
      numBox(g, 'Y', zone.y, (n) => editZone(zone.id, (z) => { z.y = n; }));
      numBox(g, 'R', zone.r, (n) => n >= 0.1 && editZone(zone.id, (z) => { z.r = n; }));
    } else if (zone.shape === 'polygon') {
      el('p', 'bld-hint', geoSect, `${zone.points.length} vértices — arrastra los puntos en el mapa.`);
    } else {
      el('p', 'bld-hint', geoSect, 'Trazado SVG (path): editable solo a mano en el JSON.');
    }

    const adv = el('details', 'bld-adv', geoSect);
    const sum = el('summary', null, adv);
    el('span', 'bld-adv-title', sum, 'Avanzado');
    el('span', 'bld-adv-sub', sum, 'tipo · rotación · ID · interactividad');
    const advGrid = el('div', 'bld-grid2', adv);
    field(advGrid, 'Tipo', selectInput(zone.type, ZONE_TYPES.map((t) => [t, t]),
      (t) => editZone(zone.id, (z) => { z.type = t; })));
    if (zone.type === 'fixture') {
      field(advGrid, 'Ícono', selectInput(zone.fixture ?? '', [['', '(ninguno)'], ...FIXTURES.map((f) => [f, f])],
        (f) => editZone(zone.id, (z) => { z.fixture = f || undefined; })));
    }
    if (zone.shape === 'rect') {
      field(advGrid, 'Rotación', numInput(zone.rotation ?? 0,
        (n) => editZone(zone.id, (z) => { z.rotation = n || undefined; }), 5));
      field(advGrid, 'Radio esq.', numInput(zone.rx ?? 0,
        (n) => n >= 0 && editZone(zone.id, (z) => { z.rx = n || undefined; })));
    }
    field(advGrid, 'ID técnico', textInput(zone.id, (t) => {
      if (!t || t === zone.id) return;
      if (store.zoneIds().has(t)) { render(store.state); return; }
      store.update((s) => {
        zone.id = t;
        s.selection = [t];
      });
    }));
    field(advGrid, 'Interactiva', selectInput(
      zone.interactive === undefined ? 'auto' : String(zone.interactive),
      [['auto', 'auto (según tier)'], ['true', 'sí'], ['false', 'no']],
      (v) => editZone(zone.id, (z) => { z.interactive = v === 'auto' ? undefined : v === 'true'; }),
    ));

    // duplicate
    const dup = el('div', 'bld-sect', root);
    const dupBtn = el('button', 'bld-btn', dup);
    dupBtn.style.width = '100%';
    dupBtn.innerHTML = '⧉ Duplicar <kbd>⌘D</kbd>';
    dupBtn.addEventListener('click', () => duplicateSelection(store));
    if (zone.shape !== 'path') {
      const arr = el('div', 'bld-array-row', dup);
      const count = field(arr, 'Copias', numInput(6, () => {}, 1));
      const dx = field(arr, 'ΔX (m)', numInput(zone.shape === 'circle' ? (zone.r * 2 + 0.5) : ((zone.w ?? 2) + 0.5), () => {}));
      const dy = field(arr, 'ΔY (m)', numInput(0, () => {}));
      el('button', 'bld-btn-gold', arr, 'Crear').addEventListener('click', () => {
        arrayDuplicate(store, zone, Math.round(parseFloat(count.value)), parseFloat(dx.value) || 0, parseFloat(dy.value) || 0);
      });
    }

    const danger = el('div', 'bld-danger-row', root);
    el('button', 'bld-danger-link', danger, 'Eliminar zona').addEventListener('click', () => deleteSelection(store));
    el('span', 'bld-kbd-dim', danger, 'Supr');
  }

  function multiPanel(state, zones) {
    const head = el('div', 'bld-panel-head', root);
    el('span', 'bld-panel-title', head, `${zones.length} zonas seleccionadas`);
    el('button', 'bld-close', head, '×').addEventListener('click', deselect);

    const body = el('div', 'bld-sect bld-col', root);
    const grid = el('div', 'bld-grid2', body);
    field(grid, 'Asignar tier', selectInput('', [['', '(mantener)'], ...state.doc.tiers.map((t) => [t.id, t.label])],
      (t) => t && store.update(() => zones.forEach((z) => { store.zone(z.id).tier = t; }))));
    field(grid, 'Estado', selectInput('', [['', '(mantener)'], ...STATUSES.map((s) => [s, STATUS_LABELS[s]])],
      (t) => t && store.update(() => zones.forEach((z) => { store.zone(z.id).status = t === 'available' ? undefined : t; }))));

    const applyDeltas = (deltas) => store.update(() => {
      for (const [id, { dx, dy }] of Object.entries(deltas)) store.shiftItem(id, dx, dy);
    });
    const items = () => zones.map((z) => ({ id: z.id, box: canvas.zoneBBox(z) })).filter((i) => i.box);

    const alignSect = el('div', 'bld-sect bld-col', root);
    el('div', 'bld-h', alignSect, 'Alinear');
    const alignBox = el('div', 'bld-align-grid', alignSect);
    const TITLES = {
      left: 'Alinear a la izquierda', hcenter: 'Centrar horizontal', right: 'Alinear a la derecha',
      top: 'Alinear arriba', vcenter: 'Centrar vertical', bottom: 'Alinear abajo',
    };
    for (const mode of ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom']) {
      const b = el('button', null, alignBox);
      b.title = TITLES[mode];
      b.innerHTML = ALIGN_ICONS[mode];
      b.addEventListener('click', () => applyDeltas(alignDeltas(items(), mode)));
    }
    const distBox = el('div', 'bld-btnrow', alignSect);
    el('button', 'bld-btn', distBox, '↔ Distribuir H').addEventListener('click', () => applyDeltas(distributeDeltas(items(), 'h')));
    el('button', 'bld-btn', distBox, '↕ Distribuir V').addEventListener('click', () => applyDeltas(distributeDeltas(items(), 'v')));

    const actionsSect = el('div', 'bld-sect', root);
    const rowB = el('div', 'bld-btnrow', actionsSect);
    el('button', 'bld-btn', rowB, '⧉ Duplicar').addEventListener('click', () => duplicateSelection(store));
    el('button', 'bld-btn bld-btn-danger', rowB, 'Eliminar').addEventListener('click', () => deleteSelection(store));

    const hint = el('div', 'bld-sect', root);
    el('p', 'bld-hint', hint, '⇧ clic en el mapa suma zonas a la selección. Tier y estado se aplican a todas de una vez.');
  }

  function render(state) {
    root.replaceChildren();
    const sel = state.selection;
    if (!sel.length) return tasksPanel(state);
    if (sel.length === 1 && sel[0].startsWith('label:')) return labelPanel(state, Number(sel[0].slice(6)));
    const zones = store.selectedZones();
    if (zones.length === 1) return zonePanel(state, zones[0]);
    if (zones.length > 1) return multiPanel(state, zones);
    return tasksPanel(state);
  }

  return { render };
}
