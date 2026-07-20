// Top header: brand, venue identity, floor tabs, undo/redo, file actions, preview.

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}

export function createToolbar(root, store, actions) {
  // brand + venue identity
  const brand = el('div', 'bld-brand', root);
  el('span', 'bld-brand-dot', brand);
  el('span', 'bld-brand-name', brand, 'CENITAL');
  el('div', 'bld-hdr-div', root);

  const idBox = el('div', 'bld-venue-id', root);
  const nameInput = el('input', 'bld-venue-name', idBox);
  nameInput.title = 'Nombre del venue';
  nameInput.addEventListener('change', () => {
    const t = nameInput.value.trim();
    if (t) store.update((s) => { s.doc.venue.name = t; });
    else nameInput.value = store.doc.venue.name;
  });
  const metaRow = el('div', 'bld-venue-meta', idBox);
  const cityInput = el('input', 'bld-venue-city', metaRow);
  cityInput.placeholder = 'Ciudad';
  cityInput.title = 'Ciudad';
  cityInput.addEventListener('change', () => store.update((s) => { s.doc.venue.city = cityInput.value.trim(); }));
  const sizeSpan = el('span', null, metaRow);

  const floorsBox = el('div', 'bld-floors', root);

  const right = el('div', 'bld-hdr-right', root);
  el('span', 'bld-saved', right, 'Guardado ✓');

  const editGroup = el('div', 'bld-hdr-group', right);
  const undoBtn = el('button', 'bld-icon-btn', editGroup, '↩');
  undoBtn.title = 'Deshacer (⌘Z)';
  undoBtn.addEventListener('click', () => store.undo());
  const redoBtn = el('button', 'bld-icon-btn', editGroup, '↪');
  redoBtn.title = 'Rehacer (⇧⌘Z)';
  redoBtn.addEventListener('click', () => store.redo());
  el('div', 'bld-hdr-div', editGroup);

  const importBtn = el('button', 'bld-hdr-btn', editGroup, 'Importar');
  const fileInput = el('input', null, editGroup);
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.hidden = true;
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) actions.importFile(fileInput.files[0]);
    fileInput.value = '';
  });

  const exampleSel = el('select', 'bld-hdr-btn', editGroup);
  el('option', null, exampleSel, 'Ejemplos ▾').value = '';
  for (const [v, t] of [['club-intimo', 'Club Íntimo'], ['warehouse', 'Bodega Norte'], ['rooftop', 'Terraza Cielo']]) {
    el('option', null, exampleSel, t).value = v;
  }
  exampleSel.addEventListener('change', () => {
    if (exampleSel.value) actions.loadExample(exampleSel.value);
    exampleSel.value = '';
  });

  el('button', 'bld-hdr-btn', editGroup, 'Exportar').addEventListener('click', actions.exportDoc);
  const previewBtn = el('button', 'bld-gold-btn', editGroup, '▶ Vista previa');
  previewBtn.addEventListener('click', () => store.setUI((s) => { s.preview = true; }));

  const backBtn = el('button', 'bld-gold-btn', right, '← Volver a editar');
  backBtn.addEventListener('click', () => store.setUI((s) => { s.preview = false; }));

  function sync(state) {
    if (document.activeElement !== nameInput) nameInput.value = state.doc.venue.name;
    if (document.activeElement !== cityInput) cityInput.value = state.doc.venue.city ?? '';
    const { width, height } = store.floor().size;
    sizeSpan.textContent = `· ${width} × ${height} m`;

    floorsBox.replaceChildren();
    for (const floor of state.doc.floors) {
      const b = el('button', 'bld-floor-tab', floorsBox, floor.label);
      b.classList.toggle('active', floor.id === state.floorId);
      b.addEventListener('click', () => store.setUI((s) => { s.floorId = floor.id; s.selection = []; }));
    }
    const add = el('button', 'bld-floor-tab bld-add-floor', floorsBox, '+');
    add.title = 'Agregar piso';
    add.addEventListener('click', () => {
      let n = state.doc.floors.length + 1;
      while (state.doc.floors.some((f) => f.id === `piso-${n}`)) n += 1;
      store.update((s) => {
        s.doc.floors.push({ id: `piso-${n}`, label: `Piso ${n}`, size: { width: 24, height: 16 }, zones: [], labels: [] });
        s.floorId = `piso-${n}`;
        s.selection = [];
      });
    });

    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();
    editGroup.hidden = state.preview;
    floorsBox.hidden = state.preview;
    backBtn.hidden = !state.preview;
  }

  return { sync };
}
