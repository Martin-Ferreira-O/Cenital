// Selection outlines + resize/rotate/vertex handles, drawn in user units but sized
// in screen pixels (divided by the current zoom scale). Handle drags patch a working
// copy of the zone via canvas.patchShape() and commit once at endDrag.

import { svgEl } from '../core/render.js';
import { rectCorners, resizeRotatedRect, rotatePoint, snap, round2 } from '../core/geometry.js';

export function createHandles({ store, canvas }) {
  let drag = null; // { zone: workingCopy, kind, args }

  const px = (n) => n / canvas.panzoom.scale();

  function drawZone(zone) {
    const g = canvas.handlesG;
    const hs = px(8); // handle square size
    const sq = (x, y, handle) => svgEl('rect', {
      class: 'bld-handle',
      x: x - hs / 2, y: y - hs / 2, width: hs, height: hs,
      'data-handle': handle,
    }, g);

    if (zone.shape === 'rect') {
      const corners = rectCorners(zone);
      svgEl('polygon', {
        class: 'bld-outline',
        points: corners.map((p) => p.join(',')).join(' '),
      }, g);
      corners.forEach((c, i) => sq(c[0], c[1], `resize:${i}`));
      const cx = zone.x + zone.w / 2, cy = zone.y + zone.h / 2;
      const [rx, ry] = rotatePoint(cx, zone.y - px(20), cx, cy, zone.rotation || 0);
      const [tx, ty] = rotatePoint(cx, zone.y, cx, cy, zone.rotation || 0);
      svgEl('line', { class: 'bld-outline', x1: tx, y1: ty, x2: rx, y2: ry }, g);
      svgEl('circle', { class: 'bld-handle', cx: rx, cy: ry, r: px(5), 'data-handle': 'rotate' }, g);
    } else if (zone.shape === 'circle') {
      svgEl('circle', { class: 'bld-outline', cx: zone.x, cy: zone.y, r: zone.r }, g);
      sq(zone.x + zone.r, zone.y, 'radius');
    } else if (zone.shape === 'polygon') {
      svgEl('polygon', {
        class: 'bld-outline',
        points: zone.points.map((p) => p.join(',')).join(' '),
      }, g);
      zone.points.forEach((p, i) => sq(p[0], p[1], `vertex:${i}`));
    } else {
      const b = canvas.zoneBBox(zone);
      if (b) svgEl('rect', { class: 'bld-outline bld-dashed', x: b.x, y: b.y, width: b.w, height: b.h }, g);
    }
  }

  function refresh() {
    canvas.handlesG.replaceChildren();
    const state = store.state;
    if (state.preview) return;
    const zones = drag ? [drag.zone] : store.selectedZones();
    if (!drag && zones.length > 1) {
      const boxes = zones.map((z) => canvas.zoneBBox(z)).filter(Boolean);
      if (!boxes.length) return;
      const x1 = Math.min(...boxes.map((b) => b.x));
      const y1 = Math.min(...boxes.map((b) => b.y));
      const x2 = Math.max(...boxes.map((b) => b.x + b.w));
      const y2 = Math.max(...boxes.map((b) => b.y + b.h));
      svgEl('rect', {
        class: 'bld-outline bld-dashed', x: x1, y: y1, width: x2 - x1, height: y2 - y1,
      }, canvas.handlesG);
      return;
    }
    if (zones.length === 1) drawZone(zones[0]);
  }

  return {
    refresh,

    startDrag(ev) {
      const zone = store.selectedZones()[0];
      if (!zone) return;
      drag = { zone: structuredClone(zone), original: structuredClone(zone), kind: ev.handle };
    },

    moveDrag(ev) {
      if (!drag) return;
      const z = drag.zone;
      const [sx, sy] = ev.snapped;
      const [kind, arg] = drag.kind.split(':');
      if (kind === 'resize') {
        Object.assign(z, resizeRotatedRect(drag.original, Number(arg), sx, sy));
      } else if (kind === 'rotate') {
        const cx = drag.original.x + drag.original.w / 2;
        const cy = drag.original.y + drag.original.h / 2;
        let deg = (Math.atan2(ev.pt[1] - cy, ev.pt[0] - cx) * 180) / Math.PI + 90;
        if (store.state.grid.snap && !ev.e.shiftKey) deg = snap(deg, 15);
        z.rotation = ((Math.round(deg) % 360) + 360) % 360;
      } else if (kind === 'radius') {
        z.r = Math.max(round2(Math.hypot(ev.snapped[0] - z.x, ev.snapped[1] - z.y)), 0.1);
      } else if (kind === 'vertex') {
        z.points[Number(arg)] = [sx, sy];
      }
      canvas.patchShape(z);
      refresh();
    },

    endDrag() {
      if (!drag) return;
      const working = drag.zone;
      drag = null;
      for (const k of ['x', 'y', 'w', 'h', 'r', 'rotation']) {
        if (typeof working[k] === 'number') working[k] = round2(working[k]);
      }
      if (working.rotation === 0) delete working.rotation;
      store.update(() => {
        const zones = store.floor().zones;
        const i = zones.findIndex((zz) => zz.id === working.id);
        if (i >= 0) zones[i] = working;
      });
    },
  };
}
