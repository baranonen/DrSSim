/** Store counters locally in the browser, indexed by desk ID. */
export function bindCounterStorage(engine, deskId, getStorage = () => globalThis.localStorage) {
  const key = `drssim:counters:v1:${deskId}`;
  const names = Object.keys(engine.counters);
  let storage;
  try {
    storage = getStorage();
    const saved = JSON.parse(storage.getItem(key) ?? 'null');
    if (saved && typeof saved === 'object') {
      for (const name of names) if (Number.isSafeInteger(saved[name]) && saved[name] >= 0 && saved[name] < 100000) engine.counters[name] = saved[name];
    }
  } catch { storage = null; }
  let previous = JSON.stringify(engine.counters);
  return engine.subscribe(() => {
    const current = JSON.stringify(engine.counters);
    if (current === previous) return;
    previous = current;
    try { storage?.setItem(key, current); } catch { /* Operation continues when storage is unavailable. */ }
  });
}
