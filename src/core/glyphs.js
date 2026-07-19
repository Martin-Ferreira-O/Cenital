// Fixture glyphs, drawn in a normalized 1x1 box (stroke-based line icons).
// `pillar` deliberately has no glyph — the shape itself reads as a column.

export const GLYPHS = {
  bar: { d: 'M0.18 0.2 H0.82 L0.5 0.52 V0.8 M0.34 0.8 H0.66' },
  dj: {
    d: 'M0.45 0.5 a0.13 0.13 0 1 1 -0.26 0 a0.13 0.13 0 1 1 0.26 0 '
      + 'M0.81 0.5 a0.13 0.13 0 1 1 -0.26 0 a0.13 0.13 0 1 1 0.26 0 '
      + 'M0.32 0.5 h0.001 M0.68 0.5 h0.001', // round linecap -> spindle dots
  },
  stage: {
    d: 'M0.5 0.2 a0.12 0.12 0 0 1 0.12 0.12 v0.08 a0.12 0.12 0 0 1 -0.24 0 v-0.08 a0.12 0.12 0 0 1 0.12 -0.12 '
      + 'M0.28 0.4 a0.22 0.22 0 0 0 0.44 0 M0.5 0.62 V0.78 M0.36 0.78 H0.64',
  },
  restroom: { text: 'WC' },
  entrance: { d: 'M0.15 0.5 H0.6 M0.45 0.35 L0.62 0.5 L0.45 0.65 M0.78 0.22 V0.78' },
  stairs: { d: 'M0.2 0.8 H0.35 V0.65 H0.5 V0.5 H0.65 V0.35 H0.8 V0.2' },
  pillar: null,
};
