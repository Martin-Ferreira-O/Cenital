// Screen-reader support: a visually-hidden list of zones + prices per floor,
// and a polite live region announcing selection changes.

export function createSrPanel(wrap, doc, ariaFor) {
  const panel = document.createElement('div');
  panel.className = 'vmap-sr';
  const title = document.createElement('h3');
  title.textContent = `${doc.venue.name} — zonas y precios`;
  panel.appendChild(title);
  for (const floor of doc.floors) {
    if (doc.floors.length > 1) {
      const h = document.createElement('h4');
      h.textContent = floor.label;
      panel.appendChild(h);
    }
    const ul = document.createElement('ul');
    for (const zone of floor.zones) {
      if (!zone.tier) continue;
      const li = document.createElement('li');
      li.textContent = ariaFor(zone);
      ul.appendChild(li);
    }
    panel.appendChild(ul);
  }
  const live = document.createElement('div');
  live.className = 'vmap-sr';
  live.setAttribute('aria-live', 'polite');
  wrap.append(panel, live);

  return {
    announce(text) { live.textContent = text; },
  };
}
