/** Isolated exercises use the desk's real button events and configured timings. */
export class IntroductionLesson {
  constructor({ page, buttons, timing, now = () => performance.now(), onChange = () => {} }) {
    Object.assign(this, { page, buttons, timing, now, onChange });
    this.done = false; this.accepted = false; this.pending = null; this.hint = null;
    this.unsubscribe = buttons.subscribe(event => this.input(event));
  }
  get expected() { return { 2: ['MGD', 'MD'], 3: ['SD', 'RT'], 4: ['STGD', 'SD'], 5: ['SYIYD', 'SD'] }[this.page]; }
  showInstruction() { if (!this.done && !this.accepted) { this.hint = 'wrong'; this.onChange(); } }
  input(event) {
    if (this.done || this.accepted) return;
    if (event.kind === 'state' && this.pending && !this.pending.ids.every(id => event.pressedIds.includes(id))) {
      this.tick();
      if (!this.accepted) { this.pending = null; this.hint = 'short'; this.onChange(); }
    }
    if (event.kind === 'button-down' && !this.expected.includes(event.buttons[0].key)) { this.hint = 'wrong'; this.onChange(); }
    if (event.kind !== 'pair') return;
    const keys = event.buttons.map(button => button.key);
    if (!this.expected.every(key => keys.includes(key))) { this.pending = null; this.hint = 'wrong'; this.onChange(); return; }
    this.pending = { ids: event.buttons.map(button => button.id), at: this.now() };
    this.onChange();
  }
  tick() {
    if (!this.pending || this.done) return;
    const elapsed = this.now() - this.pending.at;
    const hold = this.page === 3 ? this.timing.routeHoldMs : this.timing.controlHoldMs;
    if (!this.accepted && elapsed >= hold) { this.accepted = true; this.onChange(); }
    const total = this.page === 2 ? hold + this.timing.pointMovementMs : this.page === 3 ? this.timing.routeOperationMs : this.page === 4 ? hold : this.timing.controlOperationMs;
    if (this.accepted && elapsed >= total) { this.done = true; this.hint = null; this.onChange(); }
  }
  dispose() { this.unsubscribe(); this.pending = null; }
}
