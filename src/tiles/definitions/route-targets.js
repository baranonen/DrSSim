import { define, rail, lamp, slot, circle, shape, button, text } from './common.js';

// Source: archived RouteTarget SVG designs with top and bottom nameplates.
// Both track circuit windows repeat one circuit; the round lamp indicates route locking towards the target.
function routeTarget(key, { routeLamp = true, bottomNameplate = false } = {}) {
  const lampX = bottomNameplate ? 16 : 84, lampY = bottomNameplate ? 15 : 45;
  const elements = [lamp('track.1', slot(25, 30)), lamp('track.2', slot(75, 30))];
  const details = [];
  if (routeLamp) {
    elements.push(lamp('route.locked', circle(lampX, lampY, 4)));
    details.push(shape('circle', { cx: lampX, cy: lampY, r: 5, fill: '#000' }));
  }
  elements.push(button('RT', 49.9, 30), text('label.name', 49.5, bottomNameplate ? 47 : 13, ''));
  return define(key, [rail(0, 30, 100, 30)], elements, details);
}
export const routeTargets = [
  routeTarget('RouteTargetWithTopNameplate'),
  routeTarget('RouteTargetWithTopNameplateWithoutRouteLamp', { routeLamp: false }),
  routeTarget('RouteTargetWithBottomNameplate', { bottomNameplate: true }),
];
