import { Gleisrelais, Point, Signal, Route } from './equipment.js';
import { Taktgeber } from '../takt.js';

const find = (map, id, label) => { const value = map.get(id); if (!value) throw new Error(`${label} not found: ${id}`); return value; };

/** Operational behavior; this does not reproduce the researched relay and contact circuits. */
export class Interlocking {
  constructor(graph, config, { now = () => 0 } = {}) {
    this.graph = graph; this.config = config; this.now = now;
    this.timeMs = 0;
    this.takt = new Taktgeber({ periodMs: config.taktPeriodMs });
    this.listeners = new Set(); this.heldButtons = new Set(); this.substitutePairs = new Map();
    this.counters = { MYD: 0, SYIYD: 0, YSGD: 0, TCS: 0 };
    this.faults = { signal: false, point: false, power60: false, power12: false };
    this.manualFaults = { ...this.faults };
    this.powerFailures = { mains: false, backup: false, rectifier60: false, rectifier12: false };
    this.alarms = { ...this.faults };
    this.alarmSources = new Map(Object.keys(this.alarms).map(kind => [kind, new Set()]));
    this.gleisrelais = new Map();
    for (const edge of graph.edges) for (const section of edge.trackCircuits) if (!this.gleisrelais.has(section.id)) {
      this.gleisrelais.set(section.id, new Gleisrelais(section.id, relay => this.#occupancyChanged(relay)));
    }
    this.points = new Map(graph.nodes.map(node => {
      const initialBranch = node.kind === 'derailer' ? (node.derailingBranch ?? 'B') : config.initialPointBranch;
      const point = new Point(node.id, config.pointTrackCircuits[node.id], initialBranch,
        config.pointMovementMs, config.pointMotorTimeoutMs);
      return [node.id, point];
    }));
    this.signals = new Map(graph.edges.flatMap(edge => edge.signals.filter(item => item.type !== 'EndOfShunting').map(item => {
      const signal = graph.getSignal(item.id); return [signal.id, new Signal(signal)];
    })));
    this.routes = new Map(config.routes.map(definition => [definition.id, new Route(definition)]));
    this.continuousOperations = new Map((config.continuousOperations ?? []).map(definition => [definition.id, { definition, active: false, needed: new Set() }]));
    this.routeRequests = new Map();
    this.commandRequests = new Map();
    this.heldActions = new Map();
    this.dispatchingCommand = false;
    this.feedbackListeners = new Set();
  }
  getPowerSupply() {
    const f = this.powerFailures;
    const source = !f.mains ? 'mains' : !f.backup ? 'backup' : 'none';
    return Object.freeze({ source, pointsPowerAvailable: source === 'mains' || (source === 'backup' && this.config.powerSupply?.backupSupportsPoints === true),
      charging60: source !== 'none' && (source !== 'backup' || this.config.powerSupply?.backupFeedsRectifiers !== false) && !f.rectifier60, charging12: source !== 'none' && (source !== 'backup' || this.config.powerSupply?.backupFeedsRectifiers !== false) && !f.rectifier12,
      failures: Object.freeze({ ...f }) });
  }
  setPowerFailure(id, active) {
    this.advanceTo();
    if (!Object.hasOwn(this.powerFailures, id) || typeof active !== 'boolean') throw new Error('Invalid power supply failure.');
    if (this.powerFailures[id] === active) return false;
    this.powerFailures[id] = active;
    const motorPower = this.getPowerSupply().pointsPowerAvailable;
    for (const point of this.points.values()) point.setMotorPower(this.timeMs, motorPower);
    this.#publish();
    return true;
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  subscribeFeedback(listener) { this.feedbackListeners.add(listener); return () => this.feedbackListeners.delete(listener); }
  #publish() {
    if (this.dispatchingCommand) return;
    this.#updateCommands(); this.#updateHeldActions(); this.#updateRouteRequests(); this.#updateSignals(); this.#updateContinuous(); this.#refreshFaults();
    for (const listener of this.listeners) listener();
  }
  #clear(id) { return find(this.gleisrelais, id, 'Gleisrelais').clearContact; }
  getPoint(id) {
    const p = find(this.points, id, 'Point');
    return Object.freeze({ id, position: p.position, physicalPosition: p.physicalPosition, physicalProgress: p.physicalProgress, target: p.target, moving: p.moving && this.getPowerSupply().pointsPowerAvailable, driveActive: p.moving, motorEnergized: p.moving && this.getPowerSupply().pointsPowerAvailable, failed: p.failed, trailed: p.trailed, unreachable: Object.freeze([...p.unreachable]), completesAt: p.completesAt, occupied: !this.#clear(p.trackCircuitId), locks: Object.freeze([...p.locks]) });
  }
  /** A wheel forces the blades from the unselected trailing branch. */
  trailPoint(id, entryBranch) {
    const point = find(this.points, id, 'Point');
    if (this.graph.getNode(id).kind === 'derailer') return false;
    if (!['B','C'].includes(entryBranch) || point.moving || !point.position || point.position === entryBranch || point.trailed) return false;
    point.trailed = Object.freeze({ previousPosition: point.position, entryBranch });
    const displacedTravelMs = point.movementMs * 0.8;
    point.travelMs = entryBranch === 'C' ? displacedTravelMs : point.movementMs - displacedTravelMs;
    point.position = null;
    point.failed = true;
    this.counters.TCS = (this.counters.TCS + 1) % 100000;
    this.#publish();
    return true;
  }
  getSignal(id) {
    const s = find(this.signals, id, 'Signal');
    return Object.freeze({ id, aspect: s.aspect,
      redFilamentFailures: Object.freeze({ ...s.redFilamentFailures }),
      detectedRedFilamentFailures: Object.freeze([...s.detectedRedFilamentFailures].sort()),
      redLampFault: s.redLampFault, redLit: s.redLit, redFilament: s.redFilament,
      redMainPowered: s.redMainPowered, redAuxiliaryPowered: s.redAuxiliaryPowered, redAuxiliaryTest: s.redAuxiliaryTest,
      substitute: s.substitute, atStop: s.atStop, openingPermission: s.openingPermission, shuntOpening: s.shuntOpening });
  }
  getRoute(id) {
    const r = find(this.routes, id, 'Route');
    return Object.freeze({ id, pending: this.routeRequests.has(id), active: r.active, awaitingRelease: r.active && !r.signalRequested, entered: r.entered, cleared: r.cleared, firstPointCleared: r.firstPointCleared, sequenceFault: r.sequenceFault });
  }
  getContinuousOperation(id) { const mode = find(this.continuousOperations, id, 'Continuous operation'); return { id, active: mode.active }; }
  #continuousSignal(id) { return [...this.continuousOperations.values()].some(m => m.active && [m.definition.entryRouteId, m.definition.exitRouteId].some(r => this.routes.get(r).definition.startSignalId === id)); }
  requestContinuous(command, id, targetId, buttonIds) {
    this.advanceTo();
    const mode = find(this.continuousOperations, id, 'Continuous operation'), d = mode.definition;
    if (targetId !== d.targetId || !['DISD','DGBD'].includes(command)) return false;
    const entry = this.routes.get(d.entryRouteId), exit = this.routes.get(d.exitRouteId);
    const valid = () => command === 'DISD' ? !mode.active && entry.active && this.signals.get(entry.definition.startSignalId).aspect === 'proceed' : mode.active;
    if (!valid()) return false;
    const key = `continuous:${id}`;
    if (this.commandRequests.has(key) || buttonIds.length !== 2 || !buttonIds.every(button => this.heldButtons.has(button))) return false;
    const perform = () => {
      if (command === 'DISD') {
        mode.active = true; mode.needed = new Set([d.exitRouteId]);
        for (const [pointId, branch] of Object.entries({...entry.definition.points, ...exit.definition.points})) if (this.points.get(pointId).position === branch) this.points.get(pointId).locks.add(`continuous:${id}`);
      } else {
        mode.active = false; mode.needed.clear();
        for (const routeId of [d.entryRouteId,d.exitRouteId]) {
          const req = this.routeRequests.get(routeId); if (req?.continuousId === id) this.routeRequests.delete(routeId);
        }
        for (const point of this.points.values()) point.locks.delete(`continuous:${id}`);
      }
    };
    this.commandRequests.set(key, { command, id, buttonIds: [...buttonIds], valid, perform, accepted: false, acceptAt: this.timeMs + this.config.continuousHoldMs, executeAt: this.timeMs + this.config.continuousOperationMs });
    this.#publish();
    return true;
  }
  #updateContinuous() {
    for (const mode of this.continuousOperations.values()) if (mode.active) {
      for (const routeId of [mode.definition.entryRouteId, mode.definition.exitRouteId]) for (const [pointId, branch] of Object.entries(this.routes.get(routeId).definition.points)) if (this.points.get(pointId).position === branch) this.points.get(pointId).locks.add(`continuous:${mode.definition.id}`);
      for (const routeId of mode.needed) {
      const route = this.routes.get(routeId);
      if (route.active) { mode.needed.delete(routeId); continue; }
      if (!this.routeRequests.has(routeId) && this.#canEstablish(route)) {
        this.routeRequests.set(routeId, { buttonIds: [], continuousId: mode.definition.id, acceptAt: this.timeMs + this.config.routeHoldMs, signalAt: this.timeMs + this.config.routeOperationMs });
      }
    }
    }
  }
  get nextDeadline() {
    const deadlines = [...this.points.values()].filter(p => p.moving).map(p => p.completesAt);
    for (const request of this.routeRequests.values()) deadlines.push(request.acceptAt);
    for (const request of this.commandRequests.values()) deadlines.push(request.accepted ? request.executeAt : request.acceptAt);
    for (const action of this.heldActions.values()) deadlines.push(action.dueAt);
    for (const route of this.routes.values()) if (route.active && !route.signalRequested &&
      (route.signalReadyAt > this.timeMs || route.buttonIds.every(id => !this.heldButtons.has(id)))) deadlines.push(route.signalReadyAt);
    return deadlines.length ? Math.min(...deadlines) : null;
  }
  advanceTo(timeMs = this.now()) {
    // Scheduled commands execute at their event time even if the browser callback is late.
    if (this.dispatchingCommand) return;
    if (!Number.isFinite(timeMs) || timeMs < this.timeMs) throw new Error('Interlocking time cannot go backwards.');
    // Process each stage at its simulation time even if the browser callback is late.
    while (this.nextDeadline !== null && this.nextDeadline <= timeMs) {
      this.timeMs = this.nextDeadline;
      for (const point of this.points.values()) point.advance(this.timeMs);
      this.#publish();
    }
    this.timeMs = timeMs;
    for (const point of this.points.values()) point.advance(timeMs);
  }
  requestHeldAction(key, buttonIds, holdMs, action) {
    this.advanceTo();
    if (this.heldActions.has(key) || !buttonIds.length || !buttonIds.every(id => this.heldButtons.has(id))) return false;
    if (!Number.isFinite(holdMs) || holdMs < 0 || typeof action !== 'function') throw new Error('Invalid hold operation.');
    this.heldActions.set(key, { buttonIds: [...buttonIds], dueAt: this.timeMs + holdMs, action });
    this.#publish();
    return true;
  }
  cancelHeldAction(key) {
    if (this.heldActions.delete(key)) this.#publish();
  }
  #updateHeldActions() {
    for (const [key, item] of this.heldActions) {
      if (!item.buttonIds.every(id => this.heldButtons.has(id))) this.heldActions.delete(key);
      else if (this.timeMs >= item.dueAt) { this.heldActions.delete(key); item.action(); }
    }
  }
  #canShunt(id) {
    const signal = find(this.signals, id, 'Signal');
    return signal.capabilities.shunt && signal.atStop && !this.#mustStayRed(id) &&
      this.#pointsReady(this.config.shuntConditions?.[id]?.points ?? {}) && this.#nextShuntCircuit(id) !== null;
  }
  requestCommand(command, id, buttonIds, { subjectKind = 'signal' } = {}) {
    this.advanceTo();
    const key = `${command}:${command === 'SYIYD' ? subjectKind + ':' : ''}${id}`;
    if (this.commandRequests.has(key) || buttonIds.length !== 2 || !buttonIds.every(id => this.heldButtons.has(id))) return false;
    let valid, perform;
    if (command === 'MGD' || command === 'MYD') {
      const point = find(this.points, id, 'Point'), target = point.target;
      valid = () => point.target === target && !point.locks.size && (command === 'MYD' || this.#clear(point.trackCircuitId))
        && this.#pointDependenciesReady(id, target === 'B' ? 'C' : 'B');
      perform = () => this.togglePoint(id, { overrideOccupancy: command === 'MYD' });
    } else if (command === 'STGD') {
      find(this.signals, id, 'Signal');
      valid = () => !this.#continuousSignal(id);
      perform = () => this.stopSignal(id);
    } else if (command === 'SGD') {
      valid = () => !find(this.signals, id, 'Signal').shuntOpening && this.#canShunt(id);
      perform = () => this.requestShunt(id);
    } else if (command === 'SYIYD') {
      if (!['signal', 'route-target'].includes(subjectKind)) return false;
      const routes = [...this.routes.values()].filter(route => route.active &&
        (subjectKind === 'signal'
          ? route.definition.kind === 'entry' && route.definition.startSignalId === id
          : route.definition.kind === 'exit' && route.definition.target.targetId === id))
        .map(route => ({ route, generation: route.generation }));
      // A shared exit target must select exactly one established route.
      valid = () => routes.length === 1 && routes.every(({ route, generation }) =>
        route.active && route.generation === generation &&
        !this.#continuousSignal(route.definition.startSignalId) &&
        this.signals.get(route.definition.startSignalId).atStop);
      perform = () => { this.#release(routes[0].route); this.#publish(); };
    } else if (command === 'YSGD') {
      const signal = find(this.signals, id, 'Signal');
      valid = () => signal.capabilities.substitute && !this.substitutePairs.has(id);
      perform = () => this.holdSubstitute(id, buttonIds);
    } else return false;
    if (!valid()) return false;
    const hold = command === 'YSGD' ? this.config.substituteHoldMs : this.config.controlHoldMs;
    const total = ['MGD','MYD','YSGD','STGD','SGD'].includes(command) ? hold : this.config.controlOperationMs;
    this.commandRequests.set(key, { command, id, buttonIds: [...buttonIds], valid, perform, accepted: false, acceptAt: this.timeMs + hold, executeAt: this.timeMs + total });
    this.#publish();
    return true;
  }
  #updateCommands() {
    for (const [key, item] of this.commandRequests) {
      if (((!item.accepted || item.command === 'YSGD') && !item.buttonIds.every(id => this.heldButtons.has(id))) || !item.valid()) {
        this.commandRequests.delete(key);
        continue;
      }
      if (this.timeMs >= item.acceptAt) item.accepted = true;
      if (item.accepted && this.timeMs >= item.executeAt) {
        this.commandRequests.delete(key);
        this.dispatchingCommand = true;
        try { item.perform(); } finally { this.dispatchingCommand = false; }
      }
    }
  }
  togglePoint(id, { overrideOccupancy = false } = {}) {
    this.advanceTo();
    const point = find(this.points, id, 'Point');
    if (!this.#pointDependenciesReady(id, point.target === 'B' ? 'C' : 'B')) return false;
    const accepted = point.toggle(this.timeMs, !this.#clear(point.trackCircuitId), overrideOccupancy, this.getPowerSupply().pointsPowerAvailable);
    if (accepted) this.#publish();
    return accepted;
  }
  #pointDependenciesReady(id, target) {
    // Auxiliary occupancy override never bypasses the dependent end-position checks.
    return this.#pointsReady(this.config.pointDependencies?.[id]?.[target] ?? {});
  }
  #pointsReady(points) {
    return Object.entries(points).every(([id, branch]) => {
      const p = find(this.points, id, 'Point'); return !p.moving && p.position === branch;
    });
  }
  #ready(route, establishing = false) {
    return this.#pointsReady(route.points) && (establishing ? route.trackCircuits : route.releaseTrackCircuits).every(id => this.#clear(id))
      && route.flankTrackCircuits.every(id => this.#clear(id)) && route.stopSignals.every(id => {
      const signal = find(this.signals, id, 'Signal');
      // Protection requires both a stop command and an illuminated red aspect.
      return signal.atStop && signal.redLit;
    });
  }
  #canEstablish(route) {
    const definition = route.definition;
    const signal = find(this.signals, definition.startSignalId, 'Signal');
    if (route.active || !signal.atStop || !this.#ready(definition, true) || this.#mustStayRed(signal.id)) return false;
    for (const other of this.routes.values()) if (other.active) {
      const active = other.definition;
      const usesFlankSpace = definition.releaseTrackCircuits.some(tc => active.flankTrackCircuits.includes(tc))
        || active.releaseTrackCircuits.some(tc => definition.flankTrackCircuits.includes(tc));
      if (active.startSignalId === signal.id || definition.releaseTrackCircuits.some(tc => active.releaseTrackCircuits.includes(tc))
        || definition.stopSignals.includes(active.startSignalId) || usesFlankSpace) return false;
    }
    return true;
  }
  requestRoute(id, buttonIds = []) {
    this.advanceTo();
    const route = find(this.routes, id, 'Route');
    if (this.#continuousSignal(route.definition.startSignalId) || this.routeRequests.has(id) || !this.#canEstablish(route) || !buttonIds.every(id => this.heldButtons.has(id))) return false;
    // API requests use the same timing and satisfy the contact hold time automatically.
    this.routeRequests.set(id, { buttonIds: [...buttonIds], acceptAt: this.timeMs + this.config.routeHoldMs, signalAt: this.timeMs + this.config.routeOperationMs });
    this.#publish();
    return true;
  }
  #updateRouteRequests() {
    for (const [id, request] of this.routeRequests) {
      const route = this.routes.get(id);
      if (!request.buttonIds.every(id => this.heldButtons.has(id)) || !this.#canEstablish(route)) {
        this.routeRequests.delete(id);
      } else if (this.timeMs >= request.acceptAt) {
        this.routeRequests.delete(id);
        route.establish(request.buttonIds);
        if (request.continuousId) this.continuousOperations.get(request.continuousId)?.needed.delete(id);
        route.signalReadyAt = request.signalAt;
        for (const pointId of Object.keys(route.definition.points)) find(this.points, pointId, 'Point').locks.add(id);
      }
    }
  }
  #updateSignals() {
    for (const route of this.routes.values()) if (route.active && !route.signalRequested) {
      const signal = find(this.signals, route.definition.startSignalId, 'Signal');
      if (!signal.atStop || !this.#ready(route.definition) || route.entered || route.sequenceFault) route.signalRequested = true;
      else if (this.timeMs >= route.signalReadyAt && route.buttonIds.every(id => !this.heldButtons.has(id))) {
        route.signalRequested = true;
        signal.grant(route.id);
      }
    }
    for (const signal of this.signals.values()) {
      const route = signal.routeId ? this.routes.get(signal.routeId) : null;
      const canShunt = signal.shuntOpening && this.#canShunt(signal.id) &&
        this.#nextShuntCircuit(signal.id) === signal.shuntCircuit;
      signal.update(!!route?.active && this.#ready(route.definition), canShunt,
        canShunt && !this.#clear(signal.shuntCircuit));
    }
  }
  #mustStayRed(id) { return [...this.routes.values()].some(route => route.active && route.definition.stopSignals.includes(id)); }
  stopSignal(id) {
    this.advanceTo();
    for (const [key, item] of this.commandRequests) if (item.id === id && ['SGD','YSGD'].includes(item.command)) this.commandRequests.delete(key);
    for (const [routeId] of this.routeRequests) if (this.routes.get(routeId).definition.startSignalId === id) this.routeRequests.delete(routeId);
    find(this.signals, id, 'Signal').stop();
    for (const route of this.routes.values()) if (route.active && route.definition.startSignalId === id) route.signalRequested = true;
    this.substitutePairs.delete(id);
    this.#publish();
    return true;
  }
  // Find the first circuit in the signal direction, traversing adjacent edges and selected points as needed.
  #nextShuntCircuit(id) {
    const signal = this.graph.getSignal(id);
    let edge = this.graph.getEdge(signal.edgeId), pos = signal.atM, towards = signal.towards;
    const visited = new Set();
    while (true) {
      const key = `${edge.id}:${towards}`;
      if (visited.has(key)) return null;
      visited.add(key);
      const sections = edge.trackCircuits.filter(section => towards === 'B' ? section.toM > pos : section.fromM < pos)
        .sort((a, b) => towards === 'B' ? a.fromM - b.fromM : b.toM - a.toM);
      if (sections.length) return sections[0].id;
      let next = edge.ends[towards];
      if (next.kind === 'point') {
        const point = this.getPoint(next.nodeId);
        if (point.moving || !point.position) return null;
        next = this.graph.getPointExit(next.nodeId, next.port, point.position);
      }
      if (!next?.edgeId) return null;
      edge = this.graph.getEdge(next.edgeId);
      pos = next.end === 'A' ? 0 : edge.lengthM;
      towards = next.end === 'A' ? 'B' : 'A';
    }
  }
  requestShunt(id) {
    this.advanceTo();
    const points = this.config.shuntConditions?.[id]?.points ?? {};
    if (this.#mustStayRed(id) || !this.#pointsReady(points)) return false;
    const circuitId = this.#nextShuntCircuit(id);
    if (!circuitId) return false;
    const accepted = find(this.signals, id, 'Signal').shunt(circuitId, !this.#clear(circuitId));
    if (accepted) this.#publish();
    return accepted;
  }
  holdSubstitute(id, buttonIds) {
    this.advanceTo();
    if (this.substitutePairs.has(id) || buttonIds.length !== 2 || !buttonIds.every(button => this.heldButtons.has(button))) return false;
    const accepted = find(this.signals, id, 'Signal').holdSubstitute();
    if (accepted) {
      this.substitutePairs.set(id, [...buttonIds]);
      this.#publish();
    }
    return accepted;
  }
  setHeldButtons(ids, { reportEarlyRelease = false } = {}) {
    this.advanceTo();
    const next = new Set(ids);
    const released = item => item.buttonIds.some(id => this.heldButtons.has(id) && !next.has(id));
    const tooShort = reportEarlyRelease && (
      [...this.routeRequests.values()].some(item => this.timeMs < item.acceptAt && released(item)) ||
      [...this.commandRequests.values()].some(item => !item.accepted && this.timeMs < item.acceptAt && released(item)) ||
      [...this.heldActions.values()].some(item => this.timeMs < item.dueAt && released(item))
    );
    this.heldButtons = next;
    let changed = false;
    for (const [id, pair] of this.substitutePairs) if (!pair.every(button => this.heldButtons.has(button))) {
      find(this.signals, id, 'Signal').substitute = false;
      this.substitutePairs.delete(id);
      changed = true;
    }
    if (changed || this.commandRequests.size || this.heldActions.size || this.routeRequests.size || [...this.routes.values()].some(route => route.active && !route.signalRequested)) this.#publish();
    if (tooShort) for (const listener of this.feedbackListeners) listener(Object.freeze({ kind: 'hold-too-short' }));
  }
  #refreshFaults() {
    for (const kind of Object.keys(this.faults)) {
      const sources = new Set(this.manualFaults[kind] ? ['manual'] : []);
      if (kind === 'power60' || kind === 'power12') {
        const power = this.getPowerSupply(), rectifier = kind === 'power60' ? 'rectifier60' : 'rectifier12';
        if (this.powerFailures[rectifier]) sources.add(rectifier);
        if (power.source === 'none') sources.add('no-ac-source');
        if (power.source === 'backup' && this.config.powerSupply?.backupFeedsRectifiers === false) sources.add('backup-no-charger');
      }
      if (kind === 'signal') for (const signal of this.signals.values()) {
        for (const filament of signal.detectedRedFilamentFailures) sources.add(`${signal.id}:red:${filament}`);
      }
      if (kind === 'point') for (const point of this.points.values()) if (point.failed) sources.add(point.id);
      if ([...sources].some(id => !this.alarmSources.get(kind).has(id))) this.alarms[kind] = true;
      if (!sources.size) this.alarms[kind] = false;
      this.alarmSources.set(kind, sources);
      this.faults[kind] = sources.size > 0;
    }
  }
  setFault(kind, active) {
    if (!Object.hasOwn(this.manualFaults, kind) || typeof active !== 'boolean') throw new Error('Invalid failure indication.');
    if (this.manualFaults[kind] === active) return false;
    this.manualFaults[kind] = active;
    this.#publish();
    return true;
  }
  resetAllFailures() {
    this.advanceTo();
    for (const signal of this.signals.values()) {
      for (const filament of [1, 2]) {
        if (signal.redFilamentFailures[filament]) this.setSignalRedFilamentFailure(signal.id, filament, false);
      }
    }
    for (const point of this.points.values()) {
      for (const branch of point.unreachable) this.setPointFailure(point.id, branch, false);
    }
    for (const relay of this.gleisrelais.values()) {
      if (relay.stuckOccupied) this.setTrackCircuitFailure(relay.id, false);
    }
    for (const [kind, active] of Object.entries(this.manualFaults)) {
      if (active) this.setFault(kind, false);
    }
    for (const [id, active] of Object.entries(this.powerFailures)) {
      if (active) this.setPowerFailure(id, false);
    }
  }
  acknowledgeAlarm(kind) {
    if (!Object.hasOwn(this.alarms, kind)) throw new Error('Invalid alarm group.');
    this.alarms[kind] = false;
    this.#publish();
  }
  setSignalRedFilamentFailure(id, filament, active) {
    this.advanceTo();
    const signal = find(this.signals, id, 'Signal');
    if (!signal.setRedFilamentFailure(filament, active)) return false;
    this.#publish();
    return true;
  }
  setPointFailure(id, branch, active) {
    this.advanceTo();
    const point = find(this.points, id, 'Point');
    if (!point.setFailure(branch, active)) return false;
    this.#publish();
    return true;
  }
  setTrackCircuitFailure(id, active) {
    this.advanceTo();
    const changed = find(this.gleisrelais, id, 'Gleisrelais').setStuckOccupied(active);
    if (changed) this.#publish();
    return changed;
  }
  resetCounters() {
    for (const name of Object.keys(this.counters)) this.counters[name] = 0;
    this.#publish();
  }
  pressGroup(command) {
    if (!Object.hasOwn(this.counters, command)) return;
    this.counters[command] = (this.counters[command] + 1) % 100000;
    this.#publish();
  }
  #release(route) {
    for (const id of Object.keys(route.definition.points)) find(this.points, id, 'Point').locks.delete(route.id);
    find(this.signals, route.definition.startSignalId, 'Signal').stop({ clearSubstitute: false });
    route.reset();
  }
  setTrackOccupied(id, occupied) {
    this.advanceTo();
    return find(this.gleisrelais, id, 'Gleisrelais').setOccupied(occupied);
  }
  #occupancyChanged(relay) {
    for (const signal of this.signals.values()) signal.observeShunt(relay.id, relay.occupied);
    for (const route of this.routes.values()) {
      if (route.active && relay.occupied && route.definition.releaseTrackCircuits.includes(relay.id)) route.signalRequested = true;
      if (route.observe(relay.id, relay.occupied)) {
        for (const mode of this.continuousOperations.values()) if (mode.active && [mode.definition.entryRouteId,mode.definition.exitRouteId].includes(route.id)) { mode.needed.add(route.id); }
        this.#release(route);
      }
    }
    this.#publish();
  }
  dispose() {
    this.commandRequests.clear();
    this.heldActions.clear();
    this.routeRequests.clear();
    for (const signal of this.signals.values()) if (signal.shuntOpening) signal.stop();
    for (const route of this.routes.values()) route.signalRequested = true;
    this.setHeldButtons([]);
    this.listeners.clear();
    this.feedbackListeners.clear();
  }
}

/** Point and route events share the simulation clock without polling. */
export function startInterlockingClock(engine, { schedule = setTimeout, cancel = clearTimeout, simulation } = {}) {
  let timer = null, disposed = false;
  const update = () => {
    if (timer !== null) cancel(timer);
    timer = null;
    const deadline = engine.nextDeadline;
    if (!disposed && !simulation?.paused && deadline !== null) timer = schedule(() => { timer = null; engine.advanceTo(); update(); }, Math.max(0, deadline - engine.now()));
  };
  const unsubscribe = engine.subscribe(update);
  const unsubscribeSimulation = simulation?.subscribe(() => { engine.advanceTo(); update(); }) ?? (() => {});
  update();
  return () => { disposed = true; unsubscribe(); unsubscribeSimulation(); if (timer !== null) cancel(timer); timer = null; };
}
