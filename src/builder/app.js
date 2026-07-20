// Builder bootstrap: wiring, import/export/embed, autosave, live preview.

import { validate, formatErrors } from '../core/schema.js';
import { round2 } from '../core/geometry.js';
import { createStore, loadAutosave, blankDoc } from './store.js';
import { createCanvas } from './canvas.js';
import { createHandles } from './handles.js';
import { createTools } from './tools.js';
import { createInspector, createSteps } from './inspector.js';
import { createTiersPanel } from './tiers.js';
import { createToolbar } from './toolbar.js';
import { createRail } from './rail.js';
import { attachShortcuts } from './shortcuts.js';
import { VenueMap } from '../viewer/index.js';

const store = createStore(loadAutosave() ?? blankDoc());
const canvas = createCanvas(document.getElementById('canvas'), store);
const handles = createHandles({ store, canvas });
const tools = createTools({ store, canvas, handles });
canvas.wire(tools, () => handles.refresh());

// ---- error banner (no modals) ----
const banner = document.getElementById('banner');
let bannerTimer;
function showError(text) {
  banner.textContent = text;
  banner.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { banner.hidden = true; }, 10000);
}
banner.addEventListener('click', () => { banner.hidden = true; });

// ---- import / export / embed ----

/** Export copy: numbers rounded so hand-editing the JSON stays pleasant. */
function cleanDoc(doc) {
  const out = structuredClone(doc);
  for (const floor of out.floors) {
    for (const z of floor.zones) {
      for (const k of ['x', 'y', 'w', 'h', 'r', 'rotation', 'rx']) {
        if (typeof z[k] === 'number') z[k] = round2(z[k]);
      }
      if (z.points) z.points = z.points.map(([x, y]) => [round2(x), round2(y)]);
    }
    for (const l of floor.labels ?? []) {
      l.x = round2(l.x);
      l.y = round2(l.y);
    }
  }
  return out;
}

function adoptJson(json, sourceName) {
  const result = validate(json);
  if (!result.ok) {
    showError(`${sourceName}: venue.json inválido\n${formatErrors(result.errors)}`);
    return;
  }
  store.update((s) => {
    s.doc = structuredClone(result.venue);
    s.floorId = s.doc.floors[0].id;
    s.selection = [];
  });
}

const EMBED_SNIPPET = `<link rel="stylesheet" href="venue-map.css">
<div id="venue-map" style="height: 600px"></div>
<script type="module">
  import { VenueMap } from './venue-map.js';
  const map = new VenueMap('#venue-map', { url: './venue.json' });
  map.on('select', ({ zone, tier, selected }) => {
    // conectar con tu carrito
  });
</script>`;

const hiddenFile = document.createElement('input');
hiddenFile.type = 'file';
hiddenFile.accept = '.json,application/json';
hiddenFile.addEventListener('change', () => {
  if (hiddenFile.files[0]) actions.importFile(hiddenFile.files[0]);
  hiddenFile.value = '';
});

const actions = {
  async loadExample(name) {
    try {
      const res = await fetch(`../../examples/${name}.json`);
      adoptJson(await res.json(), name);
    } catch (err) {
      showError(`No se pudo cargar el ejemplo: ${err.message}`);
    }
  },
  async importFile(file) {
    try {
      adoptJson(JSON.parse(await file.text()), file.name);
    } catch (err) {
      showError(`${file.name}: JSON inválido — ${err.message}`);
    }
  },
  importPrompt: () => hiddenFile.click(),
  exportDoc() {
    const blob = new Blob([JSON.stringify(cleanDoc(store.doc), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'venue.json';
    a.click();
    URL.revokeObjectURL(a.href);
  },
  copyEmbed: () => navigator.clipboard.writeText(EMBED_SNIPPET),
};

const toolbar = createToolbar(document.getElementById('header'), store, actions);
const rail = createRail(document.getElementById('rail'), store);
const steps = createSteps(document.getElementById('steps'), store);
const inspectorEl = document.getElementById('inspector');
const tiersEl = document.getElementById('tiers');
const inspector = createInspector(inspectorEl, store, canvas, actions);
const tiersPanel = createTiersPanel(tiersEl, store);

// ---- status bar ----
const statusL = document.getElementById('status-l');
const statusR = document.getElementById('status-r');
const TOOL_HINTS = {
  select: 'V selección · R rectángulo · C círculo · P polígono · T texto · espacio + arrastrar = pan',
  rect: 'Arrastra para dibujar un rectángulo · Esc cancela',
  circle: 'Arrastra desde el centro hacia afuera · Esc cancela',
  polygon: 'Clic para agregar vértices · clic en el primero o Enter cierra · Esc cancela',
  label: 'Clic donde quieras colocar el texto',
  fixture: 'Clic para colocar el elemento · Esc vuelve a selección',
};
function syncStatus(state) {
  const floor = store.floor();
  statusL.textContent = state.preview ? '' : (TOOL_HINTS[state.tool.split(':')[0]] ?? '');
  const n = floor.zones.length;
  statusR.textContent = `${n === 1 ? '1 zona' : `${n} zonas`} · ${floor.size.width} × ${floor.size.height} m`;
}

// ---- empty-state onboarding card ----
const emptyCard = document.getElementById('empty-card');
let onboardingDismissed = false;
emptyCard.innerHTML = `
<div class="bld-empty-card">
  <div class="bld-empty-title">Dibuja el mapa de tu club</div>
  <div class="bld-empty-sub">Tres pasos y tu venue queda listo para vender entradas.</div>
  <div class="bld-empty-steps">
    <div class="bld-empty-step"><div class="bld-step-n gold">1</div>
      <div><h4>Dibuja la pista con <span class="gold-word">Rectángulo</span> <span class="bld-kbd">R</span></h4>
      <p>Después suma barras, mesas y cabinas desde el riel.</p></div></div>
    <div class="bld-empty-step"><div class="bld-step-n">2</div>
      <div><h4>Crea tus tiers y asigna precios</h4>
      <p>Cada zona apunta a un tier: General, VIP, lo que quieras.</p></div></div>
    <div class="bld-empty-step"><div class="bld-step-n">3</div>
      <div><h4>Previsualiza y expórtalo a tu sitio</h4>
      <p>Un venue.json + dos líneas de código y está embebido.</p></div></div>
  </div>
  <div class="bld-empty-actions">
    <button class="bld-gold-btn" data-act="draw">Dibujar mi primera zona</button>
    <button class="bld-hdr-btn" data-act="example">Partir de un ejemplo</button>
    <button class="bld-link" data-act="import">Importar JSON</button>
  </div>
</div>`;
emptyCard.addEventListener('click', (e) => {
  const act = e.target.dataset?.act;
  if (!act) return;
  onboardingDismissed = true;
  if (act === 'draw') store.setUI((s) => { s.tool = 'rect'; });
  else if (act === 'example') { actions.loadExample('rooftop'); store.setUI(() => {}); }
  else if (act === 'import') { actions.importPrompt(); store.setUI(() => {}); }
});
function syncEmptyCard(state) {
  const hasContent = state.doc.floors.some((f) => f.zones.length || f.labels?.length);
  emptyCard.hidden = hasContent || onboardingDismissed || state.preview;
}

// ---- live preview: mounts the real viewer on the current doc ----
const previewEl = document.getElementById('preview');
let previewMap = null;
let previewedJson = '';
function syncPreview(state) {
  document.body.classList.toggle('previewing', state.preview);
  if (state.preview) {
    // remount when the doc changed so side-panel edits show live
    const json = JSON.stringify(state.doc);
    if (previewMap && json === previewedJson) return;
    previewMap?.destroy();
    previewedJson = json;
    previewMap = new VenueMap(previewEl, { data: structuredClone(cleanDoc(state.doc)) });
  } else if (previewMap) {
    previewMap.destroy();
    previewMap = null;
    previewedJson = '';
  }
}

store.subscribe((state) => {
  canvas.render(state);
  handles.refresh();
  toolbar.sync(state);
  rail.sync(state);
  steps.render(state);
  const showTiers = state.panel === 'tiers' && !state.selection.length;
  inspectorEl.hidden = showTiers;
  tiersEl.hidden = !showTiers;
  if (showTiers) tiersPanel.render(state);
  else inspector.render(state);
  syncStatus(state);
  syncEmptyCard(state);
  syncPreview(state);
});

attachShortcuts({ store, tools, signal: new AbortController().signal });
store.setUI(() => {}); // first render
window.cenital = { store, actions }; // console/debug handle

// deep-link an example: builder/index.html?ejemplo=club-intimo
const ejemplo = new URLSearchParams(location.search).get('ejemplo');
if (ejemplo) actions.loadExample(ejemplo);
