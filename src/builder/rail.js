// Left tool rail: drawing tools (icon + name + shortcut), fixture presets, grid toggle.

import { TOOL_ICONS, FIXTURE_ICONS } from './icons.js';

const TOOLS = [
  ['select', 'Selección', 'V'],
  ['rect', 'Rectáng.', 'R'],
  ['circle', 'Círculo', 'C'],
  ['polygon', 'Polígono', 'P'],
  ['label', 'Texto', 'T'],
];

const FIXTURES = [
  ['bar', 'Barra'],
  ['dj', 'DJ'],
  ['stage', 'Escenario'],
  ['restroom', 'Baños'],
  ['entrance', 'Entrada'],
  ['stairs', 'Escaleras'],
  ['pillar', 'Pilar'],
];

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}

export function createRail(root, store) {
  const toolBtns = new Map();
  for (const [name, label, key] of TOOLS) {
    const b = el('button', 'bld-rail-tool', root);
    b.title = `${label} (${key})`;
    b.innerHTML = `${TOOL_ICONS[name]}<span>${label} <kbd>${key}</kbd></span>`;
    b.addEventListener('click', () => store.setUI((s) => { s.tool = name; }));
    toolBtns.set(name, b);
  }

  el('div', 'bld-rail-div', root);
  el('div', 'bld-rail-head', root, 'FIJOS');
  const fixGrid = el('div', 'bld-rail-fixtures', root);
  const fixBtns = new Map();
  for (const [kind, label] of FIXTURES) {
    const b = el('button', 'bld-rail-fixture', fixGrid);
    b.title = `Colocar ${label.toLowerCase()}`;
    b.innerHTML = `${FIXTURE_ICONS[kind]}<span>${label}</span>`;
    b.addEventListener('click', () => store.setUI((s) => { s.tool = `fixture:${kind}`; }));
    fixBtns.set(kind, b);
  }

  const gridBox = el('div', 'bld-rail-grid', root);
  el('span', 'bld-rail-head', gridBox, 'GRILLA');
  const toggle = el('button', 'bld-switch', gridBox);
  toggle.title = 'Ajustar a la grilla';
  toggle.addEventListener('click', () => store.setUI((s) => { s.grid.snap = !s.grid.snap; }));
  const sizeInput = el('input', 'bld-gridsize', gridBox);
  sizeInput.type = 'number';
  sizeInput.step = 0.25;
  sizeInput.min = 0.1;
  sizeInput.title = 'Tamaño de grilla (m)';
  sizeInput.addEventListener('change', () => {
    const v = parseFloat(sizeInput.value);
    if (v > 0) store.setUI((s) => { s.grid.size = v; });
  });

  function sync(state) {
    const [toolName, fixtureKind] = state.tool.split(':');
    for (const [name, b] of toolBtns) b.classList.toggle('active', name === toolName);
    for (const [kind, b] of fixBtns) b.classList.toggle('active', toolName === 'fixture' && kind === fixtureKind);
    toggle.classList.toggle('on', state.grid.snap);
    if (document.activeElement !== sizeInput) sizeInput.value = state.grid.size;
  }

  return { sync };
}
