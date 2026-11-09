/** Simplified track relay: energized when clear, dropped when occupied. Physics supplies occupancy separately. */
export class Gleisrelais {
  #occupied = false;
  stuckOccupied = false;
  constructor(id, onChange = () => {}) { this.id = id; this.onChange = onChange; }
  get occupied() { return this.#occupied || this.stuckOccupied; }
  get energized() { return !this.occupied; }
  get clearContact() { return this.energized; }
  get occupiedContact() { return this.occupied; }
  setOccupied(occupied) {
    if (typeof occupied !== 'boolean') throw new Error('Occupancy must be a boolean.');
    if (occupied === this.#occupied) return false;
    const before = this.occupied;
    this.#occupied = occupied;
    if (this.occupied !== before) this.onChange(this);
    return true;
  }
  setStuckOccupied(active) {
    if (typeof active !== 'boolean') throw new Error('Failure state must be a boolean.');
    if (active === this.stuckOccupied) return false;
    const before = this.occupied;
    this.stuckOccupied = active;
    if (this.occupied !== before) this.onChange(this);
    return true;
  }
}

export class Point {
  constructor(id, trackCircuitId, initialBranch, movementMs, motorTimeoutMs = movementMs) {
    Object.assign(this, { id, trackCircuitId, movementMs, motorTimeoutMs, position: initialBranch,
      target: initialBranch, driveDeadline: null,
      lastMotionAt: 0, motorPowerAvailable: true });
    // Measure travel in milliseconds of powered motion from B toward C.
    this.travelMs = initialBranch === 'B' ? 0 : movementMs;
    this.locks = new Set();
    this.unreachable = new Set();
    this.failed = false;
    this.trailed = null;
    this.powerInterrupted = false;
  }
  get moving() { return this.driveDeadline !== null; }
  get targetTravelMs() { return this.target === 'B' ? 0 : this.movementMs; }
  get physicalProgress() { return this.travelMs === null ? null : this.travelMs / this.movementMs; }
  get physicalPosition() {
    if (this.travelMs === 0) return 'B';
    if (this.travelMs === this.movementMs) return 'C';
    return null;
  }
  get completesAt() {
    if (!this.moving) return null;
    if (this.travelMs === null || this.powerInterrupted || this.unreachable.has(this.target)) return this.driveDeadline;
    const remainingMs = Math.abs(this.targetTravelMs - this.travelMs);
    return Math.min(this.driveDeadline, this.lastMotionAt + remainingMs);
  }
  confirmTargetPosition() {
    this.travelMs = this.targetTravelMs;
    this.position = this.target;
    this.failed = false;
  }
  setFailure(branch, active) {
    if (!['B', 'C'].includes(branch) || typeof active !== 'boolean') throw new Error('Invalid point failure.');
    if (this.unreachable.has(branch) === active) return false;
    if (active) {
      this.unreachable.add(branch);
      if (this.position === branch) {
        // Loss of detection does not imply physical movement.
        this.position = null;
        this.failed = true;
      }
    } else {
      this.unreachable.delete(branch);
      if (!this.moving && !this.trailed && this.target === branch && this.physicalPosition === branch) {
        this.confirmTargetPosition();
      }
    }
    return true;
  }
  setMotorPower(now, available) {
    this.advance(now);
    this.motorPowerAvailable = available;
    if (this.moving && !available) this.powerInterrupted = true;
  }
  toggle(now, occupied, override = false, motorPowerAvailable = true) {
    if (this.locks.size || (occupied && !override)) return false;
    this.advance(now);
    this.motorPowerAvailable = motorPowerAvailable;
    this.target = this.target === 'B' ? 'C' : 'B';
    if (!this.trailed) this.failed = false;
    // A point that has not moved can have its current end position selected again.
    if (!this.trailed && this.physicalPosition === this.target && !this.unreachable.has(this.target)) {
      this.confirmTargetPosition();
      this.driveDeadline = null;
      this.powerInterrupted = false;
      return true;
    }
    this.position = null;
    this.powerInterrupted = !motorPowerAvailable;
    this.lastMotionAt = now;
    this.driveDeadline = now + this.motorTimeoutMs;
    return true;
  }
  advance(now) {
    if (!this.moving) return false;
    const completesAt = this.completesAt;
    const elapsedMs = Math.min(now, completesAt) - this.lastMotionAt;
    if (this.motorPowerAvailable && this.travelMs !== null && elapsedMs > 0) {
      const remainingMs = this.targetTravelMs - this.travelMs;
      if (remainingMs !== 0 && this.unreachable.has(this.target) && elapsedMs >= Math.abs(remainingMs)) {
        // The end position is unknown if the drive ran into an obstruction.
        this.travelMs = null;
      } else {
        this.travelMs += Math.sign(remainingMs) * Math.min(elapsedMs, Math.abs(remainingMs));
      }
    }
    this.lastMotionAt = now;
    if (now < completesAt) return false;

    this.driveDeadline = null;
    this.failed = this.powerInterrupted || this.unreachable.has(this.target);
    if (!this.failed) {
      this.confirmTargetPosition();
      this.trailed = null;
    }
    return true;
  }
}

export class Signal {
  constructor(definition) {
    this.id = definition.id;
    this.type = definition.type;
    this.capabilities = definition.capabilities;
    this.aspect = 'stop';
    // Two filaments in one red lamp: 1 main, 2 reserve.
    this.redFilamentFailures = { 1: false, 2: false };
    this.detectedRedFilamentFailures = new Set();
    this.redAuxiliaryTest = false;
    this.substitute = false;
    this.openingPermission = false;
    this.shuntOpening = false;
    this.routeId = null;
    this.shuntCircuit = null;
    this.shuntOccupied = false;
  }
  // Red with an additional movement authority does not qualify as protective stop.
  get atStop() { return this.aspect === 'stop' && !this.substitute; }
  // Combined signals retain red with Hp0+Sh1; standalone shunting signals extinguish red when showing white.
  get redDemand() { return this.aspect === 'stop' || (this.type === 'normal' && this.aspect === 'shunt'); }
  get redMainPowered() { return this.redDemand && !this.redAuxiliaryTest; }
  get redAuxiliaryPowered() { return this.redDemand && (this.redAuxiliaryTest || this.redFilamentFailures[1]); }
  get redFilament() {
    if (this.redMainPowered && !this.redFilamentFailures[1]) return 1;
    if (this.redAuxiliaryPowered && !this.redFilamentFailures[2]) return 2;
    return null;
  }
  get redLit() { return this.redFilament !== null; }
  get redLampFault() { return this.detectedRedFilamentFailures.size > 0; }
  setRedFilamentFailure(filament, active) {
    if (![1, 2].includes(filament) || typeof active !== 'boolean') throw new Error('Invalid red filament failure.');
    if (this.redFilamentFailures[filament] === active) return false;
    this.redFilamentFailures[filament] = active;
    // Fault injection changes physical state; only electrical monitoring updates the indication.
    return true;
  }
  #observeRedFilament(filament) {
    if (this.redFilamentFailures[filament]) this.detectedRedFilamentFailures.add(filament);
    else this.detectedRedFilamentFailures.delete(filament);
  }
  #monitorRed() {
    // Failure and repair are detected only from current through an energized filament.
    if (this.redMainPowered) this.#observeRedFilament(1);
    if (this.redAuxiliaryPowered) this.#observeRedFilament(2);
  }
  grant(routeId) { this.routeId = routeId; this.openingPermission = true; }
  update(canProceed, canShunt = false, shuntOccupied = false) {
    if ((this.aspect === 'proceed' || this.openingPermission) && !canProceed) this.stop({ clearSubstitute: false });
    if (this.shuntOpening && !canShunt) this.stop({ clearSubstitute: false });
    const openNormal = this.openingPermission && canProceed && this.atStop && this.type === 'normal';
    if (openNormal || this.shuntOpening) {
      // Only the reserve red filament is tested before normal green or standalone shunting white.
      this.redAuxiliaryTest = true;
      this.#monitorRed();
      if (this.redFilamentFailures[2]) {
        // The opening chain is still active, allowing the reserve filament test to detect repair.
        return;
      }
      this.aspect = openNormal ? 'proceed' : 'shunt';
      if (this.shuntOpening) this.shuntOccupied = shuntOccupied;
      this.redAuxiliaryTest = false;
      this.shuntOpening = false;
      this.openingPermission = false; // Single-use permission; reevaluation does not reopen the signal.
    } else this.#monitorRed();
  }
  stop({ clearSubstitute = true } = {}) {
    this.aspect = 'stop';
    this.redAuxiliaryTest = false;
    if (clearSubstitute) this.substitute = false;
    this.openingPermission = false;
    this.shuntOpening = false;
    this.routeId = null;
    this.shuntCircuit = null;
    this.shuntOccupied = false;
  }
  shunt(circuitId, occupied) {
    if (!this.capabilities.shunt || !this.atStop || this.shuntOpening) return false;
    this.stop();
    // Configured standalone shunting behavior: Sh1 requires reserve red verification.
    this.shuntOpening = this.type === 'shunting';
    if (!this.shuntOpening) this.aspect = 'shunt';
    this.shuntCircuit = circuitId;
    this.shuntOccupied = occupied;
    return true;
  }
  observeShunt(circuitId, occupied) {
    if (this.aspect !== 'shunt' || circuitId !== this.shuntCircuit) return;
    if (occupied) this.shuntOccupied = true;
    else if (this.shuntOccupied) this.stop({ clearSubstitute: false });
  }
  holdSubstitute() {
    if (!this.capabilities.substitute) return false;
    // Substitute authority is independent of normal route permission and lasts only while held.
    this.substitute = true;
    return true;
  }
}

/** Release the entire route; this model has no overlap or sectional point release. */
export class Route {
  constructor(definition) { this.definition = definition; this.id = definition.id; this.generation = 0; this.reset(); }
  reset() { this.active = false; this.entered = 0; this.cleared = 0; this.firstPointCleared = false; this.sequenceFault = false; this.signalRequested = false; this.signalReadyAt = null; this.buttonIds = []; }
  establish(buttonIds = []) { this.reset(); this.generation++; this.active = true; this.buttonIds = [...buttonIds]; }
  observe(trackCircuitId, occupied) {
    const index = this.definition.releaseTrackCircuits.indexOf(trackCircuitId);
    if (!this.active || index < 0 || this.sequenceFault) return false;
    if (occupied) {
      if (index > this.entered) this.sequenceFault = true;
      else if (index === this.entered) this.entered++;
    } else if (trackCircuitId === this.definition.releasePointCircuit && index < this.entered && !this.firstPointCleared) {
      this.firstPointCleared = true;
      this.cleared = 1;
    }
    return !this.sequenceFault && this.entered === this.definition.releaseTrackCircuits.length && this.firstPointCleared;
  }
}
