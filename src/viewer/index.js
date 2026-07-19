// VenueMap — the embeddable viewer. Zero runtime dependencies; bundles to dist/venue-map.js.
//
//   import { VenueMap } from './venue-map.js';
//   const map = new VenueMap('#container', { data: venueJson, interactive: true });
//   map.on('select', ({ zone, tier, selected }) => { ... });
//   map.setStatus('vip-a', 'soldout');
//   map.destroy();

import { validate, formatErrors, zoneLabel, zoneStatus, zoneInteractive } from '../core/schema.js';
import { renderFloor, floorViewBox, svgEl } from '../core/render.js';
import { attachPanzoom } from '../core/panzoom.js';
import { finalPrice, formatMoney } from '../core/money.js';
import { createEmitter } from '../core/emitter.js';
import { createLegend } from './legend.js';
import { createTooltip } from './tooltip.js';
import { createSrPanel } from './a11y.js';

const STATUS_ES = {
  available: 'disponible',
  limited: 'últimos cupos',
  soldout: 'agotado',
  reserved: 'reservado',
};

const DEFAULTS = {
  data: null,
  url: null,
  interactive: true,
  selectable: true,
  multiSelect: false,
  showLegend: true,
  showTooltips: true,
  theme: 'dark',       // 'dark' | 'light' | { cssVar: value } overrides
  locale: 'es-CL',
  floor: null,         // initial floor id
  onSelect: null,
  onHover: null,
};

export { validate, formatErrors };

export class VenueMap {
  #opts; #root; #wrap; #svg; #floorG; #legend; #switcher;
  #panzoom; #tooltip; #sr;
  #doc; #floorId; #tiersById; #zonesById;
  #selection = new Set();
  #highlightedTier = null;
  #emitter = createEmitter();
  #ac = new AbortController();

  constructor(container, opts = {}) {
    this.#root = typeof container === 'string' ? document.querySelector(container) : container;
    if (!this.#root) throw new Error(`VenueMap: container not found: ${container}`);
    this.#opts = { ...DEFAULTS, ...opts };
    if (!this.#opts.interactive) this.#opts.selectable = false;
    this.ready = this.#init();
  }

  async #init() {
    let data = this.#opts.data;
    if (!data && this.#opts.url) {
      try {
        data = await (await fetch(this.#opts.url, { signal: this.#ac.signal })).json();
      } catch (err) {
        if (this.#ac.signal.aborted) return this; // destroyed while loading
        throw err;
      }
    }
    if (this.#ac.signal.aborted) return this; // destroyed while loading
    const result = validate(data);
    if (!result.ok) {
      this.#renderErrors(result.errors);
      throw new Error(`VenueMap: invalid venue data\n${formatErrors(result.errors)}`);
    }
    this.#doc = result.venue;
    this.#tiersById = new Map(this.#doc.tiers.map((t) => [t.id, t]));
    this.#zonesById = new Map();
    for (const floor of this.#doc.floors) {
      for (const zone of floor.zones) this.#zonesById.set(zone.id, { zone, floorId: floor.id });
    }
    this.#floorId = this.#opts.floor || this.#doc.floors[0].id;
    this.#build();
    this.#renderFloor();
    if (this.#opts.interactive) this.#bindEvents();
    return this;
  }

  #build() {
    const o = this.#opts;
    this.#wrap = document.createElement('div');
    this.#wrap.className = 'vmap';
    if (!o.interactive) this.#wrap.classList.add('vmap-static');
    this.#wrap.dataset.vmTheme = typeof o.theme === 'string' ? o.theme : 'dark';
    for (const [k, v] of Object.entries(this.#doc.venue.theme || {})) {
      this.#wrap.style.setProperty(`--vm-${k}`, v);
    }
    if (typeof o.theme === 'object' && o.theme) {
      for (const [k, v] of Object.entries(o.theme)) this.#wrap.style.setProperty(`--vm-${k}`, v);
    }
    const stage = document.createElement('div');
    stage.className = 'vmap-stage';
    this.#svg = svgEl('svg', { class: 'vmap-svg', role: 'img' });
    this.#svg.setAttribute('aria-label', `Mapa de ${this.#doc.venue.name}`);
    stage.appendChild(this.#svg);
    this.#wrap.appendChild(stage);

    if (o.interactive) {
      this.#panzoom = attachPanzoom(this.#svg, { signal: this.#ac.signal });
      if (o.showTooltips) this.#tooltip = createTooltip(stage);
    }
    this.#sr = createSrPanel(this.#wrap, this.#doc, this.#ariaFor);

    if (this.#doc.floors.length > 1) {
      this.#switcher = document.createElement('nav');
      this.#switcher.className = 'vmap-floors';
      this.#switcher.setAttribute('aria-label', 'Pisos');
      for (const floor of this.#doc.floors) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = floor.label;
        b.dataset.floor = floor.id;
        b.addEventListener('click', () => this.setFloor(floor.id), { signal: this.#ac.signal });
        this.#switcher.appendChild(b);
      }
      stage.appendChild(this.#switcher);
    }

    if (o.showLegend && this.#doc.tiers.length) {
      this.#legend = createLegend({
        venue: this.#doc.venue,
        tiers: this.#doc.tiers,
        locale: o.locale,
        onTierClick: o.interactive ? (tierId) => this.highlightTier(
          this.#highlightedTier === tierId ? null : tierId,
        ) : null,
      });
      this.#wrap.appendChild(this.#legend.el);
    }
    this.#root.appendChild(this.#wrap);
  }

  #ariaFor = (zone) => {
    const tier = this.#tiersById.get(zone.tier);
    const parts = [zoneLabel(zone)];
    if (tier) parts.push(`${tier.label} ${formatMoney(finalPrice(tier), this.#doc.venue.currency, this.#opts.locale)}`);
    if (zone.capacity) parts.push(`${zone.capacity} personas`);
    parts.push(STATUS_ES[zoneStatus(zone)]);
    return parts.join(' — ');
  };

  #renderFloor() {
    const floor = this.#doc.floors.find((f) => f.id === this.#floorId);
    this.#tooltip?.hide(); // hovered zone is about to be removed; no pointerout will fire
    this.#floorG?.remove();
    this.#floorG = renderFloor(floor, {
      tiersById: this.#tiersById,
      aria: this.#opts.interactive ? this.#ariaFor : null,
    });
    const pad = 1;
    if (this.#panzoom) {
      this.#panzoom.fit({
        x: -pad, y: -pad,
        w: floor.size.width + pad * 2,
        h: floor.size.height + pad * 2,
      });
    } else {
      this.#svg.setAttribute('viewBox', floorViewBox(floor, pad));
    }
    this.#svg.appendChild(this.#floorG);
    this.#switcher?.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.floor === this.#floorId);
    });
    for (const id of this.#selection) this.#applySelectionClass(id);
    if (this.#highlightedTier) this.#applyTierHighlight();
  }

  #zoneG(id) {
    return this.#svg.querySelector(`[data-zone-id="${CSS.escape(id)}"]`);
  }

  #bindEvents() {
    const sig = { signal: this.#ac.signal };
    this.#svg.addEventListener('click', (e) => {
      const g = e.target.closest('[data-interactive]');
      if (g) this.#toggle(g.dataset.zoneId);
    }, sig);
    this.#svg.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const g = e.target.closest('[data-interactive]');
      if (g) { e.preventDefault(); this.#toggle(g.dataset.zoneId); }
    }, sig);
    this.#svg.addEventListener('pointerover', (e) => {
      const g = e.target.closest('[data-interactive]');
      if (!g) return;
      const { zone } = this.#zonesById.get(g.dataset.zoneId);
      const payload = { zone, tier: this.#tiersById.get(zone.tier) || null };
      this.#emitter.emit('hover', payload);
      this.#opts.onHover?.(payload);
      if (this.#tooltip && e.pointerType !== 'touch') {
        this.#tooltip.show(this.#tooltipLines(zone, payload.tier), e.clientX, e.clientY);
      }
    }, sig);
    this.#svg.addEventListener('pointermove', (e) => {
      if (this.#panzoom?.isDragging()) { this.#tooltip?.hide(); return; }
      this.#tooltip?.move(e.clientX, e.clientY);
    }, sig);
    this.#svg.addEventListener('pointerout', (e) => {
      if (e.target.closest('[data-interactive]')) this.#tooltip?.hide();
    }, sig);
    this.#svg.addEventListener('pointerdown', () => this.#tooltip?.hide(), sig);
  }

  #tooltipLines(zone, tier) {
    const lines = [{ text: zoneLabel(zone) }];
    if (tier) {
      const price = formatMoney(finalPrice(tier), this.#doc.venue.currency, this.#opts.locale);
      lines.push({ text: `${tier.label} · ${price}` });
      if (tier.perks?.length) lines.push({ text: tier.perks.join(' · '), cls: 'vmap-tooltip-perks' });
    }
    const meta = [];
    if (zone.capacity) meta.push(`${zone.capacity} personas`);
    meta.push(STATUS_ES[zoneStatus(zone)]);
    lines.push({ text: meta.join(' · '), cls: `vmap-tooltip-status status-${zoneStatus(zone)}` });
    return lines;
  }

  static #BLOCKED = new Set(['soldout', 'reserved']);

  #toggle(id, force) {
    if (!this.#opts.selectable) return;
    const entry = this.#zonesById.get(id);
    if (!entry) return;
    // deselecting a zone that just became blocked is fine; selecting it is not
    if (force !== false && VenueMap.#BLOCKED.has(zoneStatus(entry.zone))) return;
    const selected = force !== undefined ? force : !this.#selection.has(id);
    if (selected === this.#selection.has(id)) return;
    if (selected && !this.#opts.multiSelect) {
      for (const prev of [...this.#selection]) this.#toggle(prev, false);
    }
    selected ? this.#selection.add(id) : this.#selection.delete(id);
    this.#applySelectionClass(id);
    const payload = {
      zone: entry.zone,
      tier: this.#tiersById.get(entry.zone.tier) || null,
      selected,
      selection: [...this.#selection],
    };
    this.#emitter.emit('select', payload);
    this.#opts.onSelect?.(payload);
    this.#sr?.announce(`${zoneLabel(entry.zone)} ${selected ? 'seleccionado' : 'quitado'}`);
  }

  #applySelectionClass(id) {
    const g = this.#zoneG(id);
    if (!g) return;
    const on = this.#selection.has(id);
    g.classList.toggle('selected', on);
    g.setAttribute('aria-pressed', String(on));
  }

  #applyTierHighlight() {
    // everything that isn't in the highlighted tier recedes — fixtures and walls included
    for (const g of this.#svg.querySelectorAll('.vm-zone')) {
      g.classList.toggle('dim', !!this.#highlightedTier && g.dataset.tier !== this.#highlightedTier);
    }
    this.#legend?.setActive(this.#highlightedTier);
  }

  #renderErrors(errors) {
    const panel = document.createElement('div');
    panel.className = 'vmap vmap-error';
    panel.innerHTML = '<h2>venue.json inválido</h2>';
    const pre = document.createElement('pre');
    pre.textContent = formatErrors(errors);
    panel.appendChild(pre);
    this.#root.appendChild(panel);
    this.#wrap = panel;
  }

  // ---- public API ----
  on(event, fn) { return this.#emitter.on(event, fn); }
  off(event, fn) { this.#emitter.off(event, fn); }
  getSelection() { return [...this.#selection]; }
  select(id) { this.#toggle(id, true); }
  deselect(id) { this.#toggle(id, false); }

  highlightTier(tierId) {
    this.#highlightedTier = tierId;
    this.#applyTierHighlight();
  }

  setStatus(id, status) {
    const entry = this.#zonesById.get(id);
    if (!entry) throw new Error(`VenueMap.setStatus: unknown zone "${id}"`);
    const blocked = VenueMap.#BLOCKED.has(status);
    if (blocked && this.#selection.has(id)) this.#toggle(id, false);
    entry.zone.status = status;
    const g = this.#zoneG(id);
    if (g) {
      g.setAttribute('data-status', status);
      if (g.hasAttribute('role')) {
        g.setAttribute('aria-label', this.#ariaFor(entry.zone));
        blocked ? g.removeAttribute('tabindex') : g.setAttribute('tabindex', '0');
      }
    }
  }

  setFloor(id) {
    if (!this.#doc.floors.some((f) => f.id === id)) throw new Error(`VenueMap.setFloor: unknown floor "${id}"`);
    if (id === this.#floorId) return;
    this.#floorId = id;
    this.#renderFloor();
    this.#emitter.emit('floorchange', { floor: id });
  }

  destroy() {
    this.#ac.abort();
    this.#wrap?.remove();
  }
}
