// Inline SVG icon markup for the builder chrome (rail + align buttons).

const svg = (size, body, attrs = 'stroke="currentColor" stroke-width="1.4" fill="none"') => (
  `<svg width="${size}" height="${size}" viewBox="0 0 16 16" ${attrs}>${body}</svg>`
);

export const TOOL_ICONS = {
  select: svg(17, '<path d="M4 2l9 5.5-4 .9-2.5 4.6z" stroke-linejoin="round"/>'),
  rect: svg(17, '<rect x="2.5" y="4" width="11" height="8" rx="1"/>'),
  circle: svg(17, '<circle cx="8" cy="8" r="5.5"/>'),
  polygon: svg(17, '<path d="M8 2l6 4.5-2.3 7H4.3L2 6.5z" stroke-linejoin="round"/>'),
  label: svg(17, '<path d="M3 4h10M8 4v9" stroke-linecap="round"/>'),
};

export const FIXTURE_ICONS = {
  bar: svg(14, '<path d="M3 3h10l-5 5.5zM8 8.5V13M5.5 13h5" stroke-linejoin="round"/>', 'stroke="currentColor" stroke-width="1.3" fill="none"'),
  dj: svg(14, '<circle cx="5" cy="8" r="2.2"/><circle cx="11" cy="8" r="2.2"/>', 'stroke="currentColor" stroke-width="1.3" fill="none"'),
  stage: svg(14, '<rect x="6" y="2" width="4" height="7" rx="2"/><path d="M4 8a4 4 0 008 0M8 12v2"/>', 'stroke="currentColor" stroke-width="1.3" fill="none"'),
  restroom: svg(14, '<text x="8" y="11.5" font-size="9" font-weight="700" fill="currentColor" text-anchor="middle">WC</text>', 'fill="none"'),
  entrance: svg(14, '<path d="M2 8h8M7 5l3 3-3 3M12.5 2.5v11" stroke-linecap="round"/>', 'stroke="currentColor" stroke-width="1.3" fill="none"'),
  stairs: svg(14, '<path d="M2 13h3v-3h3V7h3V4h3"/>', 'stroke="currentColor" stroke-width="1.3" fill="none"'),
  pillar: svg(14, '<circle cx="8" cy="8" r="3.5"/>', 'stroke="currentColor" stroke-width="1.3" fill="none"'),
};

const bars = (a, b) => `<rect ${a} rx=".8" fill="currentColor" stroke="none" opacity=".85"/><rect ${b} rx=".8" fill="currentColor" stroke="none" opacity=".45"/>`;

export const ALIGN_ICONS = {
  left: svg(15, `<path d="M2.5 2v12"/>${bars('x="4.5" y="4" width="8" height="2.6"', 'x="4.5" y="9" width="5" height="2.6"')}`, 'stroke="currentColor" stroke-width="1.3" fill="none"'),
  hcenter: svg(15, `<path d="M8 2v12" stroke-dasharray="2 1.6"/>${bars('x="3" y="4" width="10" height="2.6"', 'x="5" y="9" width="6" height="2.6"')}`, 'stroke="currentColor" stroke-width="1.3" fill="none"'),
  right: svg(15, `<path d="M13.5 2v12"/>${bars('x="3.5" y="4" width="8" height="2.6"', 'x="6.5" y="9" width="5" height="2.6"')}`, 'stroke="currentColor" stroke-width="1.3" fill="none"'),
  top: svg(15, `<path d="M2 2.5h12"/>${bars('x="4" y="4.5" width="2.6" height="8"', 'x="9" y="4.5" width="2.6" height="5"')}`, 'stroke="currentColor" stroke-width="1.3" fill="none"'),
  vcenter: svg(15, `<path d="M2 8h12" stroke-dasharray="2 1.6"/>${bars('x="4" y="3" width="2.6" height="10"', 'x="9" y="5" width="2.6" height="6"')}`, 'stroke="currentColor" stroke-width="1.3" fill="none"'),
  bottom: svg(15, `<path d="M2 13.5h12"/>${bars('x="4" y="3.5" width="2.6" height="8"', 'x="9" y="6.5" width="2.6" height="5"')}`, 'stroke="currentColor" stroke-width="1.3" fill="none"'),
};
