import { POINT_SIGNAL_NAMEPLATE_WIDTH, define, rail, lamp, slot, button, text, shape } from './common.js';
// Rail strokes are clipped per tile; matched diagonal endpoints add neighboring corner wedges.
const pointToTopRight = define('PointToTopRight', [rail(0, 30, 100, 30), rail(50, 30, 100, 0)], [lamp('point.straight', slot(75, 30)), lamp('point.branch', slot(77.5, 13.5, -31)), button('MD', 66.5, 44.5), text('label.name', 87, 45, '', POINT_SIGNAL_NAMEPLATE_WIDTH)]);
const pointWithAdjacent = define('PointToTopRightWithAdjacentTrackCircuit', pointToTopRight.geometry, [
  ...pointToTopRight.elements,
  // The common port is on the left; mirror-x places the standard window to the right of point 13.
  { ...lamp('track.adjacent', slot(25, 30)), trackCircuitGroup: 'adjacent' },
], pointToTopRight.details);
const derailerShoulder = 82.93;
const derailerTip = derailerShoulder + 5 / Math.tan(35 * Math.PI / 180); // The angle between the two tip edges is 70 degrees.
const derailerLampLength = 22;
const downLeftExtension = 6;
const downLeftTransform = `rotate(${180 - Math.atan2(30, 50) * 180 / Math.PI} 50 30)`;
const derailer = define('Derailer', [
  shape('polygon', { points: `0,25 ${derailerShoulder},25 ${derailerTip},30 ${derailerShoulder},35 0,35`, fill: '#000' }),
  pointToTopRight.geometry[1],
], [
  lamp('point.straight', shape('rect', { x: 60, y: 28, width: derailerLampLength, height: 4, rx: 2 })),
  ...pointToTopRight.elements.slice(1),
]);
// Thin strokes identify the available curved connection(s), independent of lamp state.
// This geometry slopes down to the right: the EKW curve lies above the crossing.
const slipHalfAngle = Math.atan2(30, 50) / 2;
const slipUpperCornerX = (25 + 5 * Math.hypot(1, 30 / 50)) / (30 / 50);
function slipMark(upper) {
  // Place the stroke on the angle bisector, with its midpoint facing the rail corner.
  const side = upper ? 1 : -1;
  const cornerX = upper ? slipUpperCornerX : 100 - slipUpperCornerX;
  const cornerY = upper ? 25 : 35;
  const x = cornerX + side * 4.25 * Math.sin(slipHalfAngle);
  const y = cornerY - side * 4.25 * Math.cos(slipHalfAngle);
  const dx = 9 * Math.cos(slipHalfAngle), dy = 9 * Math.sin(slipHalfAngle);
  return shape('line', { x1: x - dx, y1: y - dy, x2: x + dx, y2: y + dy, stroke: '#000', 'stroke-width': .75 });
}
const slipMarks = [slipMark(true), slipMark(false)];
function crossingPoint(key, { single = false } = {}) {
  return define(key, [rail(0, 30, 100, 30), rail(0, 0, 50, 30), rail(50, 30, 100, 60)], [
    { ...lamp('point.1.straight', slot(25, 30)), trackCircuitGroup: 'point-1' }, { ...lamp('point.1.branch', slot(22.5, 13.5, 31)), trackCircuitGroup: 'point-1' },
    { ...button('MD1', 33.5, 44.5), labelKey: 'buttons.MD' }, text('label.name1', 13, 45, '', POINT_SIGNAL_NAMEPLATE_WIDTH),
    { ...lamp('point.2.straight', slot(75, 30)), trackCircuitGroup: 'point-2' }, { ...lamp('point.2.branch', slot(77.5, 46.5, 31)), trackCircuitGroup: 'point-2' },
    { ...button('MD2', 66.5, 15.5), labelKey: 'buttons.MD' }, text('label.name2', 87, 15, '', POINT_SIGNAL_NAMEPLATE_WIDTH),
  ], single ? [slipMarks[0]] : slipMarks);
}
export const tracks = [
  define('Track', [rail(0, 30, 100, 30)]),
  define('TrackWithBufferStop', [
    rail(0, 30, 100, 30),
    shape('path', { d: 'M91.6 17.5 H98.5 V42.5 H91.6', fill: 'none', stroke: '#000', 'stroke-width': 2.7, 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter' }),
  ]),
  define('TrackFromBottomLeft', [shape('polyline', { points: '0,60 50,30 100,30', fill: 'none', stroke: '#000', 'stroke-width': 10 })]),
  define('TrackDiagonalUp', [rail(0, 60, 100, 0)]),
  define('TrackDiagonalDown', [rail(0, 0, 100, 60)]),
  define('TrackCrossing', [rail(0, 60, 100, 0), rail(0, 0, 100, 60)]),
  define('TrackWithTrackCircuit', [rail(0, 30, 100, 30)], [lamp('track.1', slot(25, 30)), lamp('track.2', slot(75, 30))]),
  define('PointFromBottomLeft', [rail(0, 30, 100, 30), rail(50, 30, 0, 60)], [lamp('point.straight', slot(25, 30)), lamp('point.branch', slot(22.5, 46.5, -31)), button('MD', 33.5, 15.5), text('label.name', 13, 15, '000', POINT_SIGNAL_NAMEPLATE_WIDTH)]),
  define('PointFromTopLeftToBottomRight', [rail(0, 0, 100, 60), rail(50, 30, 100, 30)], [lamp('point.straight', slot(75, 30)), lamp('point.branch', slot(77.5, 46.5, 31)), button('MD', 66.5, 15.5), text('label.name', 87, 15, '', POINT_SIGNAL_NAMEPLATE_WIDTH)]),
  crossingPoint('DoublePoint'),
  crossingPoint('SingleSlip', { single: true }),
  define('DerailerLeftDown', [
    rail(0, 30, 100, 30),
    shape('polygon', { points: `50,25 ${derailerShoulder + downLeftExtension},25 ${derailerTip + downLeftExtension},30 ${derailerShoulder + downLeftExtension},35 50,35`, fill: '#000', transform: downLeftTransform }),
  ], [
    lamp('point.straight', slot(25, 30)),
    lamp('point.branch', shape('rect', { ...derailer.elements[0].shape.attrs, x: derailer.elements[0].shape.attrs.x + downLeftExtension, transform: downLeftTransform })),
    button('MD', 33.5, 15.5),
    text('label.name', 13, 15, '', POINT_SIGNAL_NAMEPLATE_WIDTH),
  ]),
  define('DiagonalDerailerLeft', [
    shape('polyline', { points: '100,30 50,30 0,0', fill: 'none', stroke: '#000', 'stroke-width': 10 }),
    shape('polygon', { points: '50,25 17.07,25 9.93,30 17.07,35 50,35', fill: '#000' }),
  ], [
    lamp('point.straight', slot(25, 15, 31)),
    lamp('point.branch', shape('rect', { x: 18, y: 28, width: derailerLampLength, height: 4, rx: 2 })),
    button('MD', 33.5, 45),
    text('label.name', 13, 45, '', POINT_SIGNAL_NAMEPLATE_WIDTH),
  ]),
  define('DoubleSlipLeftControl', [
    rail(0, 30, 100, 30),
    rail(0, 60, 50, 30),
    rail(50, 30, 100, 0),
  ], [
    lamp('point.straight', slot(25, 30)),
    lamp('point.branch', slot(22.5, 46.5, -31)),
    button('MD', 33.5, 15.5),
    text('label.name', 13, 15, '', POINT_SIGNAL_NAMEPLATE_WIDTH),
  ], slipMarks.map(mark => shape(mark.tag, { ...mark.attrs, transform: 'matrix(1 0 0 -1 0 60)' }))),
  pointToTopRight,
  pointWithAdjacent,
  derailer,
];
