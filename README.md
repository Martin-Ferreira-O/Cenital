# mapa-discos

Top-down nightclub venue maps: a visual **builder** for drawing a club layout with pricing
tiers, and a standalone, dependency-free **viewer** you embed in a ticketing site.

One plain JSON document (`venue.json`, spec in [`schema.md`](./schema.md)) fully describes a
venue. The builder is a convenience for producing that JSON; the viewer is a renderer for it.
You can hand-write the JSON in any editor and get a working map — the GUI is never required.

## Quickstart

```sh
npm install          # esbuild only (dev tool; the viewer has zero runtime deps)
npm run check        # validate examples + geometry self-checks
npm run build        # bundle the viewer into dist/
npm run serve        # static server on http://127.0.0.1:8123
```

Then open:

| URL | What |
|---|---|
| `/src/builder/index.html` | the builder (add `?ejemplo=club-intimo` to preload an example) |
| `/src/preview.html` | bare viewer (`?venue=../examples/rooftop.json`, `?theme=light`) |
| `/src/demo/index.html` | fake ticketing checkout with a cart driven by viewer events |
| `/scripts/e2e.html`, `/scripts/builder-e2e.html` | behavior self-checks (every line must PASS) |

Native ES modules — any static server works; `file://` does not.

## Embedding the viewer

Copy `dist/venue-map.js` + `dist/venue-map.css` (and your `venue.json`) into any project.
No framework, no dependencies, no network calls at runtime.

```html
<link rel="stylesheet" href="venue-map.css">
<div id="venue-map" style="height: 600px"></div>
<script type="module">
  import { VenueMap } from './venue-map.js';

  const map = new VenueMap('#venue-map', {
    url: './venue.json',     // or data: <inline object>
    interactive: true,
    multiSelect: true,
  });

  map.on('select', ({ zone, tier, selected, selection }) => {
    // drive your cart from here
  });
</script>
```

Give the container a height — the map fills it at any aspect ratio without distorting.

### Options

| option | default | notes |
|---|---|---|
| `data` | — | venue JSON object (validated on load) |
| `url` | — | fetch the venue JSON instead (`map.ready` resolves when loaded) |
| `interactive` | `true` | `false` = static picture: no pan/zoom, hover, focus, or events |
| `selectable` | `true` | allow selecting zones (forced off when not interactive) |
| `multiSelect` | `false` | keep multiple zones selected |
| `showLegend` | `true` | tier legend panel (bottom sheet on ≤640px screens) |
| `showTooltips` | `true` | hover tooltip with label/tier/price/capacity/status |
| `theme` | `'dark'` | `'dark'`, `'light'`, or an object of CSS-var overrides (`{ bg: '#000' }`) |
| `locale` | `'es-CL'` | price formatting locale (currency comes from the data) |
| `floor` | first floor | initial floor id |
| `onSelect` / `onHover` | — | callback shorthands for the events below |

### Events (`map.on(event, fn)`)

- `select` → `{ zone, tier, selected, selection }` — fired on select *and* deselect
- `hover` → `{ zone, tier }`
- `floorchange` → `{ floor }`

### Methods

`ready` (promise) · `on` / `off` · `select(id)` / `deselect(id)` / `getSelection()` ·
`highlightTier(tierId | null)` · `setStatus(id, 'available' | 'limited' | 'soldout' | 'reserved')` ·
`setFloor(id)` · `destroy()`. The module also exports `validate(json)` / `formatErrors(errors)`.

`setStatus('vip-a', 'soldout')` mutes the zone, blocks selection, and — if it was selected —
deselects it and fires `select` with `selected: false`, so a cart stays in sync for free.

### Theming

Everything visual hangs off `--vm-*` custom properties on `.vmap` (`bg`, `floor`, `wall`,
`outline`, `text`, `muted`, `accent`, `focus`, `panel-bg`, `panel-border`, `tooltip-bg`,
`tooltip-text`, `radius`, `soldout-mute`, `font`). Override them from host CSS, per-venue via
`venue.theme` in the JSON, or per-instance via the `theme` option. Tier colors are data, not theme.

## Hand-writing a venue

Read [`schema.md`](./schema.md) — the whole contract fits on one page. Start from the minimal
example there, or crib from [`examples/`](./examples): `club-intimo.json` (small club,
single-floor shorthand), `warehouse.json` (two floors, statuses), `rooftop.json` (VIP-table
density, discount pricing). Load errors are human-readable and name the exact zone and fix.

## Decisions

- **Vanilla JS + native ES modules, no framework.** The builder's complexity is geometry, not
  UI state. The only tool is esbuild, bundling the viewer to one file; the builder runs
  unbundled in the browser. Both share the same core modules (`src/core/`) — the builder canvas
  and the viewer render zones through the exact same code, so "preview" fidelity is structural.
- **Schema deviations from the original sketch** (details in `schema.md`): shape fields are
  flattened onto the zone (no nested `shape: {}` object); currency lives on `venue`, not per
  tier; paint order is fixed by zone type (no z-index); `path` shapes are a viewer-only escape
  hatch (the builder preserves them but only `polygon` is drawable/editable).
- **Tables sell as whole units** — `capacity` is informational. Per-seat selling would be a
  schema v2 concern.
- **Prices format via `Intl.NumberFormat`** — default `es-CL` + CLP (`$ 250.000`), locale
  configurable per instance, currency per venue.
- **Builder cuts, on purpose**: no z-order UI, no magnetic alignment guides (align/distribute
  buttons instead), no group resize/rotate, no polygon midpoint insertion, no modals. Rotated
  rects resize correctly (opposite corner stays pinned) via `core/geometry.js`.

## Layout

```
schema.md                    the venue.json contract
examples/                    three complete venues (also the schema's test fixtures)
dist/                        the embeddable artifact: venue-map.js + venue-map.css
src/core/                    shared: schema validation, geometry, SVG render, panzoom, money
src/viewer/                  VenueMap + legend/tooltip/a11y + venue-map.css
src/builder/                 the editor app
src/demo/                    fake checkout embedding dist/
scripts/check.mjs            node self-check (schema + geometry)
scripts/*-e2e.html           browser behavior checks
```
