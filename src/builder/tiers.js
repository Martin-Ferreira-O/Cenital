// Tier editor (step 2 "Precios"): collapsible cards, perks chips, live final price.

import { formatMoney, finalPrice } from '../core/money.js';
import { untieredZones } from './inspector.js';

const PRESET_COLORS = ['#5b7fdb', '#c9a227', '#8b5cf6', '#e5716f', '#6fbf8f'];

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}

export function createTiersPanel(root, store) {
  const openTiers = new Set(); // survive wholesale re-renders
  const commit = (fn) => store.update(fn);

  function tierCard(state, tier, parent) {
    const card = el('div', 'bld-tier-card', parent);
    const head = el('div', 'bld-tier-card-head', card);
    el('span', 'caret', head, '▾');
    el('span', 'bld-swatch', head).style.background = tier.color;
    el('span', 'bld-tier-row-name', head, tier.label);
    const del = el('button', 'bld-danger-link', head, 'Eliminar');
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      const used = state.doc.floors.flatMap((f) => f.zones).filter((z) => z.tier === tier.id);
      if (used.length && !confirm(`"${tier.label}" está en uso por ${used.length} zona(s); se les quitará el tier.`)) return;
      commit((s) => {
        used.forEach((z) => { delete z.tier; });
        s.doc.tiers = s.doc.tiers.filter((t) => t.id !== tier.id);
      });
    });
    head.addEventListener('click', () => { openTiers.delete(tier.id); render(store.state); });

    const body = el('div', 'bld-tier-card-body', card);

    const fld = (parent, labelText, node) => {
      const wrap = el('label', 'bld-field', parent);
      el('span', 'bld-field-label', wrap, labelText);
      wrap.appendChild(node);
      return node;
    };
    const input = (parent, labelText, type, value, onCommit) => {
      const i = document.createElement('input');
      i.type = type;
      i.value = value ?? '';
      i.addEventListener('change', () => onCommit(i));
      return fld(parent, labelText, i);
    };

    // nombre + color
    const nameRow = el('div', 'bld-grid-name-color', body);
    input(nameRow, 'Nombre', 'text', tier.label, (i) => i.value.trim() && commit(() => { tier.label = i.value.trim(); }));
    const colorWrap = el('label', 'bld-field', nameRow);
    el('span', 'bld-field-label', colorWrap, 'Color');
    const colorRow = el('div', 'bld-color-row', colorWrap);
    for (const c of PRESET_COLORS) {
      const dot = el('button', 'bld-color-dot', colorRow);
      dot.style.background = c;
      dot.title = c;
      dot.classList.toggle('active', tier.color.toLowerCase() === c);
      dot.addEventListener('click', () => commit(() => { tier.color = c; }));
    }
    const custom = el('input', 'bld-color-custom', colorRow);
    custom.type = 'color';
    custom.title = 'Color personalizado';
    if (/^#[0-9a-f]{6}$/i.test(tier.color)) custom.value = tier.color;
    custom.addEventListener('change', () => commit(() => { tier.color = custom.value; }));

    // precios
    const priceRow = el('div', 'bld-grid3', body);
    input(priceRow, 'Precio', 'number', tier.price, (i) => {
      const v = parseFloat(i.value);
      if (v >= 0) commit(() => { tier.price = v; });
    });
    input(priceRow, 'Cargo serv.', 'number', tier.fee ?? 0, (i) => {
      const v = parseFloat(i.value);
      if (v >= 0) commit(() => { tier.fee = v || undefined; });
    });
    input(priceRow, 'Antes', 'number', tier.originalPrice, (i) => {
      const v = parseFloat(i.value);
      commit(() => { tier.originalPrice = v > 0 ? v : undefined; });
    });

    // perks chips
    const perksWrap = el('label', 'bld-field', body);
    el('span', 'bld-field-label', perksWrap, 'Perks');
    const chips = el('div', 'bld-perks', perksWrap);
    (tier.perks ?? []).forEach((perk, i) => {
      const chip = el('span', 'bld-perk', chips, perk);
      const x = el('button', null, chip, '×');
      x.title = 'Quitar perk';
      x.addEventListener('click', () => commit(() => {
        tier.perks.splice(i, 1);
        if (!tier.perks.length) tier.perks = undefined;
      }));
    });
    const add = el('button', 'bld-perk-add', chips, '+ perk');
    add.addEventListener('click', () => {
      const inp = el('input', 'bld-perk-input', chips);
      inp.placeholder = 'Ej: Servicio de botella';
      add.replaceWith(inp);
      inp.focus();
      const done = (save) => {
        const t = inp.value.trim();
        if (save && t) commit(() => { (tier.perks ??= []).push(t); });
        else render(store.state);
      };
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') done(true);
        if (e.key === 'Escape') done(false);
        e.stopPropagation();
      });
      inp.addEventListener('blur', () => done(true));
    });

    // computed final price
    const finalBox = el('div', 'bld-final-box', body);
    el('span', null, finalBox, 'Precio final al público');
    el('b', null, finalBox, formatMoney(finalPrice(tier), state.doc.venue.currency));
    el('div', 'bld-final-note', body,
      `Se calcula solo: precio + cargo. El público ve ${formatMoney(finalPrice(tier), state.doc.venue.currency)}${tier.originalPrice ? ' y el «antes» tachado' : ''}.`);
  }

  function render(state) {
    root.replaceChildren();
    const head = el('div', 'bld-panel-head', root);
    el('span', 'bld-panel-title', head, 'Tiers y precios');
    const add = el('button', 'bld-mini-gold', head, '+ Nuevo tier');
    add.addEventListener('click', () => {
      let n = 1;
      while (state.doc.tiers.some((t) => t.id === `tier-${n}`)) n += 1;
      openTiers.add(`tier-${n}`);
      commit((s) => {
        s.doc.tiers.push({ id: `tier-${n}`, label: `Tier ${n}`, color: '#8b5cf6', price: 10000, fee: 0 });
      });
    });

    const missing = untieredZones(state.doc);
    if (missing.length) {
      const warn = el('div', 'bld-tiers-warn', root);
      warn.append(`${missing.length === 1 ? '1 zona aún no tiene tier: ' : `${missing.length} zonas aún no tienen tier: `}`);
      el('b', null, warn, missing.map((z) => z.id).join(', '));
    }

    const list = el('div', 'bld-tiers-list', root);
    for (const tier of state.doc.tiers) {
      if (openTiers.has(tier.id)) {
        tierCard(state, tier, list);
      } else {
        const row = el('button', 'bld-tier-row', list);
        el('span', 'caret', row, '▸');
        el('span', 'bld-swatch', row).style.background = tier.color;
        el('span', 'bld-tier-row-name', row, tier.label);
        el('span', 'bld-tier-row-price', row, formatMoney(finalPrice(tier), state.doc.venue.currency));
        row.addEventListener('click', () => { openTiers.add(tier.id); render(store.state); });
      }
    }
  }

  return { render };
}
