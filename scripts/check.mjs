// Self-check for the schema contract and geometry math. Run: npm run check
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { validate, formatErrors } from '../src/core/schema.js';
import { resizeRotatedRect, rectCorners, bbox, alignDeltas, distributeDeltas, snap } from '../src/core/geometry.js';

const examplesDir = new URL('../examples/', import.meta.url);

// 1. Every shipped example must validate.
for (const file of readdirSync(examplesDir).filter((f) => f.endsWith('.json'))) {
  const json = JSON.parse(readFileSync(new URL(file, examplesDir), 'utf8'));
  const result = validate(json);
  assert.ok(result.ok, `${file} failed validation:\n${formatErrors(result.errors)}`);
  assert.ok(result.venue.floors.length >= 1, `${file}: normalization produced no floors`);
}

// 2. Broken documents must produce the documented human-readable errors.
const base = JSON.parse(readFileSync(new URL('club-intimo.json', examplesDir), 'utf8'));
const expectError = (mutate, substring) => {
  const doc = structuredClone(base);
  mutate(doc);
  const { ok, errors } = validate(doc);
  assert.ok(!ok, `expected validation failure containing "${substring}"`);
  const text = formatErrors(errors);
  assert.ok(text.includes(substring), `expected error containing "${substring}", got:\n${text}`);
};

expectError((d) => { d.zones[0].tier = 'gold'; }, 'tier "gold" not found (available: general, booth, vip)');
expectError((d) => { d.zones[1].id = 'dancefloor'; }, 'duplicate zone id "dancefloor"');
expectError((d) => { d.zones.push({ id: 'p', type: 'area', shape: 'polygon', points: [[0, 0], [1, 1]] }); },
  'polygon needs at least 3 points, got 2');
expectError((d) => { d.floors = [{ id: 'x', label: 'X', size: { width: 1, height: 1 }, zones: [] }]; },
  'not both');
expectError((d) => { d.zones[0].status = 'gone'; }, 'unknown status "gone"');
expectError((d) => { d.zones[0].shape = 'blob'; }, 'unknown shape "blob"');
expectError((d) => { d.schemaVersion = '2.0'; }, 'unsupported schemaVersion');
expectError((d) => { d.tiers.push({ ...d.tiers[0] }); }, 'duplicate tier id "general"');

// 3. Geometry: resizing a rotated rect keeps the opposite corner fixed.
const close = (a, b) => Math.abs(a - b) < 1e-9;
{
  const r0 = { shape: 'rect', x: 0, y: 0, w: 4, h: 2, rotation: 0 };
  const r1 = resizeRotatedRect(r0, 2, 6, 4); // drag SE corner to (6,4)
  assert.ok(close(r1.x, 0) && close(r1.y, 0) && close(r1.w, 6) && close(r1.h, 4), JSON.stringify(r1));
}
{
  const r0 = { shape: 'rect', x: 2, y: 1, w: 4, h: 2, rotation: 37 };
  const fixedBefore = rectCorners(r0)[0]; // resize via SE corner -> NW stays fixed
  const r1 = resizeRotatedRect(r0, 2, 9, 6);
  const fixedAfter = rectCorners(r1)[0];
  assert.ok(close(fixedBefore[0], fixedAfter[0]) && close(fixedBefore[1], fixedAfter[1]),
    `opposite corner moved: ${fixedBefore} -> ${fixedAfter}`);
  const dragged = rectCorners(r1)[2];
  assert.ok(close(dragged[0], 9) && close(dragged[1], 6), `dragged corner not at pointer: ${dragged}`);
}

// 4. Geometry: bbox of a rotated rect contains all corners.
{
  const r = { shape: 'rect', x: 0, y: 0, w: 4, h: 2, rotation: 90 };
  const b = bbox(r);
  assert.ok(close(b.w, 2) && close(b.h, 4), `rotated bbox wrong: ${JSON.stringify(b)}`);
}

// 5. Align/distribute.
{
  const items = [
    { id: 'a', box: { x: 0, y: 0, w: 2, h: 2 } },
    { id: 'b', box: { x: 5, y: 3, w: 2, h: 2 } },
    { id: 'c', box: { x: 11, y: 6, w: 2, h: 2 } },
  ];
  const left = alignDeltas(items, 'left');
  assert.ok(close(left.b.dx, -5) && close(left.c.dx, -11), JSON.stringify(left));
  const dist = distributeDeltas(items, 'h');
  assert.ok(close(dist.a.dx, 0) && close(dist.c.dx, 0), 'ends must not move');
  assert.ok(close(dist.b.dx, 0.5), `middle should center: ${JSON.stringify(dist.b)}`); // gaps: (13-6)/2=3.5 -> b.x=5.5
}

assert.equal(snap(3.26, 0.5), 3.5);
assert.equal(snap(3.26, 0), 3.26);

console.log('all checks passed');
