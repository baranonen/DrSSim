import { createMenuBar, bindSubmenuHover, positionSubmenu } from './menu-bar.js';

/** Fixed simulation UI layer, independent of the desk control system. */
export function bindTrainsUI({ trains, graph, modelBindings, interlocking, i18n, menuBar = createMenuBar(), confirmTrain = () => {}, document = globalThis.document }) {
  const toggle = document.querySelector('#trains-toggle'), dropdown = document.querySelector('#trains-dropdown');
  const list = document.querySelector('#trains-list'), add = document.querySelector('#train-add'), locations = document.querySelector('#train-locations');
  const options = document.querySelector('#train-options');
  let open = false, selecting = false, selected = null, previous = '', sequence = 0;
  const signals = graph.edges.flatMap(edge => edge.signals.filter(signal => signal.type !== 'EndOfShunting').map(signal => signal.id)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const snapshot = () => ({
    trains: [...trains.trains.keys()].map(id => { return { id, next: trains.nextSignal(id), state: trains.displayState(id) }; }),
    locations: selecting ? signals.map(id => ({ id, result: trains.placementAtSignal(id, modelBindings) })) : [],
  });
  function closeOptions() { selected = null; options.hidden = true; }
  function hideMenu() {
    open = false; selecting = false; closeOptions(); dropdown.hidden = true; locations.hidden = true;
    toggle.setAttribute('aria-expanded', 'false'); add.setAttribute('aria-expanded', 'false');
  }
  const closeMenu = () => rootMenu.close();
  function positionDropdown() {
    if (!open) return;
    const box = toggle.getBoundingClientRect();
    const rightmostLeft = document.documentElement.clientWidth - dropdown.offsetWidth - 8;
    dropdown.style.left = `${Math.max(8, Math.min(box.left, rightmostLeft))}px`;
    dropdown.style.top = `${box.bottom + 7}px`;
  }
  function positionOptions() {
    const anchor = [...list.querySelectorAll('[data-train-id]')].find(row => row.dataset.trainId === selected);
    positionSubmenu(options, anchor, dropdown);
  }
  function positionLocations() {
    if (!open || !selecting) return;
    positionSubmenu(locations, add, dropdown);
  }
  function render(force = false) {
    if (!open) return;
    const data = snapshot();
    const signature = JSON.stringify({ trains: data.trains, locations: data.locations.map(x => [x.id, x.result.ok, x.result.reason]) });
    if (!force && previous === signature) return;
    previous = signature;
    list.replaceChildren();
    if (!data.trains.length) { const row = document.createElement('div'); row.className = 'train-empty'; row.textContent = i18n.t('trains.empty'); list.append(row); }
    else {
      const header = document.createElement('div'); header.className = 'train-row train-header';
      for (const key of ['number', 'next', 'status']) { const span = document.createElement('span'); span.textContent = i18n.t(`trains.${key}`); header.append(span); }
      list.append(header);
    }
    for (const t of data.trains) {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'train-row train-entry'; row.dataset.trainId = t.id; row.setAttribute('aria-expanded', String(selected === t.id));
      const showOptions = () => { if (selected === t.id && !options.hidden) return; selecting = false; locations.hidden = true; add.setAttribute('aria-expanded', 'false'); selected = t.id; options.hidden = false; render(true); };
      bindSubmenuHover(row,showOptions); row.addEventListener('click',showOptions);
      for (const value of [t.id, t.next ?? i18n.t('trains.noSignal'), i18n.t(`trains.${t.state}`)]) { const span = document.createElement('span'); span.textContent = value; row.append(span); }
      list.append(row);
    }
    locations.replaceChildren();
    for (const item of data.locations) {
      const button = document.createElement('button'); button.type = 'button'; button.disabled = !item.result.ok;
      button.textContent = item.result.ok ? item.id : `${item.id} — ${i18n.t(`trains.${item.result.reason}`)}`;
      button.addEventListener('click', () => {
        let id; do { id = String(++sequence); } while (trains.trains.has(id));
        if (trains.addTrainAtSignal({ id, signalId: item.id, modelBindings })) closeMenu();
        else render(true);
      });
      locations.append(button);
    }
    if (selected && !trains.getTrain(selected)) closeOptions();
    options.replaceChildren();
    if (selected) {
      const addAction = (key, action) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = i18n.t(`trains.${key}`); button.addEventListener('click', action); options.append(button); return button; };
      addAction('stop', () => { trains.stopTrain(selected); closeMenu(); });
      addAction('reverse', () => { trains.reverseTrain(selected); closeMenu(); });
      addAction('remove', () => { trains.removeTrain(selected); closeMenu(); });
      addAction('authorizeShunting', () => { trains.authorizeShunting(selected); closeMenu(); });
      const showConfirm = () => { const id = selected; closeMenu(); confirmTrain(() => trains.authorizeMovement(id)); };
      const authorize = addAction('authorize',showConfirm); authorize.dataset.authorize = 'true';

    }
    positionLocations(); positionOptions();
  }
  const rootMenu = menuBar.register('trains',toggle,{
    open() { open = true; dropdown.hidden = false; toggle.setAttribute('aria-expanded','true'); positionDropdown(); render(true); }, close:hideMenu,
  });
  const onAdd = () => { if (selecting) return; closeOptions(); selecting = true; locations.hidden = false; add.setAttribute('aria-expanded','true'); render(true); };
  const unbindAddHover = bindSubmenuHover(add,onAdd);
  const onOutside = event => {
    if (!open || toggle.contains(event.target) || dropdown.contains(event.target) || locations.contains(event.target) || options.contains(event.target)) return;
    closeMenu();
  };
  const view = document.defaultView;
  function onResize() {
    positionDropdown();
    positionLocations();
    positionOptions();
  }
  view?.addEventListener('resize', onResize);
  view?.addEventListener('pointerdown', onOutside, true);
  dropdown.addEventListener('scroll', positionLocations); dropdown.addEventListener('scroll', positionOptions);
  const escape = event => { if (event.key==='Escape') closeMenu(); };
  view?.addEventListener('keydown',escape);
  add.addEventListener('click',onAdd);
  const timer = setInterval(render, 250), unsubscribe = interlocking.subscribe(() => render());
  const unsubscribeLocale = i18n.subscribe(() => { positionDropdown(); render(true); });
  return () => { rootMenu.dispose(); unbindAddHover(); clearInterval(timer); unsubscribe(); unsubscribeLocale(); view?.removeEventListener('resize', onResize); view?.removeEventListener('pointerdown', onOutside, true); view?.removeEventListener('keydown',escape); dropdown.removeEventListener('scroll', positionLocations); dropdown.removeEventListener('scroll', positionOptions); add.removeEventListener('click',onAdd); };
}
