import { fieldInstanceId } from './tisch.js';

/** Desk day/night selection is independent of track and interlocking state. */
export function bindDayNightSelection(desk, buttons, visuals, clock) {
  const selectors = new Map();
  const inputs = new Map();
  for (const field of desk.fields) {
    if (field.tile !== 'GE-GU') continue;
    const id = fieldInstanceId(desk.id, field.id);
    const selector = { id, mode: 'day' };
    selectors.set(id, selector);
    inputs.set(`${id}:GE`, { selector, mode: 'night' });
    inputs.set(`${id}:GU`, { selector, mode: 'day' });
  }
  const paint = selector => visuals.apply([
    { elementId: `${selector.id}:mode.night`, value: { mode: selector.mode === 'night' ? 'on' : 'off' } },
    { elementId: `${selector.id}:mode.day`, value: { mode: selector.mode === 'day' ? 'on' : 'off' } },
  ]);
  for (const selector of selectors.values()) paint(selector);
  const unsubscribe = buttons.subscribe(event => {
    clock.setHeldButtons(buttons.enabled ? event.pressedIds : [], { reportEarlyRelease: buttons.enabled && event.kind === 'state' && event.reason === 'release' });
    if (!buttons.enabled) return;
    if (event.kind !== 'button-down') return;
    const input = inputs.get(event.buttons[0].id);
    if (!input) return;
    clock.requestHeldAction(`${input.selector.id}:${input.mode}`, [event.buttons[0].id], clock.config.dayNightHoldMs, () => {
      input.selector.mode = input.mode;
      paint(input.selector);
    });
  });
  return {
    getMode: id => selectors.get(id)?.mode,
    dispose() {
      unsubscribe();
      for (const { selector, mode } of inputs.values()) clock.cancelHeldAction(`${selector.id}:${mode}`);
    },
  };
}

/** Signal and point failures use the shared blink clock. */
export function bindFaultIndicators(desk, visuals, engine) {
  const fields = desk.fields.filter(field => field.tile === 'SAM-MAM');
  const paint = () => {
    const changes = [];
    for (const field of fields) for (const [key, kind] of [['fault.signal', 'signal'], ['fault.point', 'point']]) {
      changes.push({ elementId: `${fieldInstanceId(desk.id, field.id)}:${key}`, value: { mode: engine.faults[kind] ? 'blink' : 'off', color: 'red' } });
    }
    for (const field of desk.fields) if (field.tile === 'SM') {
      const source = engine.getPowerSupply().source;
      for (const [key, value] of [['supply.1', 'mains'], ['supply.2', 'backup']]) changes.push({ elementId: `${fieldInstanceId(desk.id, field.id)}:${key}`, value: { mode: source === value ? 'on' : 'off', color: 'white' } });
    }
    for (const field of desk.fields) if (['BATTERY-60', 'BATTERY-12'].includes(field.tile)) {
      const active = engine.faults[field.tile === 'BATTERY-60' ? 'power60' : 'power12'];
      changes.push({ elementId: `${fieldInstanceId(desk.id, field.id)}:charge`, value: { mode: active ? 'off' : 'on', color: 'white' } },
        { elementId: `${fieldInstanceId(desk.id, field.id)}:discharge`, value: { mode: active ? 'on' : 'off', color: 'red' } });
    }
    if (changes.length) visuals.apply(changes);
  };
  const unsubscribe = engine.subscribe(paint);
  paint();
  return unsubscribe;
}
