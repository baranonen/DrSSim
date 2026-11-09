import { compileSignalCapabilities } from './signal-capabilities.js';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identity = value => typeof value === 'string' && value.trim().length > 0;
const ends = ['A', 'B'];
const ports = ['A', 'B', 'C'];
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
function requireValue(condition, message) { if (!condition) throw new Error(message); }
function keys(value, allowed) { return Object.keys(value).every(key => allowed.includes(key)); }
function unique(items, label) {
  const map = new Map();
  for (const item of items) {
    requireValue(object(item) && identity(item.id) && !map.has(item.id), `${label} ID is empty or duplicated.`);
    map.set(item.id, item);
  }
  return map;
}

/** Topology is immutable; point positions, trains, relays and the desk are stored separately. */
export function compileRailGraph(config, { allowIncomplete = false } = {}) {
  requireValue(object(config) && config.version === 1 && identity(config.id), 'Graph version and ID are required.');
  requireValue(config.draft === undefined || typeof config.draft === 'boolean', 'The graph draft field must be a boolean.');
  requireValue(config.lengthUnit === 'm', 'Graph length unit must be m.');
  requireValue(Array.isArray(config.edges) && Array.isArray(config.nodes), 'Graph edge and node lists are required.');
  const data = structuredClone(config);
  const nodes = unique(data.nodes, 'Node'), edges = unique(data.edges, 'Edge');
  const pointConnections = new Map(), boundaries = new Map(), signals = new Map(), circuits = new Map();
  let complete = true;
  for (const node of nodes.values()) {
    requireValue(node.kind === 'point' || node.kind === 'derailer', 'Unsupported node type.');
    requireValue(node.derailingBranch === undefined || (node.kind === 'derailer' && ['B', 'C'].includes(node.derailingBranch)), 'Only derailers may define a derailing branch of B or C.');
    requireValue(node.singleSlipId === undefined || (node.kind === 'point' && identity(node.singleSlipId)), 'Single slip components require point nodes and a shared ID.');
    if (node.pendingPorts !== undefined) {
      requireValue(Array.isArray(node.pendingPorts) && new Set(node.pendingPorts).size === node.pendingPorts.length && node.pendingPorts.every(port => ports.includes(port)), 'Pending point ports must be a unique list of A, B or C.');
      if (node.pendingPorts.length) {
        requireValue(data.draft === true && allowIncomplete === true, 'Undefined point ports require an explicitly permitted draft graph.');
        complete = false;
      }
    }
    pointConnections.set(node.id, new Map());
  }
  for (const edge of edges.values()) {
    requireValue(Number.isFinite(edge.lengthM) && edge.lengthM >= 0, `Edge length must be finite and nonnegative: ${edge.id}`);
    requireValue(object(edge.ends) && Object.keys(edge.ends).length === 2 && ends.every(end => object(edge.ends[end])), `Edge ends A and B are required: ${edge.id}`);
    if (edge.kind === 'point-link') {
      const [a, b] = ends.map(end => edge.ends[end]);
      const first = nodes.get(a.nodeId), second = nodes.get(b.nodeId);
      requireValue(edge.lengthM === 0 && a.kind === 'point' && b.kind === 'point'
        && ['B', 'C'].includes(a.port) && ['B', 'C'].includes(b.port) && a.nodeId !== b.nodeId
        && first?.kind === 'point' && second?.kind === 'point'
        && identity(first.singleSlipId) && first.singleSlipId === second.singleSlipId
        && edge.signals?.length === 0 && edge.trackCircuits?.length === 0,
      `An internal single slip link must connect B/C branches of two points in the same slip with zero length: ${edge.id}`);
    } else if (edge.lengthM === 0) {
      const connections = ends.map(end => edge.ends[end]);
      const stop = connections.find(connection => connection.kind === 'point');
      const node = nodes.get(stop?.nodeId);
      requireValue(node?.kind === 'derailer' && stop.port === (node.derailingBranch ?? 'B')
        && connections.some(connection => connection.kind === 'dead-end')
        && edge.signals?.length === 0 && edge.trackCircuits?.length === 0,
      `Zero length is only allowed on a signal-free derailing branch: ${edge.id}`);
    }
    for (const end of ends) {
      const connection = edge.ends[end];
      if (connection.kind === 'point') {
        requireValue(keys(connection, ['kind', 'nodeId', 'port']), 'Unknown field in point connection.');
        requireValue(nodes.has(connection.nodeId) && ports.includes(connection.port), `Invalid point connection: ${edge.id}/${end}`);
        const attached = pointConnections.get(connection.nodeId);
        requireValue(!attached.has(connection.port), `Two edges share the same point port: ${connection.nodeId}/${connection.port}`);
        attached.set(connection.port, { edgeId: edge.id, end });
      } else if (connection.kind === 'edge') {
        requireValue(keys(connection, ['kind', 'edgeId', 'end']), 'Unknown field in edge connection.');
        requireValue(edges.has(connection.edgeId) && ends.includes(connection.end) && !(connection.edgeId === edge.id && connection.end === end), `Invalid adjacent edge: ${edge.id}/${end}`);
      } else if (connection.kind === 'boundary') {
        requireValue(keys(connection, ['kind', 'id', 'neighbor']), 'Unknown field in interlocking boundary.');
        requireValue(identity(connection.id) && !boundaries.has(connection.id), 'Interlocking boundary ID is empty or duplicated.');
        if (connection.neighbor !== undefined) {
          requireValue(object(connection.neighbor) && identity(connection.neighbor.graphId) && identity(connection.neighbor.boundaryId), 'Adjacent interlocking and boundary IDs are required.');
          requireValue(connection.neighbor.graphId !== data.id, 'An interlocking boundary must lead to another graph; use an edge for local connections.');
        }
        boundaries.set(connection.id, { ...connection, edgeId: edge.id, end });
      } else if (connection.kind === 'pending') {
        requireValue(data.draft === true && allowIncomplete === true && keys(connection, ['kind']), 'Undefined ends require an explicitly permitted draft graph.');
        complete = false;
      } else requireValue(connection.kind === 'dead-end' && keys(connection, ['kind']), `End type must be explicitly specified: ${edge.id}/${end}`);
    }
    requireValue(Array.isArray(edge.trackCircuits) && Array.isArray(edge.signals), `Edge track circuit and signal lists are required: ${edge.id}`);
    const intervals = [];
    for (const section of edge.trackCircuits) {
      requireValue(object(section) && identity(section.id) && Number.isFinite(section.fromM) && Number.isFinite(section.toM) && section.fromM >= 0 && section.fromM < section.toM && section.toM <= edge.lengthM, `Invalid track circuit interval: ${edge.id}`);
      intervals.push(section);
      const circuit = circuits.get(section.id) ?? { id: section.id, sections: [] };
      circuit.sections.push({ edgeId: edge.id, fromM: section.fromM, toM: section.toM });
      circuits.set(section.id, circuit);
    }
    intervals.sort((a, b) => a.fromM - b.fromM);
    for (let index = 1; index < intervals.length; index++) requireValue(intervals[index].fromM >= intervals[index - 1].toM, `Track circuit intervals overlap: ${edge.id}`);
    for (const end of ends) {
      const connection = edge.ends[end];
      const shared = connection.neighbor?.sharedTrackCircuit;
      if (shared === undefined) continue;
      requireValue(object(shared) && identity(shared.localId) && identity(shared.neighborId)
        && (shared.multiplayerOccupancySource === undefined || ['local', 'neighbor'].includes(shared.multiplayerOccupancySource)),
      `Invalid shared track circuit binding: ${connection.id}`);
      const touchesBoundary = intervals.some(section =>
        section.id === shared.localId && (end === 'A' ? section.fromM === 0 : section.toM === edge.lengthM));
      requireValue(touchesBoundary, `Shared track circuit must reach the interlocking boundary: ${connection.id}`);
    }
    for (const signal of edge.signals) {
      requireValue(object(signal) && identity(signal.id) && !signals.has(signal.id), 'Signal ID is empty or duplicated.');
      requireValue(Number.isFinite(signal.atM) && signal.atM >= 0 && signal.atM <= edge.lengthM && ends.includes(signal.towards), `Invalid signal position or direction: ${signal.id}`);
      const capabilities = compileSignalCapabilities(signal);
      Object.assign(signal, capabilities);
      signals.set(signal.id, { ...signal, edgeId: edge.id });
    }
  }
  for (const [id, attached] of pointConnections) {
    const node = nodes.get(id), pending = node.pendingPorts ?? [];
    if (node.kind === 'derailer') {
      const branch = node.derailingBranch ?? 'B';
      const stop = attached.get(branch);
      const edge = edges.get(stop?.edgeId);
      requireValue(edge?.lengthM === 0 && edge.ends[stop.end === 'A' ? 'B' : 'A'].kind === 'dead-end', `Derailer branch ${branch} must be a zero-length dead end: ${id}`);
    }
    requireValue(pending.every(port => !attached.has(port)), `A point port cannot be both connected and pending: ${id}`);
    requireValue(ports.every(port => attached.has(port) || pending.includes(port)), `Point ports A/B/C must be connected or explicitly pending: ${id}`);
    for (const port of pending) attached.set(port, { kind: 'pending' });
  }
  for (const edge of edges.values()) for (const end of ends) {
    const connection = edge.ends[end];
    if (connection.kind !== 'edge') continue;
    const reverse = edges.get(connection.edgeId).ends[connection.end];
    requireValue(reverse.kind === 'edge' && reverse.edgeId === edge.id && reverse.end === end, `Edge connection must be reciprocal: ${edge.id}/${end}`);
  }
  freeze(data);
  for (const value of [...boundaries.values(), ...signals.values(), ...circuits.values()]) freeze(value);
  for (const attached of pointConnections.values()) for (const value of attached.values()) freeze(value);
  function find(map, id, label) { const value = map.get(id); requireValue(value, `${label} not found: ${id}`); return value; }
  return Object.freeze({
    ...data,
    complete,
    requireComplete() { requireValue(complete, 'The railway graph contains undefined continuation ends.'); },
    getEdge: id => find(edges, id, 'Edge'),
    getNode: id => find(nodes, id, 'Node'),
    getSignal: id => find(signals, id, 'Signal'),
    getTrackCircuit: id => find(circuits, id, 'Track circuit'),
    getBoundary: id => find(boundaries, id, 'Interlocking boundary'),
    getConnection(edgeId, end) {
      requireValue(ends.includes(end), 'Edge end must be A or B.');
      return find(edges, edgeId, 'Edge').ends[end];
    },
    getPointExit(nodeId, entryPort, selectedBranch) {
      const attached = find(pointConnections, nodeId, 'Point');
      requireValue(ports.includes(entryPort) && ['B', 'C'].includes(selectedBranch), 'Entry must be A/B/C and selected branch must be B/C.');
      // B is normal and C is reverse; the dynamic field model supplies the selected branch explicitly.
      const exit = entryPort === 'A' ? selectedBranch : entryPort === selectedBranch ? 'A' : null;
      return exit ? Object.freeze({ port: exit, ...attached.get(exit) }) : null;
    },
  });
}

export async function loadRailGraph(url, fetcher = globalThis.fetch, options) {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Failed to load railway graph: HTTP ${response.status}`);
  return compileRailGraph(await response.json(), options);
}
