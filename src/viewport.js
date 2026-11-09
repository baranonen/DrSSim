import { ViewTransform } from './view-transform.js';

export function bindViewport(viewport, scene, { width, height, onChange = () => {} }) {
  const view = new ViewTransform(width, height);
  const abort = new AbortController();
  const draw = () => { scene.setCamera(view); onChange(view); };
  const resize = () => {
    const rect = viewport.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    view.resize(rect.width, rect.height);
    scene.setViewportSize(rect.width, rect.height);
    draw();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  viewport.addEventListener('wheel', event => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
    const delta = Math.max(-600, Math.min(600, event.deltaY * unit));
    view.zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-delta * .0015));
    draw();
  }, { passive: false, signal: abort.signal });
  function pinch(before, after) {
    const rect = viewport.getBoundingClientRect();
    const center = ([a, b]) => ({ x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top });
    const distance = ([a, b]) => Math.hypot(b.x - a.x, b.y - a.y);
    const start = center(before), end = center(after);
    const startDistance = distance(before), endDistance = distance(after);
    if (startDistance && endDistance) view.zoomAt(start.x, start.y, endDistance / startDistance);
    view.pan(end.x - start.x, end.y - start.y);
    draw();
  }
  return { view, reset() { view.reset(); draw(); }, pan(dx, dy) { view.pan(dx, dy); draw(); }, pinch, dispose() { abort.abort(); observer.disconnect(); } };
}
