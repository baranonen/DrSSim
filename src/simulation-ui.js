import { createMenuBar, bindSubmenuHover, createMenuItem } from './menu-bar.js';
import { LANGUAGE_OPTIONS } from './i18n.js';

export function bindSimulationUI({ simulation, i18n, menuBar = createMenuBar(), onIntroduction = () => {}, onResetCounters = () => {}, onReturnHome = () => {}, document = globalThis.document }) {
  const toggle = document.querySelector('#simulation-toggle'), panel = document.querySelector('#simulation-dropdown');
  const languages = document.querySelector('#simulation-languages');
  const view = document.defaultView;
  let languageButton;
  function hideLanguages() { languages.hidden = true; languageButton?.setAttribute('aria-expanded','false'); }
  function placeLanguages() {
    if (languages.hidden || panel.hidden) return;
    const box = languageButton.getBoundingClientRect(), width = languages.offsetWidth;
    const left = box.right + width + 6 <= document.documentElement.clientWidth - 8 ? box.right + 6 : box.left - width - 6;
    languages.style.left = `${Math.max(8,Math.min(left,document.documentElement.clientWidth-width-8))}px`;
    languages.style.top = `${Math.max(8,Math.min(box.top,document.documentElement.clientHeight-languages.offsetHeight-8))}px`;
  }
  function showLanguages() {
    if (panel.hidden) return;
    languages.hidden = false; languageButton.setAttribute('aria-expanded','true'); placeLanguages();
  }
  function place() {
    if (panel.hidden) return;
    const box = toggle.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(box.left, document.documentElement.clientWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8,Math.min(box.bottom + 7,document.documentElement.clientHeight-panel.offsetHeight-8))}px`;
    placeLanguages();
  }
  const root = menuBar.register('simulation', toggle, {
    open() { panel.hidden = false; toggle.setAttribute('aria-expanded', 'true'); place(); },
    close() { panel.hidden = true; hideLanguages(); toggle.setAttribute('aria-expanded', 'false'); },
  });
  function render() {
    const showingLanguages = !languages.hidden && !panel.hidden;
    panel.replaceChildren();
    languageButton = createMenuItem(document,i18n.t('simulation.language'),{submenu:true}).button;
    languageButton.setAttribute('aria-expanded',String(showingLanguages));
    bindSubmenuHover(languageButton,showLanguages); languageButton.addEventListener('click',showLanguages); panel.append(languageButton);
    languages.replaceChildren();
    for (const {locale,label} of LANGUAGE_OPTIONS) {
      const {button} = createMenuItem(document,label,{checked:locale===i18n.locale}); button.dataset.locale = locale;
      button.setAttribute('role','menuitemradio');
      button.addEventListener('click',()=>{ i18n.setLocale(locale); root.close(); }); languages.append(button);
    }
    languages.hidden = !showingLanguages;
    for (const [key, action, checked] of [
      ['returnHome', () => {
        toggle.focus();
        onReturnHome();
      }],
      ['pause', () => simulation.setPaused(!simulation.paused), simulation.paused],
      ['enableButtonSounds', () => simulation.setButtonSoundsEnabled(!simulation.buttonSoundsEnabled), simulation.buttonSoundsEnabled],
      ['enableBellSounds', () => simulation.setBellSoundsEnabled(!simulation.bellSoundsEnabled), simulation.bellSoundsEnabled],
      ['resetCounters', onResetCounters],
    ]) {
      const {button} = createMenuItem(document,i18n.t(`simulation.${key}`),{checked});
      button.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')hideLanguages();});
      button.addEventListener('focus',hideLanguages);
      button.addEventListener('click', () => { root.close(); action(); }); panel.append(button);
    }
    place();
  }
  const outside = event => { if (!toggle.contains(event.target) && !panel.contains(event.target) && !languages.contains(event.target)) root.close(); };
  const escape = event => { if (event.key === 'Escape') root.close(); };
  view?.addEventListener('pointerdown', outside, true); view?.addEventListener('keydown', escape); view?.addEventListener('resize', place);
  const unsubscribe = simulation.subscribe(render); render();
  const unsubscribeLocale = i18n.subscribe(render);
  panel.addEventListener('scroll',placeLanguages);
  return () => {
    unsubscribe(); unsubscribeLocale(); root.dispose(); panel.replaceChildren(); languages.replaceChildren(); panel.removeEventListener('scroll',placeLanguages);
    view?.removeEventListener('pointerdown', outside, true); view?.removeEventListener('keydown', escape); view?.removeEventListener('resize', place);
  };
}
