// Fake ticketing checkout driving a cart from VenueMap events.
// Imports the built dist bundle on purpose: this page proves the standalone artifact.
import { VenueMap } from '../../dist/venue-map.js';

const fmt = (n) => new Intl.NumberFormat('es-CL', {
  style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
}).format(n);
const finalPrice = (tier) => tier.price + (tier.fee || 0);

const map = new VenueMap('#map', {
  url: '../../examples/warehouse.json',
  multiSelect: true,
});

const cart = new Map(); // zoneId -> { zone, tier }
const itemsEl = document.getElementById('cart-items');
const emptyEl = document.getElementById('cart-empty');
const totalEl = document.getElementById('cart-total');
const checkoutEl = document.getElementById('checkout');

function renderCart() {
  itemsEl.replaceChildren();
  let total = 0;
  for (const [id, { zone, tier }] of cart) {
    total += finalPrice(tier);
    const li = document.createElement('li');
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = zone.label || id;
    const detail = document.createElement('small');
    detail.textContent = `${tier.label} · ${fmt(finalPrice(tier))}`;
    info.append(name, detail);
    const remove = document.createElement('button');
    remove.textContent = '✕';
    remove.setAttribute('aria-label', `Quitar ${zone.label || id}`);
    remove.addEventListener('click', () => map.deselect(id));
    li.append(info, remove);
    itemsEl.appendChild(li);
  }
  emptyEl.hidden = cart.size > 0;
  totalEl.textContent = fmt(total);
  checkoutEl.disabled = cart.size === 0;
}

map.on('select', ({ zone, tier, selected }) => {
  if (!tier) return;
  selected ? cart.set(zone.id, { zone, tier }) : cart.delete(zone.id);
  renderCart();
});

checkoutEl.addEventListener('click', () => {
  alert(`Demo: irías a pagar ${totalEl.textContent} por ${cart.size} ítem(s).`);
});

// setStatus() demo: sells out a table; if it was in the cart the viewer
// deselects it and the select event keeps the cart in sync automatically.
document.getElementById('sellout').addEventListener('click', async () => {
  await map.ready;
  map.setStatus('mesa-m5', 'soldout');
});
