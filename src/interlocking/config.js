const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identity = value => typeof value === 'string' && value.trim().length > 0;
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const opposite = end => end === 'A' ? 'B' : 'A';

/** Traverse the physical route without adding flank protection points to the train path. */
function traceRoute(route, graph, target) {
  const start = graph.getSignal(route.startSignalId);
  let edge = graph.getEdge(start.edgeId), from = start.atM, towards = start.towards;
  const seen = new Set(), circuits = [], traversedPoints = [];
  while (true) {
    const token = `${edge.id}:${towards}`;
    requireValue(!seen.has(token), `Route contains a loop: ${route.id}`);
    seen.add(token);
    const endM = towards === 'B' ? edge.lengthM : 0;
    const onTargetEdge = edge.id === target.edgeId;
    const ahead = onTargetEdge && (towards === 'B' ? target.atM >= from : target.atM <= from);
    if (ahead) requireValue(target.towards === towards, `Target direction does not match: ${route.id}`);
    const to = ahead ? target.atM : endM;
    const sections = [...edge.trackCircuits].sort((a, b) => towards === 'B' ? a.fromM - b.fromM : b.fromM - a.fromM);
    for (const section of sections) if (section.toM > Math.min(from, to) && section.fromM < Math.max(from, to)) {
      if (circuits.at(-1) !== section.id) circuits.push(section.id);
    }
    if (ahead) break;
    const connection = graph.getConnection(edge.id, towards);
    if (connection.kind === 'point') {
      const branch = route.points[connection.nodeId];
      requireValue(branch, `Missing route point position: ${route.id}/W${connection.nodeId}`);
      const next = graph.getPointExit(connection.nodeId, connection.port, branch);
      requireValue(next, `Point position does not lead to the target: ${route.id}/W${connection.nodeId}`);
      traversedPoints.push(connection.nodeId);
      edge = graph.getEdge(next.edgeId); from = next.end === 'A' ? 0 : edge.lengthM; towards = opposite(next.end);
    } else {
      requireValue(connection.kind === 'edge', `Track ends before the target: ${route.id}`);
      edge = graph.getEdge(connection.edgeId); from = connection.end === 'A' ? 0 : edge.lengthM; towards = opposite(connection.end);
    }
  }
  return { traversedPoints, circuits };
}

export function compileInterlockingConfig(config, { graph, modelBindings }) {
  requireValue(object(config) && config.version === 1 && config.graphId === graph.id, 'Invalid interlocking version or graph ID.');
  graph.requireComplete();
  const data = structuredClone(config);
  if (data.approachAnnouncementCircuits === undefined) data.approachAnnouncementCircuits = [];
  const announcementCircuits = data.approachAnnouncementCircuits;
  requireValue(Array.isArray(announcementCircuits) && announcementCircuits.every(identity)
    && new Set(announcementCircuits).size === announcementCircuits.length, 'Approach announcement circuits must have unique IDs.');
  for (const id of announcementCircuits) graph.getTrackCircuit(id);
  if (data.powerSupply !== undefined) requireValue(object(data.powerSupply) && ['backupSupportsPoints','backupFeedsRectifiers'].every(key => typeof data.powerSupply[key] === 'boolean'), 'Invalid power supply configuration.');
  data.routeHoldMs ??= 100;
  data.routeOperationMs ??= 500;
  data.controlHoldMs ??= 100;
  data.controlOperationMs ??= 500;
  data.substituteHoldMs ??= 100;
  data.dayNightHoldMs ??= 100;
  data.continuousHoldMs ??= 100;
  data.continuousOperationMs ??= 300;
  requireValue(Number.isFinite(data.continuousHoldMs) && data.continuousHoldMs >= 0 && Number.isFinite(data.continuousOperationMs) && data.continuousOperationMs >= data.continuousHoldMs, 'Invalid continuous operation timing.');
  requireValue(['controlHoldMs', 'controlOperationMs', 'substituteHoldMs', 'dayNightHoldMs'].every(key => Number.isFinite(data[key]) && data[key] >= 0) && data.controlOperationMs >= data.controlHoldMs, 'Invalid command timing.');
  requireValue(Number.isFinite(data.routeHoldMs) && data.routeHoldMs >= 0 && Number.isFinite(data.routeOperationMs) && data.routeOperationMs >= data.routeHoldMs, 'Invalid route timing: total duration cannot be shorter than hold time.');
  requireValue(Number.isFinite(data.taktPeriodMs) && data.taktPeriodMs > 0 && Number.isFinite(data.pointMovementMs) && data.pointMovementMs > 0, 'Blink period and point movement duration must be positive.');
  data.pointMotorTimeoutMs ??= data.pointMovementMs;
  requireValue(Number.isFinite(data.pointMotorTimeoutMs) && data.pointMotorTimeoutMs >= data.pointMovementMs,
    'Point motor timeout cannot be shorter than the movement duration.');
  requireValue(['B', 'C'].includes(data.initialPointBranch) && object(data.pointTrackCircuits) && Array.isArray(data.routes), 'Initial point positions, circuits and routes are required.');
  requireValue(Object.keys(data.pointTrackCircuits).length === graph.nodes.length, 'Every point requires a track circuit.');
  for (const [id, circuit] of Object.entries(data.pointTrackCircuits)) { graph.getNode(id); graph.getTrackCircuit(circuit); }
  if (data.shuntConditions === undefined) data.shuntConditions = {};
  requireValue(object(data.shuntConditions), 'Shunting conditions must be indexed by signal ID.');
  for (const [signalId, conditions] of Object.entries(data.shuntConditions)) {
    requireValue(graph.getSignal(signalId).capabilities.shunt, `Cannot set shunting conditions on a signal without shunting capability: ${signalId}`);
    requireValue(object(conditions) && Object.keys(conditions).every(key => key === 'points') && object(conditions.points) && Object.keys(conditions.points).length > 0, `Shunting point conditions are required: ${signalId}`);
    for (const [id, branch] of Object.entries(conditions.points)) {
      graph.getNode(id); requireValue(['B', 'C'].includes(branch), `Shunting point position must be B or C: ${signalId}/W${id}`);
    }
  }
  const ids = new Set(), pairs = new Set();
  for (const route of data.routes) {
    requireValue(object(route) && identity(route.id) && !ids.has(route.id), 'Route ID is empty or duplicated.'); ids.add(route.id);
    requireValue(graph.getSignal(route.startSignalId).type === 'normal', 'A train route must start at a normal signal.');
    requireValue(object(route.points) && Object.keys(route.points).length && Array.isArray(route.trackCircuits) && route.trackCircuits.length && Array.isArray(route.stopSignals), 'Route condition lists are required.');
    route.flankTrackCircuits ??= [];
    requireValue(Array.isArray(route.flankTrackCircuits)
      && route.flankTrackCircuits.every(identity)
      && new Set(route.flankTrackCircuits).size === route.flankTrackCircuits.length,
    `Flank protection circuits must have unique IDs: ${route.id}`);
    for (const id of route.flankTrackCircuits) {
      graph.getTrackCircuit(id);
      requireValue(!route.trackCircuits.includes(id), `Flank protection circuits must be separate from route circuits: ${route.id}/${id}`);
    }
    for (const [id, branch] of Object.entries(route.points)) { graph.getNode(id); requireValue(['B', 'C'].includes(branch), 'Point position must be B or C.'); }
    for (const list of [route.trackCircuits, route.stopSignals]) requireValue(new Set(list).size === list.length, 'Route conditions cannot be duplicated.');
    route.trackCircuits.forEach(id => graph.getTrackCircuit(id));
    route.stopSignals.forEach(id => { graph.getSignal(id); requireValue(id !== route.startSignalId, 'The starting signal cannot appear in its own protection list.'); });
    requireValue(object(route.target), 'A route target is required.');
    requireValue(route.target.kind === 'route-target' && Object.keys(route.target).every(key => ['kind', 'targetId'].includes(key)), 'A route must connect a signal to a track target button.');
    const definition = modelBindings.getRouteTarget(route.target.targetId);
    const targetKind = definition.signalId ? 'entry' : 'exit';
    if (route.kind === undefined) route.kind = targetKind;
    requireValue(route.kind === targetKind, `Route kind does not match target: ${route.id}`);
    let target;
    if (definition.signalId) {
      requireValue(definition.signalId !== route.startSignalId, 'Start and target positions cannot be identical.');
      target = graph.getSignal(definition.signalId);
    } else {
      requireValue(definition.boundaryId, 'The RT exit target must currently be an interlocking boundary.');
      const boundary = graph.getBoundary(definition.boundaryId);
      target = { edgeId: boundary.edgeId, atM: boundary.end === 'A' ? 0 : graph.getEdge(boundary.edgeId).lengthM, towards: boundary.end };
    }
    const pair = JSON.stringify([route.startSignalId, route.target]);
    requireValue(!pairs.has(pair), 'Two routes cannot use the same button pair.'); pairs.add(pair);
    const { traversedPoints, circuits } = traceRoute(route, graph, target);
    requireValue(JSON.stringify(route.trackCircuits) === JSON.stringify(circuits), `Track circuit order does not match the physical path: ${route.id}`);
    route.pathPoints = traversedPoints;
    route.releaseTrackCircuits = circuits;
    // The first route point circuit must become occupied and then clear once;
    // the remaining route circuits only need to become occupied in sequence.
    requireValue(traversedPoints.length > 0, `The route has no first point: ${route.id}`);
    route.releasePointCircuit = data.pointTrackCircuits[traversedPoints[0]];
    requireValue(circuits.includes(route.releasePointCircuit), `The first point circuit is missing from the route: ${route.id}`);
    route.releaseEnterCount = circuits.length;
  }
  data.continuousOperations ??= [];
  requireValue(Array.isArray(data.continuousOperations), 'Invalid continuous operation list.');
  const modes = new Set();
  for (const mode of data.continuousOperations) {
    requireValue(identity(mode.id) && !modes.has(mode.id), 'Invalid continuous operation ID.'); modes.add(mode.id);
    const entry = data.routes.find(r => r.id === mode.entryRouteId), exit = data.routes.find(r => r.id === mode.exitRouteId);
    requireValue(entry && exit && entry.target.targetId === mode.targetId && modelBindings.getRouteTarget(mode.targetId).signalId === exit.startSignalId, 'Continuous operation routes do not match.');
    for (const [id, branch] of Object.entries(entry.points)) requireValue(!exit.points[id] || exit.points[id] === branch, 'Continuous operation point positions do not match.');
    for (const command of ['DISD','DGBD']) requireValue(Object.values(modelBindings.buttons).some(b => b.kind === 'continuous-operation' && b.id === mode.id && b.command === command), 'Missing continuous operation button.');
    for (const state of ['active','local']) requireValue(Object.values(modelBindings.channels).some(c => c.kind === 'continuous-operation' && c.id === mode.id && c.state === state), 'Missing continuous operation indicator.');
  }
  return freeze(data);
}

export async function loadInterlockingConfig(url, models, fetcher = globalThis.fetch) {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Failed to load interlocking configuration: HTTP ${response.status}`);
  return compileInterlockingConfig(await response.json(), models);
}
