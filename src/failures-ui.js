import { createMenuBar, bindSubmenuHover, createMenuItem, positionSubmenu } from './menu-bar.js';

/** Send fault selections to the interlocking model instead of modifying visual state directly. */
export function bindFailuresUI({ interlocking: engine, i18n, menuBar = createMenuBar(), document = globalThis.document }) {
  const toggle = document.querySelector('#failures-toggle');
  const panels = ['failures-dropdown', 'failure-items', 'failure-options'].map(id => document.querySelector(`#${id}`));
  const view = document.defaultView;
  let category = null, selected = null, disposed = false;
  const sort = items => [...items].sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));
  const ids = kind => kind === 'signals' ? engine.signals.keys() : kind === 'points' ? engine.points.keys() : kind === 'power' ? Object.keys(engine.powerFailures) : engine.gleisrelais.keys();
  const hasSelectedFailure = (kind,id) => kind === 'signals' ? Object.values(engine.getSignal(id).redFilamentFailures).some(Boolean) :
    kind === 'points' ? engine.getPoint(id).unreachable.length > 0 : kind === 'power' ? engine.powerFailures[id] : engine.gleisrelais.get(id).stuckOccupied;
  const categoryButtons = new Map(), itemButtons = new Map(), optionButtons = [];
  function hide() {
    for (const panel of panels) panel.hidden = true;
    category = selected = null; toggle.setAttribute('aria-expanded', 'false');
    categoryButtons.clear(); itemButtons.clear(); optionButtons.length = 0;
  }
  function place(panel, anchor, below = false) {
    panel.hidden = false;
    if (!below) { positionSubmenu(panel, anchor); return; }
    const box = anchor.getBoundingClientRect(), width = panel.offsetWidth, height = panel.offsetHeight;
    const maxX = document.documentElement.clientWidth - width - 8, maxY = document.documentElement.clientHeight - height - 8;
    const left = box.left;
    panel.style.left = `${Math.max(8, Math.min(left, maxX))}px`;
    panel.style.top = `${Math.max(8, Math.min(box.bottom + 7, maxY))}px`;
  }
  function row(panel, title, callback, { submenu = false, checked } = {}) {
    const {button,mark} = createMenuItem(document,title,{checked:checked ? checked() : undefined});
    if (submenu) {
      button.setAttribute('aria-expanded','false');
      const arrow = document.createElement('span'); arrow.className = 'failure-arrow'; arrow.textContent = '›'; button.append(arrow);
      bindSubmenuHover(button, () => { if (!disposed) callback(button); });
    }
    if (checked) optionButtons.push({ button, mark, checked });
    button.addEventListener('click', () => { if (!disposed) callback(button); }); panel.append(button); return button;
  }
  function refresh() {
    for (const [kind, button] of categoryButtons) button.dataset.failed = String([...ids(kind)].some(id => hasSelectedFailure(kind,id)));
    for (const [id, button] of itemButtons) button.dataset.failed = String(hasSelectedFailure(category,id));
    for (const {button,mark,checked} of optionButtons) {
      const active = checked(); mark.textContent = active ? '✓' : '';
      button.setAttribute('aria-checked', String(active)); button.dataset.failed = String(active);
    }
  }
  function options(anchor, id) {
    if (selected === id && !panels[2].hidden) return;
    selected = id; const panel = panels[2]; panel.replaceChildren(); optionButtons.length = 0;
    for (const button of itemButtons.values()) button.setAttribute('aria-expanded','false');
    anchor.setAttribute('aria-expanded','true');
    const action = (key, checked, callback) => row(panel, i18n.t(`failures.${key}`), () => { callback(!checked()); root.close(); }, { checked });
    if (category === 'signals') for (const filament of [1,2]) action(`filament${filament}`, () => engine.getSignal(id).redFilamentFailures[filament], active => engine.setSignalRedFilamentFailure(id,filament,active));
    if (category === 'points') for (const [key,branch] of [['plus','B'],['minus','C']]) action(key, () => engine.getPoint(id).unreachable.includes(branch), active => engine.setPointFailure(id,branch,active));
    if (category === 'tracks') action('occupied', () => engine.gleisrelais.get(id).stuckOccupied, active => engine.setTrackCircuitFailure(id,active));
    refresh(); place(panel,anchor);
  }
  function items(anchor, kind) {
    if (category === kind && !panels[1].hidden) return;
    category = kind; selected = null;
    for (const button of categoryButtons.values()) button.setAttribute('aria-expanded','false');
    anchor.setAttribute('aria-expanded','true');
    const panel = panels[1]; panel.replaceChildren(); itemButtons.clear(); optionButtons.length = 0; panels[2].hidden = true;
    if (kind === 'power') for (const id of ids(kind)) {
      const checked = () => engine.powerFailures[id];
      itemButtons.set(id, row(panel, i18n.t(`failures.power_${id}`), () => { engine.setPowerFailure(id, !checked()); root.close(); }, { checked }));
    } else for (const id of sort(ids(kind))) itemButtons.set(id,row(panel,id,button => options(button,id),{submenu:true}));
    refresh(); place(panel,anchor);
  }
  function open() {
    panels[0].replaceChildren(); categoryButtons.clear();
    const reset = row(panels[0],i18n.t('failures.resetAll'),()=>{ engine.resetAllFailures(); root.close(); });
    reset.className = 'failure-reset';
    reset.addEventListener('mouseenter',()=>{ panels[1].hidden = panels[2].hidden = true; category = selected = null; itemButtons.clear(); optionButtons.length = 0; });
    for (const key of ['signals','points','tracks','power']) categoryButtons.set(key,row(panels[0],i18n.t(`failures.${key}`),button=>items(button,key),{submenu:true}));
    refresh(); place(panels[0],toggle,true); toggle.setAttribute('aria-expanded','true');
  }
  const root = menuBar.register('failures',toggle,{open,close:hide});
  const outside = event => { if (!toggle.contains(event.target) && !panels.some(panel=>panel.contains(event.target))) root.close(); };
  function reposition() {
    if (panels[0].hidden) return;
    place(panels[0],toggle,true);
    if (!panels[1].hidden) place(panels[1],categoryButtons.get(category));
    if (!panels[2].hidden) place(panels[2],itemButtons.get(selected));
  }
  const escape = event => { if (event.key === 'Escape') root.close(); };
  view?.addEventListener('pointerdown',outside,true); view?.addEventListener('resize',reposition); view?.addEventListener('keydown',escape);
  for (const panel of panels) panel.addEventListener('scroll',reposition);
  const unsubscribe = engine.subscribe(refresh);
  const unsubscribeLocale = i18n.subscribe(()=>{
    if (panels[0].hidden) return;
    const oldCategory = category, oldSelected = selected;
    hide(); open();
    if (oldCategory) items(categoryButtons.get(oldCategory),oldCategory);
    if (oldSelected) options(itemButtons.get(oldSelected),oldSelected);
  });
  return () => {
    disposed = true; unsubscribe(); unsubscribeLocale(); root.dispose(); for (const panel of panels) panel.replaceChildren();
    view?.removeEventListener('pointerdown',outside,true); view?.removeEventListener('resize',reposition); view?.removeEventListener('keydown',escape);
    for (const panel of panels) panel.removeEventListener('scroll',reposition);
  };
}
