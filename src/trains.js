// An unproved facing point may be passed only under shunting/Befehl authority.
// Selection follows physical travel, independently of the commanded target.
function pointBranchForTrain(node, point, entryPort, mode) {
  if (!point.moving && point.position) return point.position;
  if (node.kind !== 'point' || entryPort !== 'A' || !['shunting', 'authorized'].includes(mode)) return null;
  const progress = point.physicalProgress;
  if (!Number.isFinite(progress)) return null;
  return progress < .5 ? 'B' : progress > .5 ? 'C' : point.target;
}

/** A constant-speed train whose body follows the edges actually traversed. */
export class TrainSimulation {
  constructor(graph, interlocking, { speedKmh = 40, lengthM = 136 } = {}) {
    if (!(speedKmh > 0) || !(lengthM > 0)) throw new Error('Train speed and length must be positive.');
    this.graph = graph; this.interlocking = interlocking;
    this.defaultSpeedKmh = speedKmh; this.defaultLengthM = lengthM;
    this.trains = new Map(); this.occupied = new Set(); this.feedbackListeners = new Set();
  }
  subscribeFeedback(listener) { this.feedbackListeners.add(listener); return () => this.feedbackListeners.delete(listener); }
  addTrain({ id, boundaryId, speedKmh = this.defaultSpeedKmh, lengthM = this.defaultLengthM }) {
    if (!id || this.trains.has(id) || !(speedKmh > 0) || !(lengthM > 0)) throw new Error('Invalid train ID, speed or length.');
    const boundary = this.graph.getBoundary(boundaryId), edge = this.graph.getEdge(boundary.edgeId);
    const direction = boundary.end === 'A' ? 1 : -1;
    const train = { id, lengthM, speedKmh, edgeId: edge.id, positionM: direction === 1 ? 0 : edge.lengthM, direction, body: [], outsideM: 0, status: 'moving', passed: new Set(), mode: 'normal', waitingSignal: null, releaseSeconds: 0, preclearedSignal: null, reversalWaiting: false };
    this.trains.set(id, train);
    return this.getTrain(id);
  }
  /** Build the train body behind the signal using current point positions. */
  placementAtSignal(signalId, modelBindings, lengthM = this.defaultLengthM) {
    const signal = this.graph.getSignal(signalId);
    for (const route of this.interlocking.routes.values()) {
      const target = route.definition.target;
      if (route.active && target.kind === 'route-target' && modelBindings.getRouteTarget(target.targetId).signalId === signalId) return { ok: false, reason: 'route' };
    }
    const direction = signal.towards === 'B' ? 1 : -1;
    let edgeId = signal.edgeId, pos = signal.atM, backwards = -direction, remaining = lengthM;
    const parts = [], visited = new Set();
    while (remaining > 1e-8) {
      const edge = this.graph.getEdge(edgeId);
      const room = backwards === 1 ? edge.lengthM - pos : pos;
      const step = Math.min(room, remaining), tail = pos + backwards * step;
      if (step > 1e-8) { parts.unshift({ edgeId, fromM: tail, toM: pos }); remaining -= step; pos = tail; }
      if (remaining <= 1e-8) break;
      const end = backwards === 1 ? 'B' : 'A', key = `${edgeId}:${end}`;
      if (visited.has(key)) return { ok: false, reason: 'space' };
      visited.add(key);
      let connection = edge.ends[end];
      if (connection.kind === 'point') {
        const point = this.interlocking.getPoint(connection.nodeId);
        if (point.moving || !point.position) return { ok: false, reason: 'space' };
        connection = this.graph.getPointExit(connection.nodeId, connection.port, point.position);
      }
      if (!connection || !connection.edgeId) return { ok: false, reason: 'space' };
      edgeId = connection.edgeId; backwards = connection.end === 'A' ? 1 : -1;
      pos = backwards === 1 ? 0 : this.graph.getEdge(edgeId).lengthM;
    }
    for (const part of parts) {
      const lo = Math.min(part.fromM, part.toM), hi = Math.max(part.fromM, part.toM);
      for (const other of this.trains.values()) for (const occupied of other.body) {
        if (part.edgeId === occupied.edgeId && lo < Math.max(occupied.fromM, occupied.toM) - 1e-8 && hi > Math.min(occupied.fromM, occupied.toM) + 1e-8) return { ok: false, reason: 'occupied' };
      }
      for (const section of this.graph.getEdge(part.edgeId).trackCircuits) {
        if (lo < section.toM - 1e-8 && hi > section.fromM + 1e-8 && this.interlocking.gleisrelais.get(section.id)?.occupied) return { ok: false, reason: 'occupied' };
      }
    }
    return { ok: true, parts, signal, direction };
  }
  addTrainAtSignal({ id, signalId, modelBindings, speedKmh = this.defaultSpeedKmh, lengthM = this.defaultLengthM }) {
    if (!id || this.trains.has(id) || !(speedKmh > 0) || !(lengthM > 0)) throw new Error('Invalid train ID, speed or length.');
    const placement = this.placementAtSignal(signalId, modelBindings, lengthM);
    if (!placement.ok) return false;
    const { signal, direction, parts } = placement;
    this.trains.set(id, { id, lengthM, speedKmh, edgeId: signal.edgeId, positionM: signal.atM, direction, body: parts, outsideM: 0, status: 'signal', passed: new Set(), mode: 'normal', waitingSignal: signalId, releaseSeconds: 0, preclearedSignal: null, reversalWaiting: false });
    this.#occupancy();
    return this.getTrain(id);
  }
  nextSignal(id) {
    const train = this.trains.get(id);
    if (!train || train.edgeId === null) return null;
    let { edgeId, positionM: pos, direction } = train;
    const visited = new Set(); let first = true;
    while (true) {
      const edge = this.graph.getEdge(edgeId);
      const found = edge.signals.filter(s => s.type !== 'EndOfShunting' && s.towards === (direction === 1 ? 'B' : 'A') && (!first || !train.passed.has(s.id)))
        .map(s => ({ id: s.id, distance: (s.atM - pos) * direction })).filter(s => s.distance >= -1e-8).sort((a, b) => a.distance - b.distance)[0];
      if (found) return found.id;
      const end = direction === 1 ? 'B' : 'A', key = `${edgeId}:${end}`;
      if (visited.has(key)) return null; visited.add(key);
      let connection = edge.ends[end];
      if (connection.kind === 'point') {
        const point = this.interlocking.getPoint(connection.nodeId);
        const branch = pointBranchForTrain(this.graph.getNode(connection.nodeId), point, connection.port, train.mode);
        if (!branch) return null;
        connection = this.graph.getPointExit(connection.nodeId, connection.port, branch);
      }
      if (!connection || !connection.edgeId) return null;
      edgeId = connection.edgeId; direction = connection.end === 'A' ? 1 : -1;
      pos = direction === 1 ? 0 : this.graph.getEdge(edgeId).lengthM; first = false;
    }
  }
  /** Only consider signals within 100 m, stopping at entry to a point's common port A. */
  validSignal(id, maxDistanceM = 100) {
    const train = this.trains.get(id);
    if (!train || train.edgeId === null) return null;
    let { edgeId, positionM: pos, direction } = train, remaining = maxDistanceM, first = true;
    const visited = new Set();
    while (remaining >= -1e-8) {
      const edge = this.graph.getEdge(edgeId);
      const found = edge.signals.filter(signal => signal.type !== 'EndOfShunting' && signal.towards === (direction === 1 ? 'B' : 'A') && (!first || !train.passed.has(signal.id)))
        .map(signal => ({ id: signal.id, distance: (signal.atM - pos) * direction }))
        .filter(signal => signal.distance >= -1e-8 && signal.distance <= remaining + 1e-8).sort((a, b) => a.distance - b.distance)[0];
      if (found) return found.id;
      const end = direction === 1 ? 'B' : 'A', edgeDistance = direction === 1 ? edge.lengthM - pos : pos;
      if (edgeDistance >= remaining - 1e-8) return null;
      remaining -= edgeDistance;
      const token = `${edgeId}:${end}`; if (visited.has(token)) return null; visited.add(token);
      let connection = edge.ends[end];
      if (connection.kind === 'point') {
        if (connection.port === 'A') return null;
        const point = this.interlocking.getPoint(connection.nodeId);
        if (point.moving || !point.position) return null;
        connection = this.graph.getPointExit(connection.nodeId, connection.port, point.position);
      }
      if (!connection || !connection.edgeId) return null;
      edgeId = connection.edgeId; direction = connection.end === 'A' ? 1 : -1;
      pos = direction === 1 ? 0 : this.graph.getEdge(edgeId).lengthM; first = false;
    }
    return null;
  }
  reverseTrain(id) {
    const t = this.trains.get(id);
    if (!t || t.edgeId === null || !t.body.length) return false;
    t.body = t.body.reverse().map(part => ({ edgeId: part.edgeId, fromM: part.toM, toM: part.fromM }));
    const head = t.body.at(-1);
    t.edgeId = head.edgeId; t.positionM = head.toM; t.direction = Math.sign(head.toM - head.fromM);
    const stopped = t.status === 'stopped';
    t.mode = 'normal'; t.status = stopped ? 'stopped' : 'signal'; t.passed.clear(); t.waitingSignal = null;
    t.preclearedSignal = null; t.releaseSeconds = 0; t.reversalWaiting = true; t.authSkipSignal = null; t.shuntSkipSignal = null; t.pointBlocked = false; t.authorizationDelay = null; t.substituteDepartureSignal = null;
    return true;
  }
  stopTrain(id) {
    const t = this.trains.get(id); if (!t) return false;
    t.status = 'stopped'; t.mode = 'normal'; t.authorizationDelay = null; t.substituteDepartureSignal = null;
    t.authSkipSignal = null; t.shuntSkipSignal = null; t.waitingSignal = null;
    t.preclearedSignal = null; t.releaseSeconds = 0; t.reversalWaiting = false;
    return true;
  }
  removeTrain(id) {
    if (!this.trains.delete(id)) return false;
    this.#occupancy(); return true;
  }
  authorizeMovement(id) {
    const t = this.trains.get(id); if (!t) return false;
    t.authSkipSignal = this.validSignal(id); t.shuntSkipSignal = null; t.mode = 'authorized'; t.status = 'authorization-wait';
    t.pointBlocked = false; t.authorizationDelay = 0; t.substituteDepartureSignal = null;
    t.waitingSignal = null; t.preclearedSignal = null; t.releaseSeconds = 0; t.reversalWaiting = false;
    return true;
  }
  authorizeShunting(id) {
    const t = this.trains.get(id); if (!t || t.status === 'dead-end') return false;
    t.shuntSkipSignal = this.validSignal(id); t.authSkipSignal = null; t.mode = 'shunting'; t.status = 'authorization-wait';
    t.pointBlocked = false; t.authorizationDelay = 0; t.substituteDepartureSignal = null;
    t.waitingSignal = null; t.preclearedSignal = null; t.releaseSeconds = 0; t.reversalWaiting = false;
    return true;
  }
  getTrain(id) {
    const t = this.trains.get(id); if (!t) return null;
    return { id: t.id, edgeId: t.edgeId, positionM: t.positionM, direction: t.direction, lengthM: t.lengthM, speedKmh: t.speedKmh, status: t.status, mode: t.mode, body: t.body.map(part => ({ ...part })) };
  }
  /** Display the authority type during the departure delay. */
  displayState(id) {
    const t = this.trains.get(id);
    if (!t) return null;
    if (t.status === 'stopped') return 'stopped';
    if (t.substituteDepartureSignal && !this.#substituteDepartureValid(t)) return 'waiting';
    if (t.mode === 'authorized' && ['authorization-wait', 'authorized', 'moving'].includes(t.status)) return 'authorized';
    if (t.mode === 'shunting' && t.status === 'authorization-wait') return 'shunting';
    if (t.status === 'signal') {
      const signalId = this.validSignal(id);
      if (!signalId) return 'waiting';
      const signal = this.interlocking.getSignal(signalId);
      if (signal.substitute) return 'authorized';
      if (signal.aspect === 'shunt') return 'shunting';
      if (signal.aspect === 'proceed') return 'moving';
      return 'waiting';
    }
    if (t.status === 'shunting') return 'shunting';
    if (t.status === 'moving' || t.status === 'leaving') return 'moving';
    return 'waiting';
  }
  /** Small time steps preserve event order across short track circuits. */
  advance(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('A valid duration is required.');
    while (seconds > 1e-9) {
      const dt = Math.min(seconds, .05); seconds -= dt;
      for (const t of this.trains.values()) this.#move(t, t.speedKmh / 3.6 * dt, dt);
      this.#occupancy();
      for (const [id, t] of this.trains) if (t.status === 'exited') this.trains.delete(id);
    }
  }
  #substituteDepartureValid(t) {
    return this.validSignal(t.id) === t.substituteDepartureSignal && this.interlocking.getSignal(t.substituteDepartureSignal).substitute;
  }
  #move(t, distance, dt) {
    if (t.status === 'dead-end' || t.status === 'derailer' || t.status === 'stopped' || t.pointBlocked) return;
    // A substitute aspect grants single-use movement authority.
    if (t.edgeId !== null && t.mode !== 'authorized') {
      const signalId = this.validSignal(t.id);
      if (signalId && !(t.mode === 'shunting' && t.shuntSkipSignal === signalId) && this.interlocking.getSignal(signalId).substitute) {
        this.authorizeMovement(t.id); t.substituteDepartureSignal = signalId;
      }
    }
    // Substitute authority depends on the indication until the train passes its signal.
    if (t.substituteDepartureSignal && !this.#substituteDepartureValid(t)) {
      const signalId = t.substituteDepartureSignal;
      t.mode = 'normal'; t.status = 'signal'; t.authorizationDelay = null; t.substituteDepartureSignal = null;
      t.authSkipSignal = null; t.shuntSkipSignal = null; t.waitingSignal = null;
      t.preclearedSignal = null; t.releaseSeconds = 0; t.reversalWaiting = true;
      if (!this.interlocking.getSignal(signalId).substitute && this.displayState(t.id) === 'waiting') {
        const event = Object.freeze({ kind: 'substitute-released-before-departure', trainId: t.id, signalId });
        for (const listener of this.feedbackListeners) listener(event);
      }
      return;
    }
    if (t.authorizationDelay != null) {
      t.authorizationDelay += dt;
      if (t.authorizationDelay < 5 - 1e-8) { t.status = 'authorization-wait'; return; }
      t.authorizationDelay = null;
    }
    if (t.reversalWaiting) {
      const id = this.validSignal(t.id);
      if (!id || this.interlocking.getSignal(id).aspect === 'stop') { t.releaseSeconds = 0; t.status = 'signal'; return; }
      t.releaseSeconds += dt;
      if (t.releaseSeconds < 5 - 1e-8) { t.status = 'signal'; return; }
      t.preclearedSignal = id; t.waitingSignal = null; t.releaseSeconds = 0; t.reversalWaiting = false;
    }
    t.status = t.edgeId === null ? 'leaving' : t.mode === 'shunting' ? 'shunting' : t.mode === 'authorized' ? 'authorized' : 'moving';
    while (distance > 1e-9) {
      if (t.edgeId === null) {
        this.#trailPointsUnderTrain(t);
        t.outsideM += distance;
        this.#trim(t);
        if (!t.body.length && t.outsideM >= t.lengthM) t.status = 'exited';
        return;
      }
      const edge = this.graph.getEdge(t.edgeId);
      const signals = edge.signals.filter(s => (s.type !== 'EndOfShunting' || t.mode === 'shunting') && s.towards === (t.direction === 1 ? 'B' : 'A') && !t.passed.has(s.id));
      const next = signals.map(s => ({ signal: s, distance: (s.atM - t.positionM) * t.direction })).filter(s => s.distance >= -1e-8).sort((a, b) => a.distance - b.distance)[0];
      if (next && next.distance < 1e-8) {
        if (next.signal.type === 'EndOfShunting') {
          if (!t.body.length) { t.status = 'signal'; return; }
          t.body = t.body.reverse().map(part => ({ edgeId: part.edgeId, fromM: part.toM, toM: part.fromM }));
          const head = t.body.at(-1);
          t.edgeId = head.edgeId; t.positionM = head.toM;
          t.direction = Math.sign(head.toM - head.fromM);
          t.mode = 'normal'; t.status = 'signal'; t.passed.clear();
          t.waitingSignal = null; t.preclearedSignal = null; t.releaseSeconds = 0; t.reversalWaiting = true; t.shuntSkipSignal = null;
          return;
        }
        if (t.mode === 'authorized') {
          if (t.authSkipSignal === next.signal.id) {
            t.authSkipSignal = null;
            t.substituteDepartureSignal = null;
            t.passed.add(next.signal.id);
            continue;
          }
          t.mode = 'normal'; t.status = 'signal'; t.waitingSignal = next.signal.id; t.releaseSeconds = 0; return;
        }
        if (t.mode === 'shunting' && t.shuntSkipSignal === next.signal.id) {
          if (this.interlocking.getSignal(next.signal.id).aspect === 'proceed') { t.mode = 'normal'; t.status = 'moving'; }
          t.shuntSkipSignal = null; t.passed.add(next.signal.id); continue;
        }
        const signal = this.interlocking.getSignal(next.signal.id);
        if (signal.aspect === 'stop') { t.status = 'signal'; t.waitingSignal = next.signal.id; t.releaseSeconds = 0; t.preclearedSignal = null; return; }
        if (t.waitingSignal === next.signal.id && t.preclearedSignal !== next.signal.id) {
          t.releaseSeconds += dt;
          if (t.releaseSeconds < 5 - 1e-8) { t.status = 'signal'; return; }
        }
        if (signal.aspect === 'shunt') t.mode = 'shunting';
        else if (signal.aspect === 'proceed') t.mode = 'normal';
        t.waitingSignal = null; t.releaseSeconds = 0; t.preclearedSignal = null;
        t.status = t.mode === 'shunting' ? 'shunting' : 'moving';
        t.passed.add(next.signal.id); continue;
      }
      const edgeLeft = t.direction === 1 ? edge.lengthM - t.positionM : t.positionM;
      let clearance = Infinity;
      if (t.mode === 'shunting' || t.mode === 'authorized') for (const other of this.trains.values()) if (other !== t) for (const part of other.body) {
        if (part.edgeId !== edge.id) continue;
        const lo = Math.min(part.fromM, part.toM), hi = Math.max(part.fromM, part.toM);
        if (t.positionM >= lo - 1e-8 && t.positionM <= hi + 1e-8) clearance = 0;
        else if (t.direction === 1 && lo > t.positionM) clearance = Math.min(clearance, lo - t.positionM);
        else if (t.direction === -1 && hi < t.positionM) clearance = Math.min(clearance, t.positionM - hi);
      }
      if (clearance < 1e-8) { t.status = 'train'; return; }
      const step = Math.min(distance, edgeLeft, next?.distance ?? Infinity, clearance);
      if (step > 1e-9) {
        this.#trailPointsUnderTrain(t);
        const end = t.positionM + t.direction * step, last = t.body.at(-1);
        if (last && last.edgeId === edge.id && Math.abs(last.toM - t.positionM) < 1e-8) last.toM = end;
        else t.body.push({ edgeId: edge.id, fromM: t.positionM, toM: end });
        t.positionM = end; distance -= step; this.#trim(t);
        continue;
      }
      const end = t.direction === 1 ? 'B' : 'A', connection = edge.ends[end];
      if (connection.kind === 'boundary') { t.edgeId = null; t.status = 'leaving'; continue; }
      if (connection.kind === 'dead-end' || connection.kind === 'pending') { t.status = 'dead-end'; return; }
      let target = connection;
      if (connection.kind === 'point') {
        const node = this.graph.getNode(connection.nodeId);
        // A node occupied by another train's body cannot be entered from a different edge.
        const inUse = [...this.trains.values()].some(other => other !== t && other.body.some(part => {
          const occupiedEdge = this.graph.getEdge(part.edgeId);
          return ['A', 'B'].some(port => {
            const end = occupiedEdge.ends[port];
            if (end.kind !== 'point') return false;
            const samePoint = end.nodeId === connection.nodeId;
            const sameSlip = node.singleSlipId && this.graph.getNode(end.nodeId).singleSlipId === node.singleSlipId;
            if (!samePoint && !sameSlip) return false;
            const coordinate = port === 'A' ? 0 : occupiedEdge.lengthM;
            return Math.min(part.fromM, part.toM) <= coordinate + 1e-8 && Math.max(part.fromM, part.toM) >= coordinate - 1e-8;
          });
        }));
        if (inUse) { t.status = 'train'; return; }
        const point = this.interlocking.getPoint(connection.nodeId);
        const branch = pointBranchForTrain(node, point, connection.port, t.mode);
        if (!branch) { t.status = 'point'; return; }
        if (node.kind === 'derailer' && branch === (node.derailingBranch ?? 'B')) {
          t.status = 'derailer'; return;
        }
        target = this.graph.getPointExit(connection.nodeId, connection.port, branch);
        if (target?.edgeId && connection.port === 'A' && (point.moving || !point.position)) {
          // The remaining axles use this passage without creating an Auffahrt.
          t.unprovedFacingPasses ??= new Set();
          t.unprovedFacingPasses.add(connection.nodeId);
        }
        if (!target && connection.port !== 'A' && typeof this.interlocking.trailPoint === 'function') {
          const exit = this.graph.getPointExit(connection.nodeId, connection.port, connection.port);
          if (exit?.edgeId && this.interlocking.trailPoint(connection.nodeId, connection.port)) target = exit;
        }
        if (!target || !target.edgeId) { t.status = 'point'; t.pointBlocked = true; return; }
      }
      t.edgeId = target.edgeId; t.direction = target.end === 'A' ? 1 : -1;
      t.positionM = t.direction === 1 ? 0 : this.graph.getEdge(t.edgeId).lengthM;
      t.passed.clear();
    }
  }
  #trailPointsUnderTrain(train) {
    if (typeof this.interlocking.trailPoint !== 'function') return;
    // A facing exception lasts only until the whole train has cleared that node.
    if (train.unprovedFacingPasses?.size) {
      for (const id of train.unprovedFacingPasses) {
        const underTrain = train.body.some(part => {
          const edge = this.graph.getEdge(part.edgeId);
          return ['A', 'B'].some(end => {
            const connection = edge.ends[end], at = end === 'A' ? 0 : edge.lengthM;
            return connection.kind === 'point' && connection.nodeId === id
              && Math.min(part.fromM, part.toM) <= at + 1e-8 && Math.max(part.fromM, part.toM) >= at - 1e-8;
          });
        });
        if (!underTrain) train.unprovedFacingPasses.delete(id);
      }
    }
    if (train.body.length < 2) return;
    const trail = (id, branch) => {
      if (!train.unprovedFacingPasses?.has(id)) this.interlocking.trailPoint(id, branch);
    };

    const pointAt = (part, coordinate) => {
      const edge = this.graph.getEdge(part.edgeId);
      if (coordinate <= 1e-8) return edge.ends.A;
      if (coordinate >= edge.lengthM - 1e-8) return edge.ends.B;
      return null;
    };

    // Wheels still passing the switch follow the recorded path of the train.
    for (let i = 1; i < train.body.length; i++) {
      const rear = train.body[i - 1], front = train.body[i];
      const entry = pointAt(rear, rear.toM), exit = pointAt(front, front.fromM);
      if (entry?.kind !== 'point' || exit?.kind !== 'point') continue;
      if (entry.nodeId !== exit.nodeId) {
        // The train's body omits the zero-length connection inside an EKW.
        // Preserve the already traversed curved path through both tongue groups.
        if (entry.port !== 'A' || exit.port !== 'A') continue;
        for (const branch of ['B', 'C']) {
          const link = this.graph.getPointExit(entry.nodeId, 'A', branch);
          if (!link?.edgeId) continue;
          const edge = this.graph.getEdge(link.edgeId);
          const other = edge.ends[link.end === 'A' ? 'B' : 'A'];
          if (edge.kind !== 'point-link' || other.nodeId !== exit.nodeId) continue;
          trail(entry.nodeId, branch);
          trail(exit.nodeId, other.port);
          break;
        }
        continue;
      }
      if (entry.port === 'A' || exit.port === 'A') {
        const branch = entry.port === 'A' ? exit.port : entry.port;
        trail(entry.nodeId, branch);
      }
    }
  }
  #trim(t) {
    let excess = t.outsideM + t.body.reduce((sum, part) => sum + Math.abs(part.toM - part.fromM), 0) - t.lengthM;
    while (excess > 1e-9 && t.body.length) {
      const first = t.body[0], size = Math.abs(first.toM - first.fromM);
      if (size <= excess + 1e-9) { t.body.shift(); excess -= size; }
      else { first.fromM += Math.sign(first.toM - first.fromM) * excess; excess = 0; }
    }
  }
  #occupancy() {
    const now = new Set();
    for (const t of this.trains.values()) for (const part of t.body) {
      const lo = Math.min(part.fromM, part.toM), hi = Math.max(part.fromM, part.toM);
      for (const section of this.graph.getEdge(part.edgeId).trackCircuits) if (lo < section.toM - 1e-9 && hi > section.fromM + 1e-9) now.add(section.id);
    }
    // Report new occupancies first: a train may occupy two circuits at once.
    for (const id of now) if (!this.occupied.has(id)) this.interlocking.setTrackOccupied(id, true);
    for (const id of this.occupied) if (!now.has(id)) this.interlocking.setTrackOccupied(id, false);
    this.occupied = now;
  }
}

export function startTrainClock(simulation, { now = () => performance.now(), schedule = setInterval, cancel = clearInterval, control } = {}) {
  let last = now();
  let timer = null;
  const tick = () => { const current = now(); simulation.advance(Math.max(0, (current - last) / 1000)); last = current; };
  const update = () => {
    tick();
    if (timer !== null) { cancel(timer); timer = null; }
    if (!control?.paused) timer = schedule(tick, 50);
  };
  const unsubscribe = control?.subscribe(update) ?? (() => {});
  if (!control?.paused) timer = schedule(tick, 50);
  return () => { unsubscribe(); if (timer !== null) cancel(timer); timer = null; };
}
