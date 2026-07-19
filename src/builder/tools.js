// Tool state machine. Each tool is a plain object receiving pointer events from the
// canvas with coordinates already converted to (snapped) venue units.

import { svgEl } from '../core/render.js';
import { snap, boxesIntersect } from '../core/geometry.js';

export const FIXTURE_PRESETS = {
  bar: { w: 6, h: 1.2, label: 'Barra' },
  dj: { w: 3, h: 2, label: 'DJ' },
  stage: { w: 8, h: 3, label: 'Escenario' },
  restroom: { w: 3, h: 2.5, label: 'Baños' },
  entrance: { w: 3, h: 1, label: 'Entrada' },
  stairs: { w: 3, h: 4, label: 'Escaleras' },
  pillar: { circle: true, r: 0.4 },
};

const boxFrom = (a, b) => ({
  x: Math.min(a[0], b[0]),
  y: Math.min(a[1], b[1]),
  w: Math.abs(a[0] - b[0]),
  h: Math.abs(a[1] - b[1]),
});

export function createTools({ store, canvas, handles }) {
  let ghostEl = null;
  const ghost = (el) => {
    ghostEl?.remove();
    ghostEl = el;
    if (el) canvas.overlayG.appendChild(el);
  };
  const pxToUnits = (px) => px / canvas.panzoom.scale();

  const movable = (ids) => ids.filter((id) => id.startsWith('label:') || store.zone(id)?.shape !== 'path');

  const select = {
    drag: null,
    onDown(ev) {
      if (ev.handle) { this.drag = { mode: 'handle' }; handles.startDrag(ev); return; }
      const sel = store.state.selection;
      if (ev.zoneId) {
        let ids = sel;
        if (ev.e.shiftKey) {
          ids = sel.includes(ev.zoneId)
            ? sel.filter((i) => i !== ev.zoneId)
            : [...sel.filter((i) => !i.startsWith('label:')), ev.zoneId];
          store.setUI((s) => { s.selection = ids; });
          if (!ids.includes(ev.zoneId)) return;
        } else if (!sel.includes(ev.zoneId)) {
          ids = [ev.zoneId];
          store.setUI((s) => { s.selection = ids; });
        }
        this.drag = { mode: 'move', start: ev.pt, ids: movable(ids), moved: false };
      } else if (ev.labelIndex != null) {
        const id = `label:${ev.labelIndex}`;
        store.setUI((s) => { s.selection = [id]; });
        this.drag = { mode: 'move', start: ev.pt, ids: [id], moved: false };
      } else {
        if (!ev.e.shiftKey) store.setUI((s) => { s.selection = []; });
        this.drag = { mode: 'marquee', start: ev.pt, moved: false };
      }
    },
    onMove(ev) {
      const d = this.drag;
      if (!d) return;
      if (d.mode === 'handle') { handles.moveDrag(ev); return; }
      const dx = ev.pt[0] - d.start[0], dy = ev.pt[1] - d.start[1];
      if (!d.moved && Math.hypot(dx, dy) < pxToUnits(4)) return;
      d.moved = true;
      if (d.mode === 'move') {
        d.dx = snap(dx, ev.step);
        d.dy = snap(dy, ev.step);
        canvas.moveTransient(d.ids, d.dx, d.dy);
      } else {
        d.box = boxFrom(d.start, ev.pt);
        ghost(svgEl('rect', {
          class: 'bld-marquee', x: d.box.x, y: d.box.y, width: d.box.w, height: d.box.h,
        }));
      }
    },
    onUp(ev) {
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      if (d.mode === 'handle') { handles.endDrag(ev); return; }
      if (d.mode === 'move' && d.moved) {
        const { dx = 0, dy = 0 } = d;
        if (dx || dy) store.update(() => { for (const id of d.ids) store.shiftItem(id, dx, dy); });
        else store.setUI(() => {}); // re-render to clear transient transforms
      } else if (d.mode === 'marquee' && d.moved) {
        ghost(null);
        const ids = store.floor().zones
          .filter((z) => { const b = canvas.zoneBBox(z); return b && boxesIntersect(b, d.box); })
          .map((z) => z.id);
        store.setUI((s) => {
          s.selection = ev.e.shiftKey ? [...new Set([...s.selection, ...ids])] : ids;
        });
      } else {
        ghost(null);
      }
    },
    onKey(key) {
      if (key === 'Escape') store.setUI((s) => { s.selection = []; });
    },
  };

  const makeDragShape = (build, minSize = 0.3) => ({
    drag: null,
    onDown(ev) { this.drag = { a: ev.snapped }; },
    onMove(ev) {
      if (!this.drag) return;
      ghost(build.ghost(this.drag.a, ev.snapped));
    },
    onUp(ev) {
      const d = this.drag;
      this.drag = null;
      ghost(null);
      if (!d) return;
      const zone = build.zone(d.a, ev.snapped, minSize);
      if (!zone) return;
      const id = store.nextId('zona');
      store.update((s) => {
        store.floor().zones.push({ id, ...zone });
        s.selection = [id];
        s.tool = 'select';
      });
    },
    onKey(key) {
      if (key === 'Escape') { this.drag = null; ghost(null); store.setUI((s) => { s.tool = 'select'; }); }
    },
  });

  const rect = makeDragShape({
    ghost: (a, b) => {
      const box = boxFrom(a, b);
      return svgEl('rect', { class: 'bld-ghost', x: box.x, y: box.y, width: box.w, height: box.h });
    },
    zone: (a, b, min) => {
      const box = boxFrom(a, b);
      if (box.w < min || box.h < min) return null;
      return { type: 'area', shape: 'rect', x: box.x, y: box.y, w: box.w, h: box.h };
    },
  });

  const circle = makeDragShape({
    ghost: (a, b) => svgEl('circle', {
      class: 'bld-ghost', cx: a[0], cy: a[1], r: Math.hypot(b[0] - a[0], b[1] - a[1]),
    }),
    zone: (a, b, min) => {
      const r = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (r < min) return null;
      return { type: 'area', shape: 'circle', x: a[0], y: a[1], r: Math.round(r * 100) / 100 };
    },
  });

  const polygon = {
    pts: [],
    onDown(ev) {
      const p = ev.snapped;
      if (this.pts.length >= 3 && Math.hypot(p[0] - this.pts[0][0], p[1] - this.pts[0][1]) < 0.35) {
        return this.commit();
      }
      this.pts.push(p);
      this.draw(p);
    },
    onMove(ev) { if (this.pts.length) this.draw(ev.snapped); },
    draw(cursor) {
      const g = svgEl('g', {});
      svgEl('polyline', {
        class: 'bld-ghost',
        points: [...this.pts, cursor].map((p) => p.join(',')).join(' '),
      }, g);
      svgEl('circle', { class: 'bld-vertex-first', cx: this.pts[0][0], cy: this.pts[0][1], r: 0.18 }, g);
      ghost(g);
    },
    commit() {
      const pts = this.pts;
      this.pts = [];
      ghost(null);
      if (pts.length < 3) { store.setUI((s) => { s.tool = 'select'; }); return; }
      const id = store.nextId('zona');
      store.update((s) => {
        store.floor().zones.push({ id, type: 'area', shape: 'polygon', points: pts });
        s.selection = [id];
        s.tool = 'select';
      });
    },
    onKey(key) {
      if (key === 'Enter') this.commit();
      if (key === 'Escape') { this.pts = []; ghost(null); store.setUI((s) => { s.tool = 'select'; }); }
    },
  };

  const fixture = {
    onDown(ev) {
      const kind = store.state.tool.split(':')[1];
      const p = FIXTURE_PRESETS[kind];
      if (!p) return;
      const [x, y] = ev.snapped;
      const id = store.nextId(kind);
      const zone = p.circle
        ? { id, type: 'fixture', fixture: kind, shape: 'circle', x, y, r: p.r }
        : {
          id, label: p.label, type: 'fixture', fixture: kind, shape: 'rect',
          x: x - p.w / 2, y: y - p.h / 2, w: p.w, h: p.h,
        };
      store.update((s) => { store.floor().zones.push(zone); s.selection = [id]; });
    },
    onKey(key) {
      if (key === 'Escape') store.setUI((s) => { s.tool = 'select'; });
    },
  };

  const label = {
    onDown(ev) {
      const [ux, uy] = ev.snapped;
      const input = document.createElement('input');
      input.className = 'bld-label-input';
      input.placeholder = 'TEXTO';
      input.style.left = `${ev.e.clientX}px`;
      input.style.top = `${ev.e.clientY}px`;
      document.body.appendChild(input);
      setTimeout(() => input.focus(), 0);
      const done = (commit) => {
        const text = input.value.trim();
        input.remove();
        if (commit && text) {
          store.update((s) => {
            store.floor().labels ??= [];
            store.floor().labels.push({ text, x: ux, y: uy });
            s.tool = 'select';
          });
        } else {
          store.setUI((s) => { s.tool = 'select'; });
        }
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') done(true);
        if (e.key === 'Escape') done(false);
        e.stopPropagation();
      });
      input.addEventListener('blur', () => done(true));
    },
  };

  const byName = { select, rect, circle, polygon, fixture, label };

  return {
    get current() { return byName[store.state.tool.split(':')[0]] ?? select; },
    onKey(key) { this.current.onKey?.(key); },
  };
}
