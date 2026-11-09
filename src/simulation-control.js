/** Simulation time is independent of wall time; paused time is never processed later. */
export class SimulationControl {
  constructor({ now = () => performance.now(), buttonSoundsEnabled = true, bellSoundsEnabled = true } = {}) {
    this.sourceNow = now; this.origin = now(); this.offset = 0; this.paused = false;
    this.pausedAt = null; this.buttonSoundsEnabled = buttonSoundsEnabled; this.bellSoundsEnabled = bellSoundsEnabled; this.listeners = new Set();
  }
  now = () => (this.paused ? this.pausedAt : this.sourceNow()) - this.origin - this.offset;
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  setPaused(paused) {
    if (paused === this.paused) return;
    if (paused) this.pausedAt = this.sourceNow();
    else { this.offset += this.sourceNow() - this.pausedAt; this.pausedAt = null; }
    this.paused = paused; this.#publish();
  }
  get soundEnabled() { return this.buttonSoundsEnabled || this.bellSoundsEnabled; }
  setSoundEnabled(enabled) {
    if (enabled === this.buttonSoundsEnabled && enabled === this.bellSoundsEnabled) return;
    this.buttonSoundsEnabled = enabled; this.bellSoundsEnabled = enabled; this.#publish();
  }
  setButtonSoundsEnabled(enabled) {
    if (enabled === this.buttonSoundsEnabled) return;
    this.buttonSoundsEnabled = enabled; this.#publish();
  }
  setBellSoundsEnabled(enabled) {
    if (enabled === this.bellSoundsEnabled) return;
    this.bellSoundsEnabled = enabled; this.#publish();
  }
  #publish() { for (const listener of this.listeners) listener(); }
}
