export function hitContains(target, point, inputKind = 'mouse') {
  const dx = point.x - target.x, dy = point.y - target.y;
  if (target.kind === 'storage') return Math.abs(dx) <= target.width / 2 && Math.abs(dy) <= target.height / 2;
  const radius = inputKind === 'mouse' ? target.radius : target.touchRadius;
  return dx * dx + dy * dy <= radius * radius;
}
export function resolveHit(scene, klappes, clientX, clientY, inputKind = 'mouse') {
  const point = scene.screenToWorld(clientX, clientY);
  const candidates = [...scene.hitTargets.values()].filter(target => hitContains(target, point, inputKind));
  candidates.sort((a, b) => Number(!!klappes.occupant(b.id) || klappes.fixedClosed(b.id)) - Number(!!klappes.occupant(a.id) || klappes.fixedClosed(a.id))
    || (point.x - a.x) ** 2 + (point.y - a.y) ** 2 - (point.x - b.x) ** 2 - (point.y - b.y) ** 2 || a.id.localeCompare(b.id));
  return candidates[0] ?? null;
}
