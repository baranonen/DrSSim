import { controls } from './definitions/controls.js';
import { tracks } from './definitions/tracks.js';
import { signals } from './definitions/signals.js';
import { routeTargets } from './definitions/route-targets.js';
export { ButtonType, ORIENTATIONS } from './definitions/common.js';
// Canonical corners reached by diagonal rail centerlines, before orientation.
const diagonalCorners = {
  TrackFromBottomLeft: ['bottomLeft'],
  TrackDiagonalUp: ['bottomLeft', 'topRight'],
  TrackDiagonalDown: ['topLeft', 'bottomRight'],
  TrackCrossing: ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'],
  PointFromBottomLeft: ['bottomLeft'],
  PointFromTopLeftToBottomRight: ['topLeft', 'bottomRight'],
  DoublePoint: ['topLeft', 'bottomRight'],
  SingleSlip: ['topLeft', 'bottomRight'],
  DoubleSlipLeftControl: ['bottomLeft', 'topRight'],
  PointToTopRight: ['topRight'],
  PointToTopRightWithAdjacentTrackCircuit: ['topRight'],
  Derailer: ['topRight'],
  DiagonalDerailerLeft: ['topLeft'],
  FourAspectSignalToTopRight: ['topLeft'],
};
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
export function createRegistry(definitions) {
  const registry = Object.create(null);
  for (const definition of definitions) {
    if (!definition.key || Object.hasOwn(registry, definition.key)) throw new Error('Duplicate or empty tile type.');
    if (definition.size.width !== 100 || definition.size.height !== 60) throw new Error('Tile dimensions must be 100 by 60.');
    const keys = new Set();
    for (const element of definition.elements) {
      if (!element.key || keys.has(element.key) || !['button', 'lamp', 'text', 'counter'].includes(element.kind)) throw new Error('Invalid or duplicate element.');
      if (element.trackCircuitGroup !== undefined && (element.kind !== 'lamp' || typeof element.trackCircuitGroup !== 'string' || !element.trackCircuitGroup.trim())) throw new Error('Track circuit groups require a nonempty string on a lamp element.');
      keys.add(element.key);
    }
    registry[definition.key] = freeze({ ...definition, diagonalCorners: diagonalCorners[definition.key] ?? [], buttons: definition.elements.filter(element => element.kind === 'button') });
  }
  return Object.freeze(registry);
}
export const TILES = createRegistry([...controls, ...tracks, ...signals, ...routeTargets]);
