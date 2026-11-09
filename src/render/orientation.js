export function orientPoint(x, y, orientation = 'identity') {
  return { x: orientation === 'mirror-x' || orientation === 'rotate-180' ? 100 - x : x, y: orientation === 'mirror-y' || orientation === 'rotate-180' ? 60 - y : y };
}
export function orientationMatrix(orientation = 'identity') {
  return { identity: 'matrix(1 0 0 1 0 0)', 'mirror-x': 'matrix(-1 0 0 1 100 0)', 'mirror-y': 'matrix(1 0 0 -1 0 60)', 'rotate-180': 'matrix(-1 0 0 -1 100 60)' }[orientation];
}
