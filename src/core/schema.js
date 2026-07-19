// venue.json normalization + validation. The single source of truth for the schema —
// used by the viewer on load, the builder on import, and scripts/check.mjs.
// validate() never throws; it returns { ok, venue, errors: [{ path, message }] }.

export const ZONE_TYPES = ['area', 'table', 'fixture', 'wall'];
export const SHAPES = ['rect', 'circle', 'polygon', 'path'];
export const STATUSES = ['available', 'limited', 'soldout', 'reserved'];
export const FIXTURES = ['bar', 'dj', 'stage', 'restroom', 'entrance', 'stairs', 'pillar'];
export const SCHEMA_VERSION = '1.0';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;

/** Default label: "vip-a" -> "Vip A". */
export function zoneLabel(zone) {
  if (zone.label) return zone.label;
  return String(zone.id)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function zoneStatus(zone) {
  return zone.status || 'available';
}

/** Interactive by default only when the zone is sellable (has a tier). */
export function zoneInteractive(zone) {
  return zone.interactive !== undefined ? !!zone.interactive : zone.tier !== undefined;
}

/**
 * Structural normalization: returns { schemaVersion, venue, tiers, floors } with the
 * single-floor shorthand lifted into a one-element floors array. Does not validate.
 */
export function normalize(json) {
  const venue = isObj(json.venue) ? json.venue : {};
  let floors = json.floors;
  if (!Array.isArray(floors)) {
    floors = [{
      id: 'main',
      label: venue.name || 'Main',
      size: json.size,
      zones: json.zones || [],
      labels: json.labels || [],
    }];
  }
  return {
    schemaVersion: json.schemaVersion,
    venue,
    tiers: Array.isArray(json.tiers) ? json.tiers : [],
    floors,
  };
}

function validateShape(zone, path, errors) {
  const err = (message) => errors.push({ path, message });
  const needNums = (fields) => {
    for (const f of fields) if (!isNum(zone[f])) err(`shape "${zone.shape}" needs numeric "${f}"`);
  };
  switch (zone.shape) {
    case 'rect':
      needNums(['x', 'y', 'w', 'h']);
      if (isNum(zone.w) && zone.w <= 0) err(`rect "w" must be > 0, got ${zone.w}`);
      if (isNum(zone.h) && zone.h <= 0) err(`rect "h" must be > 0, got ${zone.h}`);
      if (zone.rotation !== undefined && !isNum(zone.rotation)) err('"rotation" must be a number (degrees)');
      if (zone.rx !== undefined && (!isNum(zone.rx) || zone.rx < 0)) err('"rx" must be a number >= 0');
      break;
    case 'circle':
      needNums(['x', 'y', 'r']);
      if (isNum(zone.r) && zone.r <= 0) err(`circle "r" must be > 0, got ${zone.r}`);
      break;
    case 'polygon':
      if (!Array.isArray(zone.points)) { err('polygon needs a "points" array'); break; }
      if (zone.points.length < 3) { err(`polygon needs at least 3 points, got ${zone.points.length}`); break; }
      zone.points.forEach((p, i) => {
        if (!Array.isArray(p) || p.length !== 2 || !isNum(p[0]) || !isNum(p[1])) {
          err(`points[${i}] must be [x, y] numbers`);
        }
      });
      break;
    case 'path':
      if (!isStr(zone.d)) err('path needs a non-empty "d" string (SVG path data)');
      break;
    default:
      err(`unknown shape "${zone.shape}" (valid: ${SHAPES.join(', ')})`);
  }
}

function validateZone(zone, path, ctx, errors) {
  const err = (message) => errors.push({ path, message });
  if (!isObj(zone)) { err('zone must be an object'); return; }
  if (!isStr(zone.id)) err('zone needs a string "id"');
  else if (ctx.zoneIds.has(zone.id)) {
    err(`duplicate zone id "${zone.id}" (also on floor "${ctx.zoneIds.get(zone.id)}")`);
  } else {
    ctx.zoneIds.set(zone.id, ctx.floorId);
  }
  if (!ZONE_TYPES.includes(zone.type)) {
    err(`unknown type "${zone.type}" (valid: ${ZONE_TYPES.join(', ')})`);
  }
  validateShape(zone, path, errors);
  if (zone.tier !== undefined && !ctx.tierIds.has(zone.tier)) {
    err(`tier "${zone.tier}" not found (available: ${[...ctx.tierIds].join(', ') || 'none defined'})`);
  }
  if (zone.status !== undefined && !STATUSES.includes(zone.status)) {
    err(`unknown status "${zone.status}" (valid: ${STATUSES.join(', ')})`);
  }
  if (zone.fixture !== undefined && !FIXTURES.includes(zone.fixture)) {
    err(`unknown fixture "${zone.fixture}" (valid: ${FIXTURES.join(', ')})`);
  }
  if (zone.capacity !== undefined && (!Number.isInteger(zone.capacity) || zone.capacity <= 0)) {
    err(`"capacity" must be a positive integer, got ${JSON.stringify(zone.capacity)}`);
  }
}

function validateTier(tier, path, tierIds, errors) {
  const err = (message) => errors.push({ path, message });
  if (!isObj(tier)) { err('tier must be an object'); return; }
  if (!isStr(tier.id)) err('tier needs a string "id"');
  else if (tierIds.has(tier.id)) err(`duplicate tier id "${tier.id}"`);
  else tierIds.add(tier.id);
  if (!isStr(tier.label)) err('tier needs a string "label"');
  if (!isStr(tier.color)) err('tier needs a "color" (any CSS color)');
  if (!isNum(tier.price) || tier.price < 0) err('tier needs a numeric "price" >= 0');
  if (tier.fee !== undefined && (!isNum(tier.fee) || tier.fee < 0)) err('"fee" must be a number >= 0');
  if (tier.originalPrice !== undefined && !isNum(tier.originalPrice)) err('"originalPrice" must be a number');
  if (tier.perks !== undefined && (!Array.isArray(tier.perks) || tier.perks.some((p) => !isStr(p)))) {
    err('"perks" must be an array of strings');
  }
}

function validateFloor(floor, path, ctx, errors) {
  const err = (message) => errors.push({ path, message });
  if (!isObj(floor)) { err('floor must be an object'); return; }
  if (!isStr(floor.id)) err('floor needs a string "id"');
  else if (ctx.floorIds.has(floor.id)) err(`duplicate floor id "${floor.id}"`);
  else ctx.floorIds.add(floor.id);
  if (!isStr(floor.label)) err('floor needs a string "label"');
  if (!isObj(floor.size) || !isNum(floor.size.width) || !isNum(floor.size.height)
    || floor.size.width <= 0 || floor.size.height <= 0) {
    err('floor needs "size" { width, height } with both > 0');
  }
  if (!Array.isArray(floor.zones)) err('floor needs a "zones" array');
  if (floor.labels !== undefined) {
    if (!Array.isArray(floor.labels)) err('"labels" must be an array');
    else floor.labels.forEach((l, i) => {
      if (!isObj(l) || !isStr(l.text) || !isNum(l.x) || !isNum(l.y)) {
        errors.push({ path: `${path}.labels[${i}]`, message: 'label needs "text" and numeric "x", "y"' });
      }
    });
  }
}

/**
 * Validate a venue.json document.
 * @returns {{ ok: boolean, venue: object|null, errors: {path: string, message: string}[] }}
 *   `venue` is the normalized (canonical floors-array) document when ok.
 */
export function validate(json) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });

  if (!isObj(json)) {
    return { ok: false, venue: null, errors: [{ path: '', message: 'venue.json must be a JSON object' }] };
  }
  if (json.schemaVersion !== SCHEMA_VERSION) {
    err('schemaVersion', `unsupported schemaVersion ${JSON.stringify(json.schemaVersion)} (expected "${SCHEMA_VERSION}")`);
  }
  if (!isObj(json.venue)) err('venue', 'missing "venue" object');
  else if (!isStr(json.venue.name)) err('venue.name', 'venue needs a "name"');
  if (Array.isArray(json.floors) && (json.zones || json.size)) {
    err('floors', 'use either "floors" or top-level "size"/"zones" (single-floor shorthand), not both');
  }
  if (!Array.isArray(json.floors) && !Array.isArray(json.zones)) {
    err('zones', 'no zones found: provide "floors" or top-level "zones"');
  }

  const doc = normalize(json);
  const shorthand = !Array.isArray(json.floors);
  const tierIds = new Set();
  json.tiers !== undefined && !Array.isArray(json.tiers)
    ? err('tiers', '"tiers" must be an array')
    : doc.tiers.forEach((t, i) => validateTier(t, `tiers[${i}]`, tierIds, errors));

  const ctx = { tierIds, zoneIds: new Map(), floorIds: new Set(), floorId: '' };
  doc.floors.forEach((floor, fi) => {
    const fpath = shorthand ? '' : `floors[${fi}]`;
    validateFloor(floor, fpath || 'size', ctx, errors);
    ctx.floorId = isObj(floor) && floor.id ? floor.id : `#${fi}`;
    (Array.isArray(floor.zones) ? floor.zones : []).forEach((zone, zi) => {
      const zpath = `${fpath ? fpath + '.' : ''}zones[${zi}]${isObj(zone) && zone.id ? ` "${zone.id}"` : ''}`;
      validateZone(zone, zpath, ctx, errors);
    });
  });

  return { ok: errors.length === 0, venue: errors.length === 0 ? doc : null, errors };
}

/** Human-readable one-line-per-error rendering of a validate() result. */
export function formatErrors(errors) {
  return errors.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message)).join('\n');
}
