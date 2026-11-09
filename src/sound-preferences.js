const KEY = 'drssim.sound';
function browserStorage() { try { return globalThis.localStorage; } catch { return null; } }

export function loadSoundPreferences(storage = browserStorage()) {
  let saved;
  try { saved = JSON.parse(storage?.getItem(KEY) ?? 'null'); } catch { /* Invalid or restricted storage falls back to defaults. */ }
  return Object.fromEntries(['buttonSoundsEnabled','bellSoundsEnabled'].map(name => [name, typeof saved?.[name] === 'boolean' ? saved[name] : true]));
}

export function bindSoundPreferences(simulation, storage = browserStorage()) {
  let previous;
  const save = () => {
    const current = JSON.stringify({ buttonSoundsEnabled: simulation.buttonSoundsEnabled, bellSoundsEnabled: simulation.bellSoundsEnabled });
    if (current === previous) return;
    previous = current;
    try { storage?.setItem(KEY,current); } catch { /* Keep the session preference when storage is unavailable. */ }
  };
  save();
  return simulation.subscribe(save);
}
