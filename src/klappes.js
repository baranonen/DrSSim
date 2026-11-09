/** Cover ownership and movement, independent of the circuit model and DOM. */
export class KlappeController {
  constructor({ onChange = () => {} } = {}) {
    this.targets = new Map();
    this.locations = new Map();
    this.occupants = new Map();
    this.carried = null;
    this.openFixed = new Set();
    this.onChange = onChange;
    this.listeners = new Set();
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  #movement(kind, id) { for (const listener of this.listeners) listener(Object.freeze({ kind, id })); }

  registerTarget(target) {
    if (!target?.id || this.targets.has(target.id)) throw new Error('Invalid or duplicate cover target ID.');
    if (!['storage', 'button'].includes(target.kind)) throw new Error('A cover can only be placed on a button or storage slot.');
    this.targets.set(target.id, Object.freeze({ ...target }));
    if (target.fixedKlappe === 'hexagon') this.onChange();
  }

  add(id, targetId) {
    if (!id || this.locations.has(id)) throw new Error('Invalid or duplicate cover ID.');
    if (!this.#canPlace(targetId)) throw new Error('An empty target accepting a regular cover is required.');
    this.locations.set(id, targetId);
    this.occupants.set(targetId, id);
    this.onChange();
  }

  pickUp(id) {
    if (this.carried || !this.locations.has(id)) return false;
    const origin = this.locations.get(id);
    if (!origin) return false;
    this.occupants.delete(origin);
    this.locations.set(id, null);
    this.carried = Object.freeze({ id, origin });
    this.onChange();
    this.#movement('pickup',id);
    return true;
  }

  place(targetId) {
    if (!this.carried || !this.#canPlace(targetId)) return false;
    const { id } = this.carried;
    this.locations.set(id, targetId);
    this.occupants.set(targetId, id);
    this.carried = null;
    this.onChange();
    this.#movement('place',id);
    return true;
  }

  cancel() {
    return this.carried ? this.place(this.carried.origin) : false;
  }

  drop(targetId) {
    if (!this.carried) return false;
    return this.place(targetId) || this.cancel();
  }

  #canPlace(targetId) {
    const target = this.targets.get(targetId);
    return !!target && target.fixedKlappe !== 'hexagon' && !this.occupants.has(targetId);
  }

  fixedClosed(targetId) { return this.targets.get(targetId)?.fixedKlappe === 'hexagon' && !this.openFixed.has(targetId); }
  liftFixed(targetId) {
    if (!this.fixedClosed(targetId)) return false;
    this.closeAllFixed();
    this.openFixed.add(targetId); this.onChange(); this.#movement('fixed-open',targetId); return true;
  }
  closeFixed(targetId) {
    if (!this.openFixed.delete(targetId)) return false;
    this.onChange(); this.#movement('fixed-close',targetId); return true;
  }
  closeAllFixed() { for (const id of [...this.openFixed]) this.closeFixed(id); }

  occupant(targetId) { return this.occupants.get(targetId) ?? null; }
  isCovered(buttonId) {
    return [...this.targets.values()].some(target => target.buttonId === buttonId && (this.occupants.has(target.id) || this.fixedClosed(target.id)));
  }
}
