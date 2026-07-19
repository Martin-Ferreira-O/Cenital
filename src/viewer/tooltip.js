// Hover tooltip: one absolutely-positioned div per map, clamped to the stage.

export function createTooltip(stage) {
  const el = document.createElement('div');
  el.className = 'vmap-tooltip';
  el.setAttribute('aria-hidden', 'true');
  stage.appendChild(el);

  function position(clientX, clientY) {
    const r = stage.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = clientX - r.left, y = clientY - r.top - 12;
    x = Math.min(Math.max(x, w / 2 + 6), r.width - w / 2 - 6);
    if (y - h < 6) y = clientY - r.top + h + 18; // flip below the cursor near the top edge
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  return {
    /** lines: [{ text, cls? }] — first line is the title. */
    show(lines, clientX, clientY) {
      el.replaceChildren(...lines.map(({ text, cls }, i) => {
        const row = document.createElement('div');
        row.className = i === 0 ? 'vmap-tooltip-title' : (cls || 'vmap-tooltip-line');
        row.textContent = text;
        return row;
      }));
      el.classList.add('show');
      position(clientX, clientY);
    },
    move(clientX, clientY) {
      if (el.classList.contains('show')) position(clientX, clientY);
    },
    hide() {
      el.classList.remove('show');
    },
  };
}
