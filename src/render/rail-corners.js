import { TILES } from '../tiles.js';
import { orientPoint } from './orientation.js';

const corners = {
  topLeft: [0, 0], topRight: [100, 0],
  bottomLeft: [0, 60], bottomRight: [100, 60],
};

export function orientedRailCorners(field) {
  const definition = TILES[field.tile];
  const orientation = field.orientation ?? definition.defaultOrientation ?? 'identity';
  return new Set(definition.diagonalCorners.map(name => {
    const { x, y } = orientPoint(...corners[name], orientation);
    return `${y === 0 ? 'top' : 'bottom'}${x === 0 ? 'Left' : 'Right'}`;
  }));
}

/** Complete only diagonally opposed centerlines meeting at one shared vertex. */
export function resolveRailCorners(desk) {
  const fields = new Map(desk.fields.map(field => [`${field.column},${field.row}`, field]));
  const endpoints = new Map(desk.fields.map(field => [field.address, orientedRailCorners(field)]));
  const result = new Map(desk.fields.map(field => [field.address, new Set()]));
  const at = (column, row) => fields.get(`${column},${row}`);
  const add = (field, corner) => { if (field) result.get(field.address).add(corner); };
  for (const field of desk.fields) {
    const { column, row } = field;
    for (const [corner, dx, opposite, upperCorner, sideCorner] of [
      ['topRight', 1, 'bottomLeft', 'bottomRight', 'topLeft'],
      ['topLeft', -1, 'bottomRight', 'bottomLeft', 'topRight'],
    ]) {
      const diagonal = at(column + dx, row + 1);
      if (!endpoints.get(field.address).has(corner) || !diagonal || !endpoints.get(diagonal.address).has(opposite)) continue;
      add(at(column, row + 1), upperCorner);
      add(at(column + dx, row), sideCorner);
    }
  }
  return result;
}

/** The tile clip retains only the small corner wedge of this shared rail stroke. */
export function railCornerShape(name) {
  const [x, y] = corners[name];
  const dy = name === 'topLeft' || name === 'bottomRight' ? -12 : 12;
  return { tag: 'line', attrs: { x1: x - 20, y1: y - dy, x2: x + 20, y2: y + dy,
    stroke: '#000', 'stroke-width': 10, 'data-rail-corner': name } };
}
