import { POINT_SIGNAL_NAMEPLATE_WIDTH, define, rail, lamp, circle, slot, shape, button, text } from './common.js';
function signal(key, { route = false, trackCircuit = true, four = false, orientation = 'identity', geometry, headOffset = [0, 0], nameplate = [50, 45] } = {}) {
  const details = [shape('rect', { x: 15, y: 9, width: 43, height: 12, rx: 6, fill: '#000' })];
  const elements = [lamp('signal.green', circle(21, 15, 4), 'green'), lamp('signal.red', circle(36, 15, 4), 'red'), lamp('signal.triangle', shape('polygon', { points: '49.5 12.5 52.5 17.5 46.5 17.5', transform: 'rotate(270 49.5 15)' })), button('SD', 50, 30), { ...text('label.name', nameplate[0], nameplate[1], '', POINT_SIGNAL_NAMEPLATE_WIDTH), optional: true }];
  if (four) {
    details.push(shape('polygon', { points: '65.9926593 8.49265927 70.5888533 10.3964652 72.4926593 14.9926593 70.5888533 19.5888533 65.9926593 21.4926593 61.3964652 19.5888533 59.4926593 14.9926593 61.3964652 10.3964652', transform: 'rotate(22.5 65.9926593 14.9926593)', fill: '#000' }), shape('rect', { x: 57.5, y: 13.5, width: 20, height: 3, fill: '#000' }), shape('rect', { x: 77, y: 11, width: 2, height: 8, fill: '#000' }));
    elements.push(lamp('signal.aux', shape('rect', { x: 64.9497475, y: 11.9497475, width: 2, height: 6, transform: `rotate(${orientation === 'mirror-x' ? 45 : -45} 65.9497475 14.9497475)` })));
  } else details.push(shape('rect', { x: 57, y: 13.5, width: 6, height: 3, fill: '#000' }), shape('rect', { x: 63, y: 11, width: 2, height: 8, fill: '#000' }));
  if (route) { details.push(circle(84, 15, 5)); elements.push(lamp('signal.route', circle(84, 15, 4))); if (trackCircuit) elements.push(lamp('track.1', slot(25, 30)), lamp('track.2', slot(75, 30)));  }
  if (headOffset[0] || headOffset[1]) {
    const move = drawing => { drawing.attrs.transform = `translate(${headOffset[0]} ${headOffset[1]}) ${drawing.attrs.transform ?? ''}`.trim(); };
    details.forEach(move);
    elements.filter(element => element.kind === 'lamp' && element.key.startsWith('signal.')).forEach(element => move(element.shape));
  }
  return { ...define(key, geometry ?? [rail(0, 30, 100, 30)], elements, details), defaultOrientation: orientation };
}
export const signals = [
  signal('ThreeAspectSignalToLeft'),
  signal('ThreeAspectSignalToLeftWithRouteLamp', { route: true }),
  signal('ThreeAspectSignalToLeftWithRouteLampWithoutTrackCircuit', { route: true, trackCircuit: false }),
  signal('FourAspectSignalToLeft', { four: true }),
  signal('ThreeAspectSignalToRight', { orientation: 'mirror-x', headOffset: [0, 30], nameplate: [50, 15] }),
  signal('ThreeAspectSignalToRightWithRouteLamp', { route: true, orientation: 'mirror-x', headOffset: [0, 30], nameplate: [50, 15] }),
  signal('ThreeAspectSignalToRightWithRouteLampWithoutTrackCircuit', { route: true, trackCircuit: false, orientation: 'mirror-x', headOffset: [0, 30], nameplate: [50, 15] }),
  signal('FourAspectSignalToRight', { four: true, orientation: 'mirror-x', headOffset: [0, 30], nameplate: [50, 15] }),
  // FourAspectSignalToTopRight.svg: head below, nameplate at top left. Coordinates precede mirror-x.
  signal('FourAspectSignalToTopRight', { four: true, orientation: 'mirror-x', headOffset: [0, 30], nameplate: [61, 15], geometry: [rail(100, 30, 48, 30), rail(50, 30, 0, 0)] }),

  // ShuntingSignalToLeft.svg: top nameplate, central button and two-window head below; no track line.
  define('ShuntingSignalToLeft', [], [
    lamp('signal.red', shape('rect', { x: 31, y: 43, width: 2, height: 6 }), 'red'),
    lamp('signal.shunt', shape('rect', { x: 42.9497475, y: 42.9497475, width: 2, height: 6, transform: 'rotate(-45 43.9497475 45.9497475)' }), 'white'),
    button('SD', 50, 30),
    { ...text('label.name', 49.5, 15, '', POINT_SIGNAL_NAMEPLATE_WIDTH), optional: true },
  ], [
    shape('polygon', { points: '52 42 54 42 54 50 52 50 52 47.5 49.5 47.5 49.5 44.5 52 44.5', fill: '#000' }),
    shape('polygon', { points: '43.5732393 37.3877497 48.1694333 39.2915557 50.0732393 43.8877497 48.1694333 48.4839438 33.4065573 54.601226 28.8143703 52.6934616 26.9105644 48.0972675 28.8143704 43.5010734', transform: 'rotate(22.5 38.4919 45.9945)', fill: '#000' }),
  ]),
];
