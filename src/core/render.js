// Floor -> SVG. The ONLY code that emits zone markup: the builder layers grid/handles
// on top of this output and the viewer adds interaction — neither may fork zone rendering,
// or builder-preview fidelity dies. All visual states are driven by CSS via data-* attrs
// and the per-zone --tier custom property.

import { zoneLabel, zoneStatus, zoneInteractive } from './schema.js';
import { bbox } from './geometry.js';
import { GLYPHS } from './glyphs.js';

const NS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

const TYPE_ORDER = { wall: 0, area: 1, table: 2, fixture: 3 };

/** viewBox string framing a floor with breathing room. */
export function floorViewBox(floor, pad = 1) {
  return `${-pad} ${-pad} ${floor.size.width + pad * 2} ${floor.size.height + pad * 2}`;
}

function shapeEl(zone) {
  switch (zone.shape) {
    case 'rect': {
      const attrs = { x: zone.x, y: zone.y, width: zone.w, height: zone.h };
      if (zone.rx) attrs.rx = zone.rx;
      if (zone.rotation) {
        attrs.transform = `rotate(${zone.rotation} ${zone.x + zone.w / 2} ${zone.y + zone.h / 2})`;
      }
      return svgEl('rect', attrs);
    }
    case 'circle':
      return svgEl('circle', { cx: zone.x, cy: zone.y, r: zone.r });
    case 'polygon':
      return svgEl('polygon', { points: zone.points.map((p) => p.join(',')).join(' ') });
    case 'path':
      return svgEl('path', { d: zone.d });
  }
}

function glyphEl(zone, b, dy = 0) {
  const glyph = GLYPHS[zone.fixture];
  if (!glyph || !b) return null;
  const size = Math.min(Math.min(b.w, b.h) * 0.6, 1.6);
  if (size < 0.45) return null; // too small to read; the shape + tooltip carry it
  const g = svgEl('g', {
    class: 'vm-glyph',
    transform: `translate(${b.x + (b.w - size) / 2} ${b.y + (b.h - size) / 2 + dy}) scale(${size})`,
  });
  if (glyph.text) {
    const t = svgEl('text', { x: 0.5, y: 0.5, 'font-size': 0.42, 'dominant-baseline': 'central' }, g);
    t.textContent = glyph.text;
  } else {
    svgEl('path', { d: glyph.d, 'stroke-width': 0.07 }, g);
  }
  g.dataset.size = size;
  return g;
}

/** Fixture content: glyph, plus an explicit label beneath it on landscape zones. */
function fixtureContent(zone, g) {
  const b = bbox(zone);
  const glyph = glyphEl(zone, b);
  if (!glyph) {
    const label = zoneLabelEl(zone);
    if (label) g.appendChild(label);
    return;
  }
  const size = Number(glyph.dataset.size);
  const fs = Math.min(0.32, (b.w * 0.6) / Math.max(1, (zone.label || '').length) / 0.78);
  const wantsLabel = zone.label && b.w >= b.h && fs >= 0.2 && b.h > size + fs * 2.2;
  if (wantsLabel) {
    const block = size + 0.12 + fs;
    glyph.setAttribute('transform',
      `translate(${b.x + (b.w - size) / 2} ${b.y + (b.h - block) / 2}) scale(${size})`);
    const t = svgEl('text', {
      class: 'vm-zone-label',
      x: b.x + b.w / 2,
      y: b.y + (b.h - block) / 2 + size + 0.12 + fs / 2,
      'font-size': fs.toFixed(3),
      'dominant-baseline': 'central',
    });
    t.textContent = zone.label;
    g.appendChild(glyph);
    g.appendChild(t);
  } else {
    g.appendChild(glyph);
  }
}

/** Uppercase label centered on the zone, sized to fit; null when it can't fit legibly. */
function zoneLabelEl(zone) {
  const label = zoneLabel(zone);
  const b = bbox(zone);
  if (!b) return null;
  let fs = Math.min(0.42, b.h * 0.32);
  const estWidth = (n) => label.length * n * 0.78; // uppercase + tracking estimate
  if (estWidth(fs) > b.w * 0.92) fs = (b.w * 0.92) / (label.length * 0.78);
  if (fs < 0.22) return null;
  const t = svgEl('text', {
    class: 'vm-zone-label',
    x: b.x + b.w / 2,
    y: b.y + b.h / 2,
    'font-size': fs.toFixed(3),
    'dominant-baseline': 'central',
  });
  t.textContent = label;
  return t;
}

/**
 * @param {object} zone
 * @param {object} opts
 *   tiersById: Map of tier id -> tier (for --tier color)
 *   aria: (zone) => string — when set and the zone is interactive, the group becomes
 *         a focusable button (viewer passes this; the builder does not)
 */
export function renderZone(zone, { tiersById, aria } = {}) {
  const status = zoneStatus(zone);
  const g = svgEl('g', {
    class: 'vm-zone',
    'data-zone-id': zone.id,
    'data-type': zone.type,
    'data-status': status,
  });
  if (zone.fixture) g.setAttribute('data-fixture', zone.fixture);
  const tier = tiersById?.get(zone.tier);
  if (tier) {
    g.setAttribute('data-tier', tier.id);
    g.style.setProperty('--tier', tier.color);
  }
  if (zoneInteractive(zone)) {
    g.setAttribute('data-interactive', '');
    if (aria) {
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', aria(zone));
      // soldout/reserved are pointer-blocked in CSS; keep keyboard consistent
      if (status !== 'soldout' && status !== 'reserved') g.setAttribute('tabindex', '0');
    }
  }
  const shape = shapeEl(zone);
  if (!shape) return g; // unknown shape: validated out earlier, render nothing
  shape.classList.add('vm-shape');
  g.appendChild(shape);
  if (zone.type === 'fixture') fixtureContent(zone, g);
  if (zone.type === 'table') {
    const label = zoneLabelEl(zone);
    if (label) g.appendChild(label);
  }
  return g;
}

let poolUid = 0;

/** Render one floor (slab + zones in fixed paint order + free labels) as a <g>. */
export function renderFloor(floor, opts = {}) {
  const g = svgEl('g', { class: 'vm-floor' });
  const { width: w, height: h } = floor.size;
  svgEl('rect', { class: 'vm-slab', x: 0, y: 0, width: w, height: h, rx: 0.4 }, g);
  // Signature: a faint warm light pool on the slab, as if spilled from above the floor.
  const gid = `vm-pool-${poolUid++}`;
  const defs = svgEl('defs', {}, g);
  const grad = svgEl('radialGradient', { id: gid }, defs);
  svgEl('stop', { class: 'vm-pool-stop', offset: '0', 'stop-color': '#ffedc2', 'stop-opacity': 0.05 }, grad);
  svgEl('stop', { offset: '1', 'stop-color': '#ffedc2', 'stop-opacity': 0 }, grad);
  svgEl('ellipse', {
    class: 'vm-pool',
    cx: w / 2, cy: h * 0.45, rx: w * 0.42, ry: h * 0.4,
    fill: `url(#${gid})`,
  }, g);
  const zones = [...floor.zones].sort(
    (a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9),
  );
  for (const zone of zones) g.appendChild(renderZone(zone, opts));
  (floor.labels || []).forEach((l, i) => {
    const t = svgEl('text', {
      class: 'vm-label',
      x: l.x, y: l.y,
      'font-size': l.size ?? 0.6,
      'dominant-baseline': 'central',
      'data-label-index': i,
      transform: l.rotation ? `rotate(${l.rotation} ${l.x} ${l.y})` : undefined,
    }, g);
    t.textContent = l.text;
  });
  return g;
}
