// viewBox-based pan/zoom for the map SVG. Shared by viewer and builder.
// Mobile Safari notes (all three are required together):
//   - the SVG needs `touch-action: none` in CSS or pointermove gets hijacked for scroll
//   - iOS fires proprietary gesture* events alongside pointer events; preventDefault
//     them or the page zooms behind the map
//   - wheel must be registered { passive: false }; trackpad pinch arrives as wheel+ctrlKey
// Client->unit conversion is done manually from viewBox + getBoundingClientRect
// (getScreenCTM breaks under CSS transforms on ancestors, e.g. an animated modal).

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param {SVGSVGElement} svg
 * @param {object} opts
 *   minScale/maxScale: zoom relative to the fitted view (default 1..8)
 *   shouldPan(e): predicate deciding if a pointerdown may start a pan (default: always)
 *   onChange(api): called after every viewBox change (builder redraws handles here)
 *   signal: AbortSignal that tears down all listeners
 */
export function attachPanzoom(svg, opts = {}) {
  const { minScale = 1, maxScale = 8, shouldPan = () => true, onChange, signal } = opts;
  let base = null; // fitted viewBox {x,y,w,h}
  let vb = null;   // current viewBox
  let dragged = false;
  let panStart = null;
  const pointers = new Map(); // pointerId -> [clientX, clientY]
  let prevPinch = null;       // { d, mx, my }

  const apply = () => {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    onChange?.(api);
  };

  // meet-scaling geometry: scale + letterbox offsets of units within the client rect
  const rectInfo = () => {
    const r = svg.getBoundingClientRect();
    const s = Math.min(r.width / vb.w, r.height / vb.h);
    return { s, ox: r.left + (r.width - vb.w * s) / 2, oy: r.top + (r.height - vb.h * s) / 2 };
  };

  const clientToUnits = (cx, cy) => {
    const { s, ox, oy } = rectInfo();
    return [(cx - ox) / s + vb.x, (cy - oy) / s + vb.y];
  };

  const clampPan = () => {
    const cx = clamp(vb.x + vb.w / 2, base.x, base.x + base.w);
    const cy = clamp(vb.y + vb.h / 2, base.y, base.y + base.h);
    vb.x = cx - vb.w / 2;
    vb.y = cy - vb.h / 2;
  };

  const zoomAt = (cx, cy, factor) => {
    const target = clamp((base.w / vb.w) * factor, minScale, maxScale);
    const f = target / (base.w / vb.w);
    if (f === 1) return;
    const [ux, uy] = clientToUnits(cx, cy);
    vb = {
      w: vb.w / f,
      h: vb.h / f,
      x: ux - (ux - vb.x) / f,
      y: uy - (uy - vb.y) / f,
    };
    clampPan();
    apply();
  };

  const sig = { signal };
  const sigCapture = { signal, capture: true };

  svg.addEventListener('wheel', (e) => {
    if (!vb) return;
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)));
  }, { signal, passive: false });

  svg.addEventListener('pointerdown', (e) => {
    if (!vb || e.button !== 0 && e.pointerType === 'mouse') return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    // new gesture: clear any stale drag flag — touch pans/pinches never fire the
    // click that would otherwise reset it, and a stale flag swallows the next tap
    if (pointers.size === 1) dragged = false;
    try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic events have no active pointer */ }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      prevPinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
      panStart = null;
    } else if (pointers.size === 1 && shouldPan(e)) {
      panStart = { x: e.clientX, y: e.clientY, vb: { ...vb } };
    }
  }, sig);

  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2 && prevPinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (prevPinch.d > 0 && d > 0) zoomAt(mx, my, d / prevPinch.d);
      const { s } = rectInfo();
      vb.x -= (mx - prevPinch.mx) / s;
      vb.y -= (my - prevPinch.my) / s;
      clampPan();
      apply();
      prevPinch = { d, mx, my };
      dragged = true;
    } else if (panStart) {
      const dx = e.clientX - panStart.x, dy = e.clientY - panStart.y;
      if (!dragged && Math.hypot(dx, dy) < 4) return;
      dragged = true;
      const { s } = rectInfo();
      vb.x = panStart.vb.x - dx / s;
      vb.y = panStart.vb.y - dy / s;
      clampPan();
      apply();
    }
  }, sig);

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) prevPinch = null;
    if (pointers.size === 0) panStart = null;
  };
  svg.addEventListener('pointerup', endPointer, sig);
  svg.addEventListener('pointercancel', endPointer, sig);

  // a pan must not end as a click on whatever zone the pointer stopped over
  svg.addEventListener('click', (e) => {
    if (dragged) {
      e.stopPropagation();
      dragged = false;
    }
  }, sigCapture);

  svg.addEventListener('dblclick', () => { if (base) api.fit(base); }, sig);

  // iOS Safari page-zoom suppression
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    svg.addEventListener(type, (e) => e.preventDefault(), sig);
  }

  const api = {
    /** Set (and reset to) the fitted view. */
    fit(rect) {
      base = { ...rect };
      vb = { ...rect };
      apply();
    },
    clientToUnits,
    viewBox: () => ({ ...vb }),
    /** px per venue unit at the current zoom. */
    scale: () => rectInfo().s,
    zoomAt,
    isDragging: () => dragged,
  };
  return api;
}
