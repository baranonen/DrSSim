import { define, button, text, screws, shape, lamp, circle, ButtonType } from './common.js';

// The symbol is 60 units wide and scales around its center.
const interlockingScale = 'translate(50 30) scale(0.75) translate(-50 -30)';
// Ten 45-degree strokes in each direction are geometrically clipped to the symbol rectangle.
const interlockingHatching = Array.from({ length: 10 }, (_, index) => {
  const left = 11, right = 89, top = 5.5, bottom = 54.5;
  const offset = left - bottom + (index + 1) * ((right - top) - (left - bottom)) / 11;
  return shape('line', {
    x1: Math.max(left, top + offset), y1: Math.max(top, left - offset),
    x2: Math.min(right, bottom + offset), y2: Math.min(bottom, right - offset),
    stroke: '#000', 'stroke-width': 1, 'stroke-linecap': 'butt', transform: interlockingScale,
  });
}).flatMap(line => [line, shape('line', { ...line.attrs, x1: 100 - line.attrs.x1, x2: 100 - line.attrs.x2 })]);

// Named lamp windows are label-sized and remain readable when unlit.
const namedLamp = (key, caption, x, color = 'white', initialMode = 'off') => ({
  ...lamp(key, shape('rect', { x: x - 15, y: 4, width: 30, height: 16 }), color),
  caption, captionX: x, captionY: 14.5, offColor: '#999b93', initialMode,
});
const single = (key, x, y) => ({ ...button(key, x, y), type: ButtonType.SINGLE });

// Button and counter share bounds 20.3..79.7, centered on the 100-unit tile.
const counterButtonX = 27.2;
const counterX = 60.2;
const operationCounter = () => ({ key: 'counter.value', kind: 'counter', x: counterX, y: 30, width: 39, height: 16, fontSize: 11, digits: 5, default: 0 });


export const controls = [
  define('Field', [], [{ ...text('label.name', 50, 30, '', 70), optional: true }]),
  define('BorderTopBottomLeft', [shape('path', { d: 'M100 1 H1 V59 H100', fill: 'none', stroke: '#000', 'stroke-width': 2, 'stroke-linecap': 'butt' })]),
  define('BorderTopBottom', [shape('path', { d: 'M0 1 H100 M0 59 H100', fill: 'none', stroke: '#000', 'stroke-width': 2, 'stroke-linecap': 'butt' })]),
  define('BorderHalfLeft', [shape('path', { d: 'M0 1 H50 V59 H0', fill: 'none', stroke: '#000', 'stroke-width': 2, 'stroke-linecap': 'butt' })]),
  define('BorderTopBottomRight', [shape('path', { d: 'M0 1 H99 V59 H0', fill: 'none', stroke: '#000', 'stroke-width': 2, 'stroke-linecap': 'butt' })]),
  define('BorderTopBottomWithInterlockingSymbol', [shape('path', { d: 'M0 1 H100 M0 59 H100', fill: 'none', stroke: '#000', 'stroke-width': 2, 'stroke-linecap': 'butt' })], [], [
    ...interlockingHatching,
    shape('rect', { x: 11, y: 5.5, width: 78, height: 49, fill: 'none', stroke: '#000', 'stroke-width': 2, transform: interlockingScale }),
    shape('rect', { x: 18.5, y: 13.5, width: 63, height: 10, fill: '#000', transform: interlockingScale }),
    shape('circle', { cx: 50, cy: 41.2, r: 7.2, fill: '#000', transform: interlockingScale }),
  ]),
  define('GE-GU', [], [
    { ...button('GE', 20.5, 30), type: ButtonType.SINGLE },
    { ...button('GU', 79.5, 30), type: ButtonType.SINGLE },
    text('label.GE', 20.5, 47, 'GE'), text('label.GU', 79.5, 47, 'GÜ'),
    lamp('mode.night', circle(20.5, 10, 4.5)), lamp('mode.day', circle(79.5, 10, 4.5)),
  ]),
  define('MGD-SGD', [], [button('MGD', 20.5, 30, '#58AEFF'), button('SGD', 79.5, 30, '#D10000'), text('label.MGD', 20.5, 47, 'MGD'), text('label.SGD', 79.5, 47, 'SGD')]),
  define('STGD', [], [button('STGD', 49.5, 30, '#D10000'), text('label.name', 49.5, 47, 'STGD')], screws),
  define('YSGD', [], [button('YSGD', counterButtonX, 30, '#D10000'), text('label.name', counterX, 47, 'YSGD'), operationCounter()], screws),
  define('MYD', [], [button('MYD', counterButtonX, 30, '#58AEFF'), text('label.name', counterX, 47, 'MYD'), operationCounter()], screws),
  define('SAM-MAM', [], [
    namedLamp('fault.signal', 'SAM', 25, 'red'), namedLamp('fault.point', 'MAM', 75, 'red'),
    single('CSD_SIGNAL', 20, 47), single('CSD_POINT', 80, 47), text('label.name', 50, 47, 'ÇSD', 25),
  ]),
  define('SM', [], [namedLamp('supply.1', 'ŞM1', 25, 'white', 'on'), namedLamp('supply.2', 'ŞM2', 75)]),
  define('BATTERY-60', [], [
    namedLamp('charge', '60Şa', 25, 'white', 'on'), namedLamp('discharge', '60De', 75, 'red'),
    single('CSD_60', 50, 30), text('label.name', 50, 47, 'ÇSD', 25),
  ]),
  define('BATTERY-12', [], [
    namedLamp('charge', '12Şa', 25, 'white', 'on'), namedLamp('discharge', '12De', 75, 'red'),
    single('CSD_12', 50, 30), text('label.name', 50, 47, 'ÇSD', 25),
  ]),
  define('DIS-MIS', [], [
    namedLamp('mode.continuous', 'DİŞ', 25), namedLamp('mode.local', 'MİŞ', 75, 'white', 'on'),
    button('DISD', 10, 47), button('DGBD', 90, 47), text('label.name', 50, 47, 'DİŞD | DGBD', 56),
  ]),
  define('TCS', [], [text('label.name', counterX, 47, 'TÇS'), operationCounter()], screws),
  define('SYIYD', [], [button('SYIYD', counterButtonX, 30, '#48B96A'), text('label.name', counterX, 47, 'SYİYD'), operationCounter()], screws),
];
