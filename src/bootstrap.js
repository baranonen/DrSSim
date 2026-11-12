import { STATIONS } from './station-catalog.js';
import { createOverlays } from './overlays.js';
import { loadTisch } from './tisch.js';
import { ButtonController } from './buttons.js';
import { KlappeController } from './klappes.js';
import { createScene } from './render/scene.js';
import { createMenuBar, createMenuItem } from './menu-bar.js';
import { bindLocalePreference, createI18n, LANGUAGE_OPTIONS, preferredLocale, translateElements } from './i18n.js';

const selection = document.querySelector('#station-selection');
const viewport = document.querySelector('#viewport');
const ui = document.querySelector('#simulation-ui');
const root = document.querySelector('#desk');
const params = new URL(location.href).searchParams;
const stationId = params.get('station') ?? params.get('desk');
const station = STATIONS.find(item => item.id === stationId);

if (station) {
  for (const key of ['tisch', 'graph', 'modelBindings', 'interlocking']) {
    if (station[key]) root.dataset[key] = station[key];
    else delete root.dataset[key];
  }
  if (!station.graph || !station.interlocking) document.querySelector('#trains-toggle').hidden = true;
  if (!station.interlocking) document.querySelector('#failures-toggle').hidden = true;
  viewport.hidden = false;
  ui.hidden = false;
  try {
    await import('./app.js');
  } catch (error) {
    console.error(`Station failed to load: ${station.id}`, error);
    viewport.hidden = true;
    ui.hidden = true;
    showStationSelection(station.id);
  }
} else {
  showStationSelection();
}

function showStationSelection(failedStationId) {
  if (failedStationId) {
    const message = document.createElement('p');
    message.className = 'station-selection-welcome';
    message.dataset.i18n = 'launch.loadError';
    message.setAttribute('role', 'alert');
    selection.querySelector('#launch-form').before(message);
  }
  const i18n = createI18n(preferredLocale(navigator));
  const renderLocale = locale => {
    document.documentElement.lang = locale;
    translateElements(selection, i18n);
  };
  renderLocale(i18n.locale);
  i18n.subscribe(renderLocale);
  bindLocalePreference(i18n);
  bindLaunchLanguageMenu(selection, i18n);
  const overlays = createOverlays({ i18n });
  selection.querySelector('#launch-about').addEventListener('click', overlays.about);

  const form = selection.querySelector('#launch-form');
  const list = form.querySelector('.station-selection-list');

  form.addEventListener('submit', event => {
    event.preventDefault();
    const selectedStationId = new FormData(form).get('station');
    const url = new URL(location.href);
    url.searchParams.delete('desk');
    url.searchParams.set('station', selectedStationId);
    location.assign(url);
  });

  for (const item of STATIONS) {
    const option = document.createElement('label');
    option.className = 'launch-option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'station';
    radio.value = item.id;
    radio.defaultChecked = item.id === (failedStationId ?? STATIONS[0].id);
    radio.required = true;
    const card = document.createElement('span');
    card.className = 'launch-choice station-card';
    const thumbnail = document.createElement('span');
    thumbnail.className = 'desk-thumbnail';
    thumbnail.setAttribute('aria-hidden', 'true');
    thumbnail.inert = true;
    const name = document.createElement('span');
    name.className = 'station-card-name';
    name.textContent = item.name;
    card.append(thumbnail, name);
    option.append(radio, card);
    list.append(option);

    loadTisch(new URL(item.tisch, document.baseURI)).then(desk => {
      const scene = createScene(thumbnail, desk, { buttons: new ButtonController(), klappes: new KlappeController(), i18n });
      scene.setViewportSize(desk.width, desk.height);
      scene.setCamera({ x: 0, y: 0, scale: 1 });
    }).catch(error => console.error(`Desk thumbnail failed: ${item.id}`, error));
  }
  selection.hidden = false;
}

function bindLaunchLanguageMenu(selection, i18n) {
  const container = selection.querySelector('.launch-language');
  const toggle = container.querySelector('#launch-language-toggle');
  const panel = container.querySelector('#launch-language-menu');
  const options = LANGUAGE_OPTIONS.map(({ locale, label }) => {
    const { button, mark } = createMenuItem(document, label, { checked: locale === i18n.locale });
    button.setAttribute('role', 'menuitemradio');
    button.tabIndex = -1;
    button.addEventListener('click', () => {
      menu.close();
      toggle.focus();
      i18n.setLocale(locale);
    });
    panel.append(button);
    return { locale, button, mark };
  });

  const menu = createMenuBar().register('language', toggle, {
    open() {
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      options.find(option => option.locale === i18n.locale).button.focus();
    },
    close() {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    },
  });
  i18n.subscribe(locale => {
    for (const option of options) {
      const checked = option.locale === locale;
      option.button.setAttribute('aria-checked', String(checked));
      option.mark.textContent = checked ? '✓' : '';
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!container.contains(event.target)) menu.close();
  });
  container.addEventListener('focusout', event => {
    // Some browsers blur the focused item when clicking a button without moving focus to it.
    if (event.relatedTarget && !container.contains(event.relatedTarget)) menu.close();
  });
  container.addEventListener('keydown', event => {
    if (panel.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      menu.close();
      toggle.focus();
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const current = options.findIndex(option => option.button === document.activeElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      options[(current + step + options.length) % options.length].button.focus();
    }
  });
}
