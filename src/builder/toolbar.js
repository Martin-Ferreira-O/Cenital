// Top toolbar: tools, floor tabs, grid, undo/redo, file actions, preview toggle.

import { FIXTURES } from '../core/schema.js';

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}

const TOOLS = [
  ['select', 'V', 'Seleccionar (V)'],
  ['rect', 'R', 'Rectángulo (R)'],
  ['circle', 'C', 'Círculo (C)'],
  ['polygon', 'P', 'Polígono (P)'],
  ['label', 'T', 'Texto (T)'],
];

export function createToolbar(root, store, actions) {
  const toolBtns = new Map();

  const left = el('div', 'bld-tb-group', root);
  for (const [name, key, title] of TOOLS) {
    const b = el('button', 'bld-tool', left, key);
    b.title = title;
    b.addEventListener('click', () => store.setUI((s) => { s.tool = name; }));
    toolBtns.set(name, b);
  }
  const fixtureSel = el('select', 'bld-tool bld-fixture-sel', left);
  el('option', null, fixtureSel, 'Fijos…').value = '';
  for (const f of FIXTURES) el('option', null, fixtureSel, f).value = f;
  fixtureSel.title = 'Colocar elemento fijo (barra, DJ, escenario…)';
  fixtureSel.addEventListener('change', () => {
    if (fixtureSel.value) store.setUI((s) => { s.tool = `fixture:${fixtureSel.value}`; });
  });

  const floorsBox = el('div', 'bld-tb-group bld-floors', root);

  const right = el('div', 'bld-tb-group bld-tb-right', root);
  const snapLabel = el('label', 'bld-snap', right);
  const snapCheck = el('input', null, snapLabel);
  snapCheck.type = 'checkbox';
  el('span', null, snapLabel, 'Grilla');
  const gridSize = el('input', 'bld-gridsize', right);
  gridSize.type = 'number';
  gridSize.step = 0.25;
  gridSize.min = 0.1;
  gridSize.title = 'Tamaño de grilla (m)';
  snapCheck.addEventListener('change', () => store.setUI((s) => { s.grid.snap = snapCheck.checked; }));
  gridSize.addEventListener('change', () => {
    const v = parseFloat(gridSize.value);
    if (v > 0) store.setUI((s) => { s.grid.size = v; });
  });

  const undoBtn = el('button', 'bld-tool', right, '↩');
  undoBtn.title = 'Deshacer (⌘Z)';
  undoBtn.addEventListener('click', () => store.undo());
  const redoBtn = el('button', 'bld-tool', right, '↪');
  redoBtn.title = 'Rehacer (⇧⌘Z)';
  redoBtn.addEventListener('click', () => store.redo());

  const exampleSel = el('select', 'bld-tool', right);
  el('option', null, exampleSel, 'Ejemplos…').value = '';
  for (const [v, t] of [['club-intimo', 'Club Íntimo'], ['warehouse', 'Bodega Norte'], ['rooftop', 'Terraza Cielo']]) {
    el('option', null, exampleSel, t).value = v;
  }
  exampleSel.addEventListener('change', () => {
    if (exampleSel.value) actions.loadExample(exampleSel.value);
    exampleSel.value = '';
  });

  const importBtn = el('button', 'bld-tool', right, 'Importar');
  const fileInput = el('input', null, right);
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.hidden = true;
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) actions.importFile(fileInput.files[0]);
    fileInput.value = '';
  });

  el('button', 'bld-tool', right, 'Exportar').addEventListener('click', actions.exportDoc);
  const embedBtn = el('button', 'bld-tool', right, 'Embed');
  embedBtn.title = 'Copiar snippet para embeber';
  embedBtn.addEventListener('click', async () => {
    await actions.copyEmbed();
    const old = embedBtn.textContent;
    embedBtn.textContent = 'Copiado ✓';
    setTimeout(() => { embedBtn.textContent = old; }, 1200);
  });

  const previewBtn = el('button', 'bld-tool bld-preview-btn', right, 'Vista previa');
  previewBtn.addEventListener('click', () => store.setUI((s) => { s.preview = !s.preview; }));

  function sync(state) {
    const toolName = state.tool.split(':')[0];
    for (const [name, b] of toolBtns) b.classList.toggle('active', name === toolName);
    fixtureSel.classList.toggle('active', toolName === 'fixture');
    if (toolName !== 'fixture') fixtureSel.value = '';

    floorsBox.replaceChildren();
    for (const floor of state.doc.floors) {
      const b = el('button', 'bld-floor-tab', floorsBox, floor.label);
      b.classList.toggle('active', floor.id === state.floorId);
      b.addEventListener('click', () => store.setUI((s) => { s.floorId = floor.id; s.selection = []; }));
    }
    const add = el('button', 'bld-floor-tab bld-add-floor', floorsBox, '+');
    add.title = 'Agregar piso';
    add.addEventListener('click', () => {
      let n = state.doc.floors.length + 1;
      while (state.doc.floors.some((f) => f.id === `piso-${n}`)) n += 1;
      store.update((s) => {
        s.doc.floors.push({ id: `piso-${n}`, label: `Piso ${n}`, size: { width: 24, height: 16 }, zones: [], labels: [] });
        s.floorId = `piso-${n}`;
        s.selection = [];
      });
    });

    snapCheck.checked = state.grid.snap;
    if (document.activeElement !== gridSize) gridSize.value = state.grid.size;
    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();
    previewBtn.classList.toggle('active', state.preview);
    previewBtn.textContent = state.preview ? 'Volver a editar' : 'Vista previa';
  }

  return { sync };
}
