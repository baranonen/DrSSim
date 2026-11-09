import { createMenuItem } from './menu-bar.js';
import { MESSAGES } from './i18n.js';
import { INDICATOR_STATES } from './help-indicators.js';
import { HELP_ACTIONS } from './help-actions.js';
import { HELP_CATALOG, helpKey } from './help-catalog.js';
import { fieldInstanceId } from './tisch.js';
import { resolveHit } from './interaction/hit-targets.js';
import { isPhoneScreen } from './interaction/router.js';

export function bindHelp({ scene, desk, modelBindings, routes = [], buttons, klappes, i18n, menuBar, holdTip, onIntroduction, onAbout = () => {}, document = globalThis.document, storage = (() => { try { return globalThis.localStorage; } catch { return null; } })() }) {
  const view = document.defaultView;
  const toggle = document.querySelector('#help-toggle'), panel = document.querySelector('#help-dropdown');
  const tooltip = document.createElement('div'); tooltip.className = 'help-tooltip'; tooltip.hidden = true; tooltip.setAttribute('role','tooltip');
  const turkish = document.createElement('div'), german = document.createElement('div'), english = document.createElement('div'), description = document.createElement('p');
  german.className = english.className = 'help-translation';
  const overlays = document.createElement('div');
  const phoneLayout = isPhoneScreen(view.screen);
  overlays.className = phoneLayout ? 'pointer-overlays pointer-overlays-bottom' : 'pointer-overlays';
  if (holdTip) overlays.append(holdTip);
  tooltip.append(turkish,german,english,description);
  overlays.append(tooltip);
  document.body.append(overlays);
  const records = new Map();
  for (const field of desk.fields) {
    const prefix = `${fieldInstanceId(desk.id,field.id)}:`;
    for (const [id,record] of scene.elements) if (id.startsWith(prefix)) {
      const key = record.definition.kind === 'counter' ? field.tile : record.definition.key;
      const shunting = key === 'SD' && field.tile === 'ShuntingSignalToLeft';
      const pointButton = record.definition.kind === 'button' && record.definition.labelKey === 'buttons.MD';
      const derailerButton = pointButton && ['Derailer', 'DerailerLeftDown', 'DiagonalDerailerLeft'].includes(field.tile);
      const pointLamp = /^point\.([12])\.(straight|branch)$/.exec(key);
      const lineButton = key === 'RT' && field.buttons?.RT?.labelKey === 'buttons.LT';
      const catalogKey = lineButton ? 'LT' : shunting ? 'SHUNTING_SIGNAL' : pointButton ? 'MD' : pointLamp ? `point.${pointLamp[2]}` : helpKey(key,field.tile);
      const data = HELP_CATALOG[catalogKey];
      if (data) {
        const nameSuffix = pointButton ? key.slice(2) : pointLamp?.[1] ?? '';
        const name = field.labels?.[`label.name${nameSuffix}`] ?? '';
        const lamp = record.definition.kind === 'lamp';
        const titles = pointLamp ? { tr: `Makas ${name} konum göstergesi`, en: `Points ${name} position indicator`, de: `Weichenlagemelder ${name}` }
          : lamp ? { tr: data.tr, en: data.en, de: data.de?.[1] ?? data.tr } : shunting ? { tr: `Münferit manevra sinyali ${name}`, en: `Standalone shunting signal ${name}`, de: `Lichtsperrsignal ${name}` }
          : key === 'SD' ? { tr: `Sinyal ${name}`, en: `Signal ${name}`, de: `Signal ${name}` }
          : derailerButton ? Object.fromEntries(Object.entries(MESSAGES).map(([locale, messages]) => [locale, `${messages['tiles.Derailer']} ${name}`]))
          : pointButton ? { tr: `Makas ${name}`, en: `Points ${name}`, de: `Weiche ${name}` }
          : key === 'RT' ? lineButton ? { tr: `Hat ${name}`, en: `Line ${name}`, de: `Strecke ${name}` } : { tr: `Yol ${name}`, en: `Track ${name}`, de: `Gleis ${name}` } : null;
        const source = modelBindings?.buttons[id];
        const exitSignal = source?.kind === 'signal' && routes.some(route => route.kind === 'exit' && route.startSignalId === source.signalId);
        const exitTarget = source?.kind === 'route-target' && routes.some(route => route.kind === 'exit' && route.target.targetId === source.targetId);
        const actionKey = exitSignal ? 'EXIT_SD' : exitTarget ? 'EXIT_RT' : derailerButton ? 'Derailer' : catalogKey;
        records.set(id, { ...data, ...(titles ? { titles } : {}), actions: HELP_ACTIONS[actionKey], indicator: key.startsWith('track.') ? 'track' : key.startsWith('point.') ? 'point' : null });
        record.node.setAttribute('data-help-key',key);
      }
    }
  }
  for (const target of scene.hitTargets.values()) {
    target.coverNode.setAttribute('data-help-key',target.fixedKlappe ? 'FIXED_COVER' : 'COVER');
    if (target.kind === 'storage') target.node.setAttribute('data-help-key','COVER');
  }
  let enabled = true, current = null, x = 0, y = 0;
  try { enabled = storage?.getItem('drssim.help.enabled') !== 'false'; } catch {}
  scene.svg.setAttribute('data-help-enabled',String(enabled));
  const contacts = new Map(), abort = new AbortController();
  const hide = () => { current = null; tooltip.hidden = true; place(); };
  const dismissPointerHelp = () => { contacts.clear(); hide(); };
  function place() {
    if (phoneLayout) return;
    const width = overlays.offsetWidth, height = overlays.offsetHeight;
    overlays.style.left = `${Math.max(8,Math.min(x,document.documentElement.clientWidth - width - 8))}px`;
    overlays.style.top = `${Math.max(8,Math.min(y + 20,document.documentElement.clientHeight - height - 8))}px`;
  }
  function names(node, short, full) {
    node.replaceChildren();
    node.textContent = '';
    if (short) { const label = document.createElement('span'); label.textContent = `${short} `; node.append(label); }
    const text = document.createElement('em'); text.textContent = full; node.append(text);
  }
  function paint() {
    if (!current) return;
    if (current === HELP_CATALOG.COVER || current === HELP_CATALOG.FIXED_COVER) { turkish.replaceChildren(); turkish.textContent = { tr: 'Kapak', de: 'Klappe', en: 'Cover' }[i18n.locale]; }
    else if (current.titles) { turkish.replaceChildren(); turkish.textContent = current.titles[i18n.locale].trim(); }
    else names(turkish,current.short,current.tr);
    german.hidden = current === HELP_CATALOG.COVER || current === HELP_CATALOG.FIXED_COVER || !!current.titles || i18n.locale === 'en' || !current.de;
    if (!german.hidden) names(german,current.de[0],current.de[1]);
    english.hidden = current === HELP_CATALOG.COVER || current === HELP_CATALOG.FIXED_COVER || !!current.titles || i18n.locale !== 'en';
    if (!english.hidden) names(english,'',current.en);
    description.replaceChildren(); description.textContent = '';
    const actions = current.actions?.[i18n.locale];
    const indicators = INDICATOR_STATES[current.indicator]?.[i18n.locale];
    if (indicators) {
      indicators.forEach(([state, meaning], index) => {
        if (index) description.append(document.createElement('br'));
        const bullet = document.createElement('span'); bullet.textContent = '• '; description.append(bullet);
        const label = document.createElement('strong'); label.textContent = state; description.append(label);
        const text = document.createElement('span'); text.textContent = `: ${meaning}`; description.append(text);
      });
    } else if (actions) {
      { const heading = document.createElement('span'); heading.textContent = i18n.locale === 'tr' ? 'Bu düğmeyle birlikte' : i18n.locale === 'de' ? 'Zusammen drücken mit' : 'Press together with'; description.append(heading, document.createElement('br')); }
      actions.forEach(([button, action], index) => {
        if (index) description.append(document.createElement('br'));
        const bullet = document.createElement('span'); bullet.textContent = '• '; description.append(bullet);
        const label = document.createElement('strong'); label.textContent = button; description.append(label);
        const space = document.createElement('span'); space.textContent = ' '; description.append(space);
        const joiner = document.createElement('span'); joiner.textContent = i18n.locale === 'tr' ? 'ile ' : i18n.locale === 'en' ? 'to ' : 'um '; description.append(joiner);
        const text = document.createElement('span'); text.textContent = action; description.append(text);
      });
    } else { description.textContent = current.description[i18n.locale]; description.style.whiteSpace = 'pre-line'; }
    tooltip.hidden = false; place();
  }
  function at(event) {
    x = event.clientX; y = event.clientY;
    if (!enabled) { place(); return; }
    const element = document.elementFromPoint(x,y);
    if (!element || !scene.svg.contains(element)) { hide(); return; }
    const switchNode = element.closest?.('[data-desk-key-switch]');
    if (switchNode) { if (current !== HELP_CATALOG.DKS) { current = HELP_CATALOG.DKS; paint(); } else place(); return; }
    const target = resolveHit(scene,klappes,x,y,event.pointerType || 'mouse');
    const elementId = node => node.closest?.('[data-element-id]')?.getAttribute('data-element-id');
    let id = target?.buttonId ?? elementId(element);
    if (!id && element.closest?.('[data-button-id]')) {
      // The transparent touch area can cover a lamp outside the mouse hit radius.
      id = document.elementsFromPoint?.(x,y).map(elementId).find(candidate => records.has(candidate));
    }
    const record = klappes.carried || (target && klappes.occupant(target.id)) ? HELP_CATALOG.COVER
      : target && klappes.fixedClosed(target.id) ? HELP_CATALOG.FIXED_COVER : records.get(id);
    if (!record) { hide(); return; }
    if (record !== current) { current = record; paint(); } else place();
  }
  function setEnabled(value) {
    enabled = Boolean(value);
    try { storage?.setItem('drssim.help.enabled',String(enabled)); } catch {}
    scene.svg.setAttribute('data-help-enabled',String(enabled));
    if (!enabled) hide();
    renderMenu();
  }
  function renderMenu() {
    panel.replaceChildren();
    for (const [key, action] of [['simulation.about', () => { hide(); onAbout(); }], ['help.introduction', () => { hide(); onIntroduction(); }], ['help.descriptions', () => { setEnabled(!enabled); }]]) {
      const {button} = createMenuItem(document,i18n.t(key),{checked:key==='help.descriptions' ? enabled : undefined});
      button.addEventListener('click',()=>{ root.close(); action(); }); panel.append(button);
    }
    if (!panel.hidden) positionMenu();
  }
  function positionMenu() {
    const rect=toggle.getBoundingClientRect();
    panel.style.left=`${Math.max(8,Math.min(rect.left,document.documentElement.clientWidth-panel.offsetWidth-8))}px`;
    panel.style.top=`${rect.bottom+7}px`;
  }
  const root = menuBar.register('help',toggle,{open(){panel.hidden=false;toggle.setAttribute('aria-expanded','true');positionMenu();},close(){panel.hidden=true;toggle.setAttribute('aria-expanded','false');}});
  const options={capture:true,signal:abort.signal};
  view.addEventListener('pointermove',event=>{ if(event.pointerType==='mouse'||contacts.has(event.pointerId)) { if(contacts.has(event.pointerId))contacts.set(event.pointerId,event);at(event); } },options);
  view.addEventListener('pointerdown',event=>{
    if (!toggle.contains(event.target) && !panel.contains(event.target)) root.close();
    if (event.pointerType === 'touch' || event.pointerType === 'pen') contacts.set(event.pointerId,event);
    at(event);
  },options);
  const release = event => { contacts.delete(event.pointerId); const remaining=[...contacts.values()].at(-1); if(remaining)at(remaining);else if(event.pointerType!=='mouse')hide(); };
  view.addEventListener('pointerup',release,options);view.addEventListener('pointercancel',release,options);
  view.addEventListener('blur',dismissPointerHelp,options);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)dismissPointerHelp();},options);
  scene.svg.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse')hide();},{signal:abort.signal});
  view.addEventListener('keydown',event=>{if(event.key==='Escape'){root.close();hide();}},{signal:abort.signal});
  view.addEventListener('resize',()=>{root.close();hide();},{signal:abort.signal});
  const unsubscribe=i18n.subscribe(()=>{renderMenu();paint();}); renderMenu();
  return {
    get enabled() { return enabled; },
    setEnabled,
    positionOverlays: place,
    dismissPointerHelp,
    dispose() {
      abort.abort();
      unsubscribe();
      root.dispose();
      overlays.remove();
      scene.svg.removeAttribute('data-help-enabled');
    },
  };
}
