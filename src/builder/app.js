// Builder bootstrap: wiring, import/export/embed, autosave, live preview.

import { validate, formatErrors } from '../core/schema.js';
import { round2 } from '../core/geometry.js';
import { createStore, loadAutosave, blankDoc } from './store.js';
import { createCanvas } from './canvas.js';
import { createHandles } from './handles.js';
import { createTools } from './tools.js';
import { createInspector } from './inspector.js';
import { createTiersPanel } from './tiers.js';
import { createToolbar } from './toolbar.js';
import { attachShortcuts } from './shortcuts.js';
import { VenueMap } from '../viewer/index.js';

const store = createStore(loadAutosave() ?? blankDoc());
const canvas = createCanvas(document.getElementById('canvas'), store);
const handles = createHandles({ store, canvas });
const tools = createTools({ store, canvas, handles });
canvas.wire(tools, () => handles.refresh());
const inspector = createInspector(document.getElementById('inspector'), store, canvas);
const tiersPanel = createTiersPanel(document.getElementById('tiers'), store);

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

const toolbar = createToolbar(document.getElementById('toolbar'), store, actions);

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
  inspector.render(state);
  tiersPanel.render(state);
  syncPreview(state);
});

attachShortcuts({ store, tools, signal: new AbortController().signal });
store.setUI(() => {}); // first render

// deep-link an example: builder/index.html?ejemplo=club-intimo
const ejemplo = new URLSearchParams(location.search).get('ejemplo');
if (ejemplo) actions.loadExample(ejemplo);
