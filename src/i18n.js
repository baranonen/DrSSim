import tr from './locales/tr.js';
import en from './locales/en.js';
import de from './locales/de.js';

export const MESSAGES = Object.freeze({ tr, en, de });
export const LANGUAGE_OPTIONS = Object.freeze([{ locale: 'tr', label: 'Türkçe' }, { locale: 'en', label: 'English' }, { locale: 'de', label: 'Deutsch' }].map(Object.freeze));

function supportedLanguage(tag) {
  if (typeof tag !== 'string') return null;
  const language = tag.trim().toLowerCase().replaceAll('_', '-').split('-')[0];
  return Object.hasOwn(MESSAGES, language) ? language : null;
}

/** Use the browser's first supported preferred language, falling back to English. */
export function detectLocale({ languages = [], language = '' } = {}) {
  const preferences = [...(Array.isArray(languages) ? languages : []), language];
  for (const tag of preferences) {
    const locale = supportedLanguage(tag);
    if (locale) return locale;
  }
  return 'en';
}

function browserStorage() { try { return globalThis.localStorage; } catch { return null; } }
export function preferredLocale(browser, storage = browserStorage()) {
  try { const saved = supportedLanguage(storage?.getItem('drssim.locale')); if (saved) return saved; } catch { /* Private browsing falls back to automatic selection. */ }
  return detectLocale(browser);
}
export function bindLocalePreference(i18n, storage = browserStorage()) {
  const save = locale => { try { storage?.setItem('drssim.locale', locale); } catch { /* Language selection works without storage. */ } };
  save(i18n.locale);
  return i18n.subscribe(save);
}

/** A single translation object changes language without rebuilding the simulation. */
export function createI18n(language = 'en') {
  let locale = supportedLanguage(language) ?? 'en';
  const listeners = new Set();
  return Object.freeze({
    get locale() { return locale; },
    setLocale(language) {
      const next = supportedLanguage(language);
      if (!next || next === locale) return false;
      locale = next; for (const listener of listeners) listener(locale); return true;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    t(key, values = {}) {
      const template = Object.hasOwn(MESSAGES[locale], key) ? MESSAGES[locale][key]
        : Object.hasOwn(MESSAGES.en, key) ? MESSAGES.en[key] : key;
      return template.replace(/\{(\w+)\}/g, (_, name) => {
        if (!Object.hasOwn(values, name)) throw new Error(`Missing translation parameter: ${name}`);
        return String(values[name]);
      });
    },
  });
}

export function translateElements(root, i18n) {
  for (const element of root.querySelectorAll('[data-i18n]')) {
    element.textContent = i18n.t(element.dataset.i18n);
  }
}
