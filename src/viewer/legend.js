// Legend panel: tier swatches + pricing mirroring the classic seat-map legend
// (Precio / Cargo / Final, optional pre-discount). Row click -> tier highlight.
// On small screens the panel becomes a bottom sheet; tapping the header toggles it.

import { finalPrice, formatMoney } from '../core/money.js';

function el(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

/**
 * @returns {{ el: HTMLElement, setActive(tierId|null): void }}
 */
export function createLegend({ venue, tiers, locale, onTierClick }) {
  const currency = venue.currency || 'CLP';
  const fmt = (n) => formatMoney(n, currency, locale);

  const root = el('aside', 'vmap-legend');
  const head = el('header', 'vmap-legend-head', root);
  el('h2', 'vmap-legend-title', head, venue.name);
  if (venue.city) el('p', 'vmap-legend-sub', head, venue.city);
  head.addEventListener('click', () => root.classList.toggle('open'));

  const list = el('div', 'vmap-tiers', root);
  const rows = new Map();
  for (const tier of tiers) {
    const row = el('button', 'vmap-tier-row', list);
    row.type = 'button';
    row.dataset.tier = tier.id;
    row.style.setProperty('--tier', tier.color);
    el('span', 'vmap-swatch', row);

    const main = el('span', 'vmap-tier-main', row);
    el('span', 'vmap-tier-name', main, tier.label);
    const breakdown = tier.fee
      ? `Precio ${fmt(tier.price)} · Cargo ${fmt(tier.fee)}`
      : `Precio ${fmt(tier.price)}`;
    el('small', 'vmap-breakdown', main, breakdown);
    if (tier.perks?.length) el('small', 'vmap-perks', main, tier.perks.join(' · '));

    const price = el('span', 'vmap-tier-price', row);
    if (tier.originalPrice !== undefined) el('s', 'vmap-was', price, fmt(tier.originalPrice));
    el('strong', 'vmap-final', price, fmt(finalPrice(tier)));

    row.addEventListener('click', () => onTierClick?.(tier.id));
    rows.set(tier.id, row);
  }

  return {
    el: root,
    setActive(tierId) {
      for (const [id, row] of rows) row.classList.toggle('active', id === tierId);
    },
  };
}
