/** Shared phase: starting a lamp's blinking does not reset the blink clock. */
export class Taktgeber {
  constructor({ periodMs = 800, epochMs = 0 } = {}) {
    if (!Number.isFinite(periodMs) || periodMs <= 0 || !Number.isFinite(epochMs)) throw new Error('Invalid blink clock.');
    this.periodMs = periodMs;
    this.epochMs = epochMs;
    Object.freeze(this);
  }
  isOn(timeMs) { return Math.floor((timeMs - this.epochMs) / (this.periodMs / 2)) % 2 === 0; }
}
