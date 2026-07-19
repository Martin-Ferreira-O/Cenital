// Pure geometry helpers shared by viewer and builder. All coordinates in venue units.

const rad = (deg) => (deg * Math.PI) / 180;

/** Rotate point (px,py) around (cx,cy) by deg clockwise (SVG rotation direction). */
export function rotatePoint(px, py, cx, cy, deg) {
  const a = rad(deg);
  const dx = px - cx, dy = py - cy;
  return [
    cx + dx * Math.cos(a) - dy * Math.sin(a),
    cy + dx * Math.sin(a) + dy * Math.cos(a),
  ];
}

/** Center of a zone's shape. Path zones have no cheap center (use DOM getBBox in the browser). */
export function center(zone) {
  switch (zone.shape) {
    case 'rect': return [zone.x + zone.w / 2, zone.y + zone.h / 2];
    case 'circle': return [zone.x, zone.y];
    case 'polygon': {
      const b = bbox(zone);
      return [b.x + b.w / 2, b.y + b.h / 2];
    }
    default: return null;
  }
}

/** Rotated rect corners in world units, order: nw, ne, se, sw. */
export function rectCorners(zone) {
  const { x, y, w, h, rotation = 0 } = zone;
  const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  if (!rotation) return pts;
  const [cx, cy] = [x + w / 2, y + h / 2];
  return pts.map(([px, py]) => rotatePoint(px, py, cx, cy, rotation));
}

/**
 * Axis-aligned bounding box {x,y,w,h}, rotation included. Returns null for path zones —
 * callers in the browser fall back to element.getBBox().
 */
export function bbox(zone) {
  switch (zone.shape) {
    case 'rect': {
      if (!zone.rotation) return { x: zone.x, y: zone.y, w: zone.w, h: zone.h };
      return pointsBBox(rectCorners(zone));
    }
    case 'circle':
      return { x: zone.x - zone.r, y: zone.y - zone.r, w: zone.r * 2, h: zone.r * 2 };
    case 'polygon':
      return pointsBBox(zone.points);
    default:
      return null;
  }
}

function pointsBBox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export const snap = (v, step) => (step > 0 ? Math.round(v / step) * step : v);

export const round2 = (v) => Math.round(v * 100) / 100;

/** Translate a zone in place (path zones are immovable — see schema.md). */
export function shiftZone(zone, dx, dy) {
  if (zone.shape === 'rect' || zone.shape === 'circle') {
    zone.x = round2(zone.x + dx);
    zone.y = round2(zone.y + dy);
  } else if (zone.shape === 'polygon') {
    zone.points = zone.points.map(([x, y]) => [round2(x + dx), round2(y + dy)]);
  }
}

export function boxesIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Resize a (possibly rotated) rect by dragging one corner to a new world position,
 * keeping the opposite corner fixed. corner: 0=nw 1=ne 2=se 3=sw.
 * Trick: the new center is the midpoint of (fixed corner, pointer); width/height come
 * from the pointer→fixed-corner diagonal expressed in the rect's local frame.
 */
export function resizeRotatedRect(zone, corner, px, py, minSize = 0.1) {
  const rotation = zone.rotation || 0;
  const opp = rectCorners(zone)[(corner + 2) % 4];
  const mx = (opp[0] + px) / 2, my = (opp[1] + py) / 2;
  const [lx, ly] = rotatePoint(px - opp[0], py - opp[1], 0, 0, -rotation);
  const w = Math.max(Math.abs(lx), minSize);
  const h = Math.max(Math.abs(ly), minSize);
  return { ...zone, x: mx - w / 2, y: my - h / 2, w, h };
}

/**
 * Align a set of {id, box} bboxes. mode: left|hcenter|right|top|vcenter|bottom.
 * Returns { [id]: {dx, dy} } deltas relative to the selection's own bounding box.
 */
export function alignDeltas(items, mode) {
  const sel = pointsBBox(items.flatMap(({ box }) => [[box.x, box.y], [box.x + box.w, box.y + box.h]]));
  const deltas = {};
  for (const { id, box } of items) {
    let dx = 0, dy = 0;
    if (mode === 'left') dx = sel.x - box.x;
    if (mode === 'hcenter') dx = sel.x + sel.w / 2 - (box.x + box.w / 2);
    if (mode === 'right') dx = sel.x + sel.w - (box.x + box.w);
    if (mode === 'top') dy = sel.y - box.y;
    if (mode === 'vcenter') dy = sel.y + sel.h / 2 - (box.y + box.h / 2);
    if (mode === 'bottom') dy = sel.y + sel.h - (box.y + box.h);
    deltas[id] = { dx, dy };
  }
  return deltas;
}

/**
 * Distribute {id, box} bboxes with equal gaps along axis 'h' or 'v'.
 * First and last (by position) stay put. Needs >= 3 items to do anything.
 */
export function distributeDeltas(items, axis) {
  const deltas = Object.fromEntries(items.map(({ id }) => [id, { dx: 0, dy: 0 }]));
  if (items.length < 3) return deltas;
  const [pos, dim, d] = axis === 'h' ? ['x', 'w', 'dx'] : ['y', 'h', 'dy'];
  const sorted = [...items].sort((a, b) => a.box[pos] - b.box[pos]);
  const first = sorted[0].box, last = sorted[sorted.length - 1].box;
  const span = last[pos] + last[dim] - first[pos];
  const sum = sorted.reduce((acc, { box }) => acc + box[dim], 0);
  const gap = (span - sum) / (sorted.length - 1);
  let cursor = first[pos];
  for (const { id, box } of sorted) {
    deltas[id][d] = cursor - box[pos];
    cursor += box[dim] + gap;
  }
  return deltas;
}
