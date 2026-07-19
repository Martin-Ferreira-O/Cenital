# venue.json — Schema v1.0

One plain JSON document fully describes a venue. The builder produces it; the viewer renders it;
you can hand-write it in any text editor. This file is the contract.

- **Units** are venue units (meters by default), never pixels. Origin is **top-left, y grows downward**
  (SVG convention). The viewer scales everything to fit its container.
- **IDs are human-chosen slugs** (`vip-a`, `dancefloor`), unique, no generated UUIDs.
- Unknown fields are ignored (forward-compatible); missing optional fields get the documented default.

## Top level

```json
{
  "schemaVersion": "1.0",
  "venue": { … },
  "tiers": [ … ],
  "floors": [ … ]          // OR the single-floor shorthand, see below
}
```

| field | required | notes |
|---|---|---|
| `schemaVersion` | yes | must be `"1.0"` |
| `venue` | yes | venue metadata, see below |
| `tiers` | no | pricing tiers; needed if any zone references one |
| `floors` | one of | array of floors (multi-floor form) |
| `size`, `zones`, `labels` | one of | single-floor shorthand: these live at the top level and are treated as one floor named after the venue. Using **both** `floors` and top-level `zones`/`size` is an error. |

### Single-floor shorthand

Most venues have one floor. Skip the `floors` wrapper entirely:

```json
{
  "schemaVersion": "1.0",
  "venue": { "name": "Club Íntimo", "currency": "CLP" },
  "size": { "width": 24, "height": 16 },
  "tiers": [ … ],
  "zones": [ … ],
  "labels": [ … ]
}
```

Internally this is normalized to `floors: [{ "id": "main", "label": "<venue name>", … }]`.

## `venue`

| field | required | default | notes |
|---|---|---|---|
| `name` | yes | — | shown in the builder and screen-reader output |
| `city` | no | — | informational |
| `currency` | no | `"CLP"` | ISO 4217 code; one currency per venue (a mixed-currency legend is incoherent) |
| `units` | no | `"m"` | informational; coordinates are abstract units regardless |
| `theme` | no | — | object of CSS custom-property overrides, keys without the `--vm-` prefix, e.g. `{ "bg": "#0a0a0e", "accent": "#c9a227" }` |

## `tiers[]`

Pricing lives on tiers; zones point at a tier by id.

| field | required | default | notes |
|---|---|---|---|
| `id` | yes | — | unique slug |
| `label` | yes | — | shown in legend and tooltips |
| `color` | yes | — | any CSS color; drives zone fill/stroke and legend swatch |
| `price` | yes | — | number, major currency units (`250000` = $250.000 CLP) |
| `fee` | no | `0` | service charge; **final price = price + fee** (computed, never stored) |
| `originalPrice` | no | — | pre-discount price; when any tier has it, the legend grows a discount column |
| `perks` | no | `[]` | array of strings, shown in tooltip/legend detail |

## `floors[]`

| field | required | notes |
|---|---|---|
| `id` | yes | unique slug |
| `label` | yes | shown in the floor switcher |
| `size` | yes | `{ "width": n, "height": n }` in venue units, both > 0 |
| `zones` | yes | see below |
| `labels` | no | free-floating text labels, see below |

Floors are independent maps sharing the venue's tier list. **Zone ids must be unique across all
floors**, because the viewer API addresses zones by bare id (`map.setStatus("vip-a", …)`).

## `zones[]`

A zone is one shape on the floor. Shape fields sit **directly on the zone** (no nested object).

```json
{ "id": "vip-a", "label": "VIP A", "type": "table", "shape": "rect",
  "x": 33, "y": 7, "w": 5, "h": 3, "rotation": 0, "rx": 0.3,
  "tier": "vip", "capacity": 8, "status": "available" }
```

| field | required | default | notes |
|---|---|---|---|
| `id` | yes | — | unique slug across all floors |
| `label` | no | id title-cased | tooltip / screen-reader / on-shape text |
| `type` | yes | — | `area` \| `table` \| `fixture` \| `wall` (see below) |
| `shape` | yes | — | `rect` \| `circle` \| `polygon` \| `path` |
| `tier` | no | — | must match a `tiers[].id` |
| `capacity` | no | — | positive integer, informational (a table sells as a whole unit) |
| `status` | no | `"available"` | `available` \| `limited` \| `soldout` \| `reserved` — drives visual state |
| `interactive` | no | `true` iff `tier` is set | explicit value overrides; non-interactive zones ignore hover/click/tab |
| `fixture` | no | — | glyph preset for `type: "fixture"` zones: `bar` \| `dj` \| `stage` \| `restroom` \| `entrance` \| `stairs` \| `pillar`. Optional — a fixture without it renders as a plain labeled shape. |

### Zone types

- `area` — standing zone (dance floor, general admission). Usually sellable via a tier.
- `table` — a sellable unit (VIP table, booth). Sells whole; `capacity` is informational.
- `fixture` — decor/infrastructure (bar, DJ booth, stage, restroom, stairs, pillar). Not sellable.
- `wall` — interior wall/divider, drawn beneath everything.

**Paint order is fixed by type**: `wall → area → table → fixture`, labels on top. There is no
z-index; reorder by choosing the right type.

### Shapes

- `rect` — `x`, `y` (top-left), `w`, `h` (all required, `w`/`h` > 0), optional `rotation`
  (degrees, clockwise, **pivot = shape center**), optional `rx` (corner radius, venue units).
- `circle` — `x`, `y` (center), `r` (> 0).
- `polygon` — `points`: `[[x, y], …]`, at least 3 points.
- `path` — `d`: an SVG path string in venue units. **Viewer-render-only escape hatch**: the builder
  preserves path zones and lets you edit their properties, but offers no path drawing or geometry
  editing. Prefer `polygon`.

## `labels[]` (per floor)

Free-floating text, for room names and wayfinding (`"PISTA"`, `"ENTRADA"`).

| field | required | default | notes |
|---|---|---|---|
| `text` | yes | — | rendered uppercase, tracked-out |
| `x`, `y` | yes | — | anchor center, venue units |
| `size` | no | `0.6` | cap height in venue units |
| `rotation` | no | `0` | degrees, pivot = anchor |

## Validation

`validate(json)` (in `src/core/schema.js`, also run on viewer/builder load) returns
`{ ok, venue, errors }` — never throws. Every error has a `path` and a human-readable `message`:

```
floors[1].zones[3] "vip-a": tier "gold" not found (available: general, vip)
zones[7]: duplicate zone id "booth-2" (also on floor "main")
zones[2] "pista": polygon needs at least 3 points, got 2
```

Checked: duplicate zone/tier/floor ids, unknown tier references, per-shape required numeric fields,
enum values (`type`, `shape`, `status`, `fixture`), floor sizes > 0, shorthand/`floors` conflict,
`schemaVersion`.

## Minimal hand-written example

```json
{
  "schemaVersion": "1.0",
  "venue": { "name": "Mi Club", "currency": "CLP" },
  "size": { "width": 20, "height": 12 },
  "tiers": [
    { "id": "general", "label": "General", "color": "#5b7fdb", "price": 10000, "fee": 1750 }
  ],
  "zones": [
    { "id": "pista", "type": "area", "shape": "rect", "x": 4, "y": 3, "w": 12, "h": 7, "tier": "general" },
    { "id": "dj", "type": "fixture", "fixture": "dj", "shape": "rect", "x": 8, "y": 0.5, "w": 4, "h": 2 }
  ],
  "labels": [{ "text": "PISTA", "x": 10, "y": 6.5 }]
}
```

That is a complete, valid venue. Everything else is optional.
