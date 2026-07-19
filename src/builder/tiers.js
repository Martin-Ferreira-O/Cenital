// Tier manager: flat CRUD list in the side panel. Final price is computed live.

import { formatMoney, finalPrice } from '../core/money.js';

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}

export function createTiersPanel(root, store) {
  const openTiers = new Set(); // survive wholesale re-renders
  function commit(fn) { store.update(fn); }

  function render(state) {
    root.replaceChildren();
    const head = el('div', 'bld-tiers-head', root);
    el('h3', 'bld-h', head, 'Tiers');
    const add = el('button', 'bld-btn bld-mini', head, '+');
    add.title = 'Agregar tier';
    add.addEventListener('click', () => {
      let n = 1;
      while (state.doc.tiers.some((t) => t.id === `tier-${n}`)) n += 1;
      commit((s) => {
        s.doc.tiers.push({ id: `tier-${n}`, label: `Tier ${n}`, color: '#8b5cf6', price: 10000, fee: 0 });
      });
    });

    for (const tier of state.doc.tiers) {
      const row = el('details', 'bld-tier', root);
      row.open = openTiers.has(tier.id);
      row.addEventListener('toggle', () => {
        row.open ? openTiers.add(tier.id) : openTiers.delete(tier.id);
      });
      const sum = el('summary', 'bld-tier-sum', row);
      const sw = el('span', 'bld-tier-swatch', sum);
      sw.style.background = tier.color;
      el('span', 'bld-tier-name', sum, tier.label);
      el('span', 'bld-tier-final', sum,
        formatMoney(finalPrice(tier), state.doc.venue.currency));

      const body = el('div', 'bld-tier-body', row);
      const input = (labelText, type, value, onCommit) => {
        const wrap = el('label', 'bld-field', body);
        el('span', 'bld-field-label', wrap, labelText);
        const i = el('input', null, wrap);
        i.type = type;
        i.value = value ?? '';
        i.addEventListener('change', () => onCommit(i));
        return i;
      };
      input('Nombre', 'text', tier.label, (i) => i.value.trim() && commit(() => { tier.label = i.value.trim(); }));
      input('Color', 'color', tier.color, (i) => commit(() => { tier.color = i.value; }));
      input('Precio', 'number', tier.price, (i) => {
        const v = parseFloat(i.value);
        if (v >= 0) commit(() => { tier.price = v; });
      });
      input('Cargo', 'number', tier.fee ?? 0, (i) => {
        const v = parseFloat(i.value);
        if (v >= 0) commit(() => { tier.fee = v || undefined; });
      });
      input('Precio antes', 'number', tier.originalPrice, (i) => {
        const v = parseFloat(i.value);
        commit(() => { tier.originalPrice = v > 0 ? v : undefined; });
      });
      const perksWrap = el('label', 'bld-field', body);
      el('span', 'bld-field-label', perksWrap, 'Perks (una por línea)');
      const perks = el('textarea', null, perksWrap);
      perks.rows = 3;
      perks.value = (tier.perks ?? []).join('\n');
      perks.addEventListener('change', () => commit(() => {
        const list = perks.value.split('\n').map((p) => p.trim()).filter(Boolean);
        tier.perks = list.length ? list : undefined;
      }));

      const del = el('button', 'bld-btn bld-danger bld-mini', body, 'Eliminar tier');
      del.addEventListener('click', () => {
        const used = state.doc.floors.flatMap((f) => f.zones).filter((z) => z.tier === tier.id);
        if (used.length && !confirm(`"${tier.label}" está en uso por ${used.length} zona(s); se les quitará el tier.`)) return;
        commit((s) => {
          used.forEach((z) => { delete z.tier; });
          s.doc.tiers = s.doc.tiers.filter((t) => t.id !== tier.id);
        });
      });
    }
  }

  return { render };
}
