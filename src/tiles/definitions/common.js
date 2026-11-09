export const ButtonType = Object.freeze({ PAIRED: 'paired', SINGLE: 'single' });
export const ORIENTATIONS = Object.freeze(['identity', 'mirror-x', 'mirror-y', 'rotate-180']);
export const POINT_SIGNAL_NAMEPLATE_WIDTH = 22;
export const shape = (tag, attrs) => ({ tag, attrs });
export const rail = (x1, y1, x2, y2) => shape('line', { x1, y1, x2, y2, stroke: '#000', 'stroke-width': 10 });
export const button = (key, x, y, color = '#EFEFEF') => ({ key, kind: 'button', labelKey: `buttons.${key}`, x, y, color, type: ButtonType.PAIRED });
export const text = (key, x, y, value, width = 35, height = 12) => ({ key, kind: 'text', x, y, width, height, default: value, fontSize: 8 });
export const lamp = (key, drawing, color = 'yellow') => ({ key, kind: 'lamp', shape: drawing, color, riseMs: 8.75, fallMs: 13.75, brightness: 1 });
export const slot = (x, y, angle = 0) => shape('rect', { x: x - 15, y: y - 2, width: 30, height: 4, rx: 2, ...(angle ? { transform: `rotate(${angle} ${x} ${y})` } : {}) });
export const circle = (x, y, r) => shape('circle', { cx: x, cy: y, r });
export function define(key, geometry = [], elements = [], details = []) {
  return { key, labelKey: `tiles.${key}`, size: { width: 100, height: 60 }, orientations: ORIENTATIONS, geometry, elements, details };
}
export const screws = [
  shape('circle', { cx: 92, cy: 8, r: 4.9, fill: 'none', stroke: '#4c4c4c', 'stroke-width': .2 }),
  shape('line', { x1: 88, y1: 4.7, x2: 96, y2: 11.3, stroke: '#2e2e2e', 'stroke-width': 1.5 }),
  shape('circle', { cx: 8, cy: 52, r: 4.9, fill: 'none', stroke: '#4c4c4c', 'stroke-width': .2 }),
  shape('line', { x1: 3.8, y1: 49.5, x2: 12.2, y2: 54.5, stroke: '#2e2e2e', 'stroke-width': 1.5 }),
];
