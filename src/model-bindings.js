import { TILES } from './tiles.js';
import { fieldInstanceId } from './tisch.js';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identity = value => typeof value === 'string' && value.trim().length > 0;
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
function requireValue(condition, message) { if (!condition) throw new Error(message); }

/** Bind identities without deriving lamp colors or commands directly from physical occupancy. */
export function compileModelBindings(config, { graph, desk }) {
  requireValue(graph && desk, 'Model bindings require a graph and desk.');
  requireValue(object(config) && config.version === 1 && config.graphId === graph.id && config.tischId === desk.id, 'Invalid model binding version, graph ID or desk ID.');
  requireValue(Array.isArray(config.routeTargets) && object(config.channels) && object(config.buttons), 'Model binding lists are required.');
  const data = structuredClone(config), targets = new Map(), buttons = new Map(), channels = new Map();
  for (const target of data.routeTargets) {
    requireValue(object(target) && identity(target.id) && !targets.has(target.id), 'Invalid track target ID or position.');
    requireValue(['boundaryId', 'signalId', 'position'].filter(key => target[key] !== undefined).length === 1, 'A track target must bind to exactly one physical position.');
    if (target.boundaryId !== undefined) {
      graph.getBoundary(target.boundaryId);
    } else if (target.signalId !== undefined) {
      graph.getSignal(target.signalId);
    } else {
      requireValue(object(target.position), 'Track target position is required.');
      const edge = graph.getEdge(target.position.edgeId);
      requireValue(Number.isFinite(target.position.atM) && target.position.atM >= 0 && target.position.atM <= edge.lengthM, 'Track target is outside the edge.');
    }
    targets.set(target.id, target);
  }
  for (const field of desk.fields) {
    const prefix = fieldInstanceId(desk.id, field.id), definition = TILES[field.tile];
    for (const button of definition.buttons) buttons.set(`${prefix}:${button.key}`, button);
    for (const [key, channel] of Object.entries(field.bindings ?? {})) {
      const list = channels.get(channel) ?? []; list.push(`${prefix}:${key}`); channels.set(channel, list);
    }
  }
  for (const [channel, source] of Object.entries(data.channels)) {
    requireValue(channels.has(channel) && object(source), `Unknown display channel: ${channel}`);
    if (source.kind === 'track-circuit') graph.getTrackCircuit(source.id);
    else if (source.kind === 'route-locked') requireValue(targets.has(source.targetId), 'Route locking target not found.');
    else if (source.kind === 'signal-route-locked') graph.getSignal(source.signalId);
    else if (source.kind === 'continuous-operation') requireValue(identity(source.id) && ['active','local'].includes(source.state), 'Invalid continuous operation indicator.');
    else if (source.kind === 'operation-counter') requireValue(['MYD', 'SYIYD', 'YSGD', 'TCS'].includes(source.command), 'Invalid operation counter source.');
    else if (source.kind === 'point-indicator') {
      graph.getNode(source.nodeId); graph.getTrackCircuit(source.trackCircuitId);
      requireValue(['B', 'C'].includes(source.branch), 'Point indicator branch must be B or C.');
    } else if (source.kind === 'signal-indicator') {
      const signal = graph.getSignal(source.signalId);
      requireValue(signal.indications.includes(source.indication), 'A signal cannot bind to an unsupported indication.');
    } else throw new Error('Unknown display source type.');
  }
  for (const [id, source] of Object.entries(data.buttons)) {
    const button = buttons.get(id);
    requireValue(button && object(source), `Model button not found on the desk: ${id}`);
    if (source.kind === 'point') { graph.getNode(source.nodeId); requireValue(['MD', 'MD1', 'MD2'].includes(button.key), 'A point source must bind to a point button.'); }
    else if (source.kind === 'route-target') requireValue(button.key === 'RT' && targets.has(source.targetId), 'Invalid track target button.');
    else if (source.kind === 'signal') { graph.getSignal(source.signalId); requireValue(button.key === 'SD', 'A signal source must bind to an SD button.'); }
    else if (source.kind === 'continuous-operation') requireValue(identity(source.id) && ['DISD','DGBD'].includes(source.command) && button.key === source.command, 'Invalid continuous operation button.');
    else if (source.kind === 'group') requireValue(['MGD', 'SGD', 'STGD', 'YSGD', 'MYD', 'SYIYD'].includes(source.command) && button.key === source.command, 'Invalid group button source.');
    else throw new Error('Unknown button source type.');
  }
  // The default indicator group repeats a single track circuit.
  // Custom tile definitions may assign a separate trackCircuitGroup to an adjacent track window.
  // This distinction is defined by the tile library rather than the user layout.
  for (const field of desk.fields) {
    const groups = new Map(), definition = TILES[field.tile];
    for (const [key, channel] of Object.entries(field.bindings ?? {})) {
      const source = data.channels[channel];
      const circuit = source?.kind === 'track-circuit' ? source.id : source?.kind === 'point-indicator' ? source.trackCircuitId : undefined;
      if (circuit !== undefined) {
        const group = definition.elements.find(element => element.key === key)?.trackCircuitGroup ?? 'main';
        const circuits = groups.get(group) ?? new Set();
        circuits.add(circuit); groups.set(group, circuits);
      }
      if (key.startsWith('track.') && source) requireValue(source.kind === 'track-circuit', 'A track circuit window must bind to a track circuit source.');
    }
    for (const circuits of groups.values()) requireValue(circuits.size <= 1, `Each indicator group in a tile must display a single track circuit: ${field.address}`);
  }
  freeze(data);
  const lookup = (map, id, label) => { const value = map.get(id); requireValue(value, `${label} not found: ${id}`); return value; };
  const channelSources = new Map(Object.entries(data.channels)), buttonSources = new Map(Object.entries(data.buttons));
  for (const values of channels.values()) Object.freeze(values);
  return Object.freeze({
    ...data,
    getChannelSource: id => lookup(channelSources, id, 'Display source'),
    getButtonSource: id => lookup(buttonSources, id, 'Button source'),
    getRouteTarget: id => lookup(targets, id, 'Yol hedefi'),
    getChannelElements: id => lookup(channels, id, 'Display channel'),
  });
}
export async function loadModelBindings(url, models, fetcher = globalThis.fetch) {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Failed to load model bindings: HTTP ${response.status}`);
  return compileModelBindings(await response.json(), models);
}
