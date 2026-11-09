import { Taktgeber } from './takt.js';

export class VisualState {
  constructor({ now, takt = new Taktgeber() } = {}) {
    this.timeMs = 0;
    this.now = now ?? (() => this.timeMs);
    this.records = new Map();
    this.listeners = new Set();
    this.takt = takt;
  }
  register(id, definition, initial) {
    if (this.records.has(id) || !['lamp', 'text', 'counter'].includes(definition.kind)) throw new Error('Invalid or duplicate visual element.');
    const value = initial ?? (definition.kind === 'lamp' ? { mode: 'off', color: definition.color } : definition.kind === 'text' ? { text: definition.default ?? '' } : { value: definition.default ?? 0 });
    this.records.set(id, { definition, value: this.validate(definition, value), intensity: 0, epoch: this.takt.epochMs });
  }
  validate(definition, value) {
    if (!value || typeof value !== 'object') throw new Error('Visual state must be an object.');
    if (definition.kind === 'lamp') {
      if (!['off', 'on', 'blink'].includes(value.mode) || !['yellow', 'green', 'red', 'white'].includes(value.color ?? definition.color)) throw new Error('Invalid lamp state.');
      const periodMs = value.periodMs ?? this.takt.periodMs;
      if (value.mode === 'blink' && (!Number.isFinite(periodMs) || periodMs < 1)) throw new Error('Blink period must be positive.');
      return Object.freeze({ mode: value.mode, color: value.color ?? definition.color, ...(value.mode === 'blink' ? { periodMs } : {}) });
    }
    if (definition.kind === 'text') {
      if (typeof value.text !== 'string') throw new Error('Label must be text.');
      return Object.freeze({ text: value.text });
    }
    if (!Number.isSafeInteger(value.value) || value.value < 0 || String(value.value).length > definition.digits) throw new Error('Counter value exceeds the digit limit.');
    return Object.freeze({ value: value.value });
  }
  get(id) { const record = this.records.get(id); if (!record) throw new Error(`Visual element not found: ${id}`); return { ...record.value, intensity: record.intensity }; }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(ids) { if (ids.length) for (const listener of this.listeners) listener(ids); }
  apply(changes, timeMs = this.now()) {
    const seen = new Set();
    const prepared = changes.map(({ elementId, value }) => {
      const record = this.records.get(elementId);
      if (!record || seen.has(elementId)) throw new Error('Unknown or duplicate visual update.');
      seen.add(elementId);
      return { elementId, record, value: this.validate(record.definition, value) };
    });
    this.renderAt(timeMs);
    const changed = [];
    for (const { elementId, record, value } of prepared) {
      if (JSON.stringify(record.value) === JSON.stringify(value)) continue;
      // Newly blinking lamps join the shared clock; never restart its phase.
      record.value = value;
      changed.push(elementId);
    }
    this.emit(changed);
  }
  renderAt(timeMs) {
    if (!Number.isFinite(timeMs) || timeMs < this.timeMs) throw new Error('Visual time cannot go backwards.');
    const changed = [];
    for (const [id, record] of this.records) {
      if (record.definition.kind !== 'lamp') continue;
      const before = record.intensity;
      let start = this.timeMs;
      const { mode, periodMs } = record.value;
      while (start < timeMs) {
        let end = timeMs, target = mode === 'on' ? 1 : 0;
        if (mode === 'blink') {
          const half = periodMs / 2;
          const phase = Math.floor((start - record.epoch + 1e-7) / half);
          target = phase % 2 === 0 ? 1 : 0;
          end = Math.min(end, record.epoch + (phase + 1) * half);
        }
        const tau = target ? record.definition.riseMs ?? 8.75 : record.definition.fallMs ?? 13.75;
        record.intensity = target + (record.intensity - target) * Math.exp(-(end - start) / tau);
        start = end;
      }
      if (Math.abs(record.intensity - before) > 1e-6) changed.push(id);
    }
    this.timeMs = timeMs;
    this.emit(changed);
  }
  get needsFrame() {
    return [...this.records.values()].some(record => record.definition.kind === 'lamp' && (record.value.mode === 'blink' || Math.abs(record.intensity - (record.value.mode === 'on' ? 1 : 0)) > .001));
  }
}

export function startVisualClock(visuals, { requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame, simulation } = {}) {
  let frame = null;
  const schedule = () => { if (!simulation?.paused && frame === null && visuals.needsFrame) frame = requestFrame(tick); };
  const tick = () => { frame = null; visuals.renderAt(visuals.now()); schedule(); };
  const unsubscribe = visuals.subscribe(schedule);
  const unsubscribeSimulation = simulation?.subscribe(() => {
    if (frame !== null) cancelFrame(frame);
    frame = null; visuals.renderAt(visuals.now()); schedule();
  }) ?? (() => {});
  schedule();
  return () => { unsubscribe(); unsubscribeSimulation(); if (frame !== null) cancelFrame(frame); };
}
