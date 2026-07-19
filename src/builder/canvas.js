// Builder stage: grid + floor (rendered EXCLUSIVELY via core/render.js) + overlay layers.
// Owns pointer delegation to the active tool and the transient-drag DOM patches.

import { renderFloor, svgEl } from '../core/render.js';
import { attachPanzoom } from '../core/panzoom.js';
import { bbox, snap } from '../core/geometry.js';

export function createCanvas(rootEl, store) {
  const svg = svgEl('svg', { class: 'vmap-svg bld-svg' }, rootEl);
  const gridG = svgEl('g', { class: 'bld-grid' }, svg);
  let floorG = null;
  const overlayG = svgEl('g', { class: 'bld-overlay' }, svg);
  const handlesG = svgEl('g', { class: 'bld-handles' }, svg);

  let spaceDown = false;
  let tools = null; // set via wire()
  let onViewChange = null;
  let lastFloorId = null;
  let lastGridKey = '';

  const ac = new AbortController();
  const sig = { signal: ac.signal };

  const panzoom = attachPanzoom(svg, {
    signal: ac.signal,
    minScale: 0.5,
    maxScale: 12,
    shouldPan: (e) => e.button === 1 || spaceDown || e.pointerType === 'touch',
    onChange: () => onViewChange?.(),
  });

  function renderGrid(floor, grid) {
    const key = `${floor.id}:${floor.size.width}x${floor.size.height}:${grid.size}:${grid.snap}`;
    if (key === lastGridKey) return;
    lastGridKey = key;
    gridG.replaceChildren();
    if (!grid.snap) return;
    const { width: w, height: h } = floor.size;
    let d = '';
    for (let x = 0; x <= w + 1e-9; x += grid.size) d += `M${x} 0V${h}`;
    for (let y = 0; y <= h + 1e-9; y += grid.size) d += `M0 ${y}H${w}`;
    svgEl('path', { d, class: 'bld-gridlines' }, gridG);
  }

  function render(state) {
    const floor = store.floor();
    renderGrid(floor, state.grid);
    floorG?.remove();
    floorG = renderFloor(floor, { tiersById: new Map(state.doc.tiers.map((t) => [t.id, t])) });
    svg.insertBefore(floorG, overlayG);
    svg.dataset.tool = state.tool.split(':')[0];
    for (const id of state.selection) {
      const el = id.startsWith('label:')
        ? floorG.querySelector(`[data-label-index="${id.slice(6)}"]`)
        : floorG.querySelector(`[data-zone-id="${CSS.escape(id)}"]`);
      el?.classList.add('bld-selected');
    }
    // refit on floor switch AND on size change (an imported doc can reuse the floor id)
    const floorKey = `${state.floorId}:${floor.size.width}x${floor.size.height}`;
    if (floorKey !== lastFloorId) {
      lastFloorId = floorKey;
      panzoom.fit({ x: -1, y: -1, w: floor.size.width + 2, h: floor.size.height + 2 });
    }
  }

  // ---- pointer delegation to the active tool ----

  function toolEvent(e) {
    const [ux, uy] = panzoom.clientToUnits(e.clientX, e.clientY);
    const g = store.state.grid;
    const step = g.snap && !e.shiftKey ? g.size : 0;
    return {
      e,
      pt: [ux, uy],
      snapped: [snap(ux, step), snap(uy, step)],
      step,
      zoneId: e.target.closest?.('[data-zone-id]')?.dataset.zoneId ?? null,
      labelIndex: e.target.closest?.('[data-label-index]')?.dataset.labelIndex ?? null,
      handle: e.target.closest?.('[data-handle]')?.dataset.handle ?? null,
    };
  }

  svg.addEventListener('pointerdown', (e) => {
    if (store.state.preview || e.button === 1 || spaceDown || e.pointerType === 'touch') return;
    if (e.button !== 0) return;
    try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic events have no active pointer */ }
    tools?.current.onDown?.(toolEvent(e));
  }, sig);
  svg.addEventListener('pointermove', (e) => tools?.current.onMove?.(toolEvent(e)), sig);
  svg.addEventListener('pointerup', (e) => tools?.current.onUp?.(toolEvent(e)), sig);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !isTyping(e)) {
      spaceDown = true;
      svg.classList.add('bld-panning');
      e.preventDefault();
    }
  }, sig);
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceDown = false;
      svg.classList.remove('bld-panning');
    }
  }, sig);

  // ---- transient-drag helpers (no store writes; cleared by the next render) ----

  const zoneEl = (id) => floorG?.querySelector(`[data-zone-id="${CSS.escape(id)}"]`);
  const labelEl = (i) => floorG?.querySelector(`[data-label-index="${i}"]`);

  function moveTransient(sel, dx, dy) {
    for (const id of sel) {
      const el = id.startsWith('label:') ? labelEl(id.slice(6)) : zoneEl(id);
      el?.setAttribute('transform', `translate(${dx} ${dy})`);
    }
  }

  /** Re-apply a working-copy zone's geometry onto its existing shape element. */
  function patchShape(zone) {
    const shape = zoneEl(zone.id)?.querySelector('.vm-shape');
    if (!shape) return;
    if (zone.shape === 'rect') {
      shape.setAttribute('x', zone.x);
      shape.setAttribute('y', zone.y);
      shape.setAttribute('width', zone.w);
      shape.setAttribute('height', zone.h);
      const rot = zone.rotation
        ? `rotate(${zone.rotation} ${zone.x + zone.w / 2} ${zone.y + zone.h / 2})` : null;
      rot ? shape.setAttribute('transform', rot) : shape.removeAttribute('transform');
    } else if (zone.shape === 'circle') {
      shape.setAttribute('cx', zone.x);
      shape.setAttribute('cy', zone.y);
      shape.setAttribute('r', zone.r);
    } else if (zone.shape === 'polygon') {
      shape.setAttribute('points', zone.points.map((p) => p.join(',')).join(' '));
    }
  }

  /** Zone bbox in floor units; falls back to DOM getBBox for path zones. */
  function zoneBBox(zone) {
    return bbox(zone) ?? zoneEl(zone.id)?.querySelector('.vm-shape')?.getBBox() ?? null;
  }

  return {
    svg,
    overlayG,
    handlesG,
    panzoom,
    render,
    moveTransient,
    patchShape,
    zoneBBox,
    zoneEl,
    wire(t, viewChangeCb) { tools = t; onViewChange = viewChangeCb; },
    destroy() { ac.abort(); },
  };
}

function isTyping(e) {
  return /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
}
export { isTyping };
