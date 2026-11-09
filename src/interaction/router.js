import { ButtonType } from '../tiles.js';
import { hitContains, resolveHit } from './hit-targets.js';

export function isPhoneScreen({ width, height } = {}) {
  return Math.min(width, height) < 744;
}

export function bindInteractionRouter({ scene, buttons, klappes, camera, eventWindow = window, dismissPointerHelp = () => {}, onError = console.error }) {
  const root = scene.svg;
  const abort = new AbortController();
  const capture = { capture: true, signal: abort.signal };
  const pointers = new Map(), keys = new Map(), viewportTouches = new Map();
  let drag = null, pan = null, suppressClick = false;
  const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const safe = fn => event => { try { fn(event); } catch (error) { onError(error); } };
  const isUI = node => !!node?.closest?.('#simulation-ui');
  const hit = (event, kind = event.pointerType || 'mouse') => {
    // During capture event.target is the SVG; dropping on the UI must not reach a button underneath.
    if (isUI(eventWindow.document.elementFromPoint?.(event.clientX, event.clientY))) return null;
    return resolveHit(scene, klappes, event.clientX, event.clientY, kind);
  };
  const releaseCapture = id => { if (root.hasPointerCapture?.(id)) root.releasePointerCapture(id); };
  const keyboardHit = event => scene.hitTargets.get(event.target.closest?.('[data-hit-id]')?.dataset.hitId);
  function startPan(event) {
    consume(event);
    root.setPointerCapture?.(event.pointerId);
    return { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  }

  function movePan(active, event) {
    const dx = event.clientX - active.x, dy = event.clientY - active.y;
    if (!active.moved && Math.hypot(dx, dy) < 4) return;
    camera.pan(dx, dy);
    active.x = event.clientX;
    active.y = event.clientY;
    active.moved = true;
  }

  function finishPan(active, cancelled) {
    if (!cancelled && !active.moved) { buttons.releaseLatches(); klappes.closeAllFixed(); }
    releaseCapture(active.id);
  }

  function focusTarget(target) { (klappes.occupant(target.id) || klappes.fixedClosed(target.id) ? target.coverNode : target.node)?.focus(); }
  let previousPressed = new Set(buttons.pressedIds);
  const unsubscribeFixed = buttons.subscribe(event => {
    if (event.kind !== 'state') return;
    const pressed = new Set(event.pressedIds);
    const released = [...previousPressed].some(id => !pressed.has(id));
    previousPressed = pressed; // Closing a cover may release another button.
    if (released) klappes.closeAllFixed();
  });

  eventWindow.addEventListener('pointerdown', safe(event => {
    if (isUI(event.target)) return;
    if (!drag) suppressClick = false;
    if (event.button === 0 && !root.contains(event.target)) { buttons.releaseLatches(); klappes.closeAllFixed(); }
  }), capture);

  root.addEventListener('pointerdown', safe(event => {
    if (event.button !== 0) return;
    const phoneTouch = event.pointerType === 'touch' && isPhoneScreen(eventWindow.screen);
    if (phoneTouch && viewportTouches.size === 2) {
      consume(event); dismissPointerHelp(); return;
    }
    if (event.target.closest?.('[data-desk-key-switch]')) { consume(event); buttons.releaseAll(); scene.deskKeySwitch?.toggle(); return; }
    if (drag) { consume(event); return; }
    const target = hit(event);
    if (!klappes.carried && target && klappes.fixedClosed(target.id)) {
      consume(event); suppressClick = true; klappes.liftFixed(target.id); return;
    }
    if (klappes.carried || (target && klappes.occupant(target.id))) {
      consume(event); buttons.releaseLatches();
      drag = { id: event.pointerId, kind: event.pointerType || 'mouse' };
      root.setPointerCapture?.(event.pointerId);
      if (!klappes.carried) klappes.pickUp(klappes.occupant(target.id));
      scene.moveGhost(event.clientX, event.clientY);
      return;
    }
    if (target?.kind === 'button') {
      consume(event);
      if (buttons.isBlocked(target.buttonId)) return;
      const button = buttons.buttons.get(target.buttonId);
      const kind = event.pointerType || 'mouse';
      const latchPress = (kind === 'mouse' || phoneTouch) && button.type === ButtonType.PAIRED;
      pointers.set(event.pointerId, { target, kind, latchPress });
      root.setPointerCapture?.(event.pointerId);
      if (latchPress) buttons.mouseDown(target.buttonId, `pointer:${event.pointerId}`, kind);
      else buttons.contactDown(target.buttonId, `pointer:${event.pointerId}`, kind);
      return;
    }
    if (target?.kind === 'storage') { buttons.releaseLatches(); consume(event); return; }
    if (event.pointerType === 'mouse' && !pan) {
      pan = startPan(event);
      root.classList.add('is-panning');
    } else if (phoneTouch && camera?.pinch) {
      if (pointers.size) return;
      viewportTouches.set(event.pointerId, startPan(event));
      if (viewportTouches.size === 2) {
        for (const touch of viewportTouches.values()) touch.moved = true;
        dismissPointerHelp();
      }
    } else if (event.pointerType !== 'mouse') {
      buttons.releaseLatches();
      klappes.closeAllFixed();
    }
  }), capture);

  function endButton(id, cancelled) {
    const entry = pointers.get(id);
    if (!entry) return;
    pointers.delete(id);
    try {
      if (entry.latchPress) buttons.mouseUp(`pointer:${id}`, cancelled);
      else buttons.contactUp(`pointer:${id}`, cancelled);
    } finally { releaseCapture(id); }
  }
  eventWindow.addEventListener('pointermove', safe(event => {
    const touch = viewportTouches.get(event.pointerId);
    if (touch) {
      consume(event);
      if (viewportTouches.size === 2) {
        const before = [...viewportTouches.values()].map(({ x, y }) => ({ x, y }));
        touch.x = event.clientX;
        touch.y = event.clientY;
        camera.pinch(before, [...viewportTouches.values()].map(({ x, y }) => ({ x, y })));
      } else {
        const wasMoving = touch.moved;
        movePan(touch, event);
        if (!wasMoving && touch.moved) dismissPointerHelp();
      }
      return;
    }
    if (drag?.id === event.pointerId) { consume(event); scene.moveGhost(event.clientX, event.clientY); return; }
    if (pan?.id === event.pointerId) {
      consume(event);
      movePan(pan, event);
      return;
    }
    const entry = pointers.get(event.pointerId);
    if (entry && !entry.latchPress && !hitContains(entry.target, scene.screenToWorld(event.clientX, event.clientY), entry.kind)) endButton(event.pointerId, true);
  }), capture);

  function finish(event, cancelled) {
    const touch = viewportTouches.get(event.pointerId);
    if (touch) {
      viewportTouches.delete(event.pointerId);
      consume(event);
      finishPan(touch, cancelled);
    } else if (drag?.id === event.pointerId) {
      consume(event);
      const active = drag; drag = null; suppressClick = true;
      try {
        if (cancelled) klappes.cancel();
        else klappes.drop(hit(event, active.kind)?.id ?? null);
      } finally { scene.hideGhost(); releaseCapture(active.id); }
    } else if (pointers.has(event.pointerId)) { consume(event); endButton(event.pointerId, cancelled); }
    else if (pan?.id === event.pointerId) {
      const active = pan;
      pan = null;
      consume(event);
      root.classList.remove('is-panning');
      finishPan(active, cancelled);
    }
  }
  eventWindow.addEventListener('pointerup', safe(event => finish(event, false)), capture);
  eventWindow.addEventListener('pointercancel', safe(event => finish(event, true)), capture);
  root.addEventListener('lostpointercapture', safe(event => finish(event, true)), capture);

  function accessible(target) {
    if (!klappes.carried && klappes.fixedClosed(target.id)) { klappes.liftFixed(target.id); focusTarget(target); return; }
    if (klappes.carried || klappes.occupant(target.id)) {
      buttons.releaseLatches();
      if (klappes.carried) klappes.drop(target.id); else klappes.pickUp(klappes.occupant(target.id));
      scene.hideGhost(); focusTarget(target);
    } else if (target.kind === 'button' && !buttons.isBlocked(target.buttonId)) {
      if (buttons.buttons.get(target.buttonId).type === ButtonType.PAIRED) buttons.toggleLatch(target.buttonId, 'assistive');
      else buttons.pulse(target.buttonId, 'assistive');
    }
  }
  eventWindow.addEventListener('click', safe(event => {
    if (isUI(event.target)) return;
    if (suppressClick && (event.detail !== 0 || event.pointerType)) { consume(event); suppressClick = false; }
    else if (!root.contains(event.target) && !drag) { buttons.releaseLatches(); klappes.cancel(); }
  }), capture);
  root.addEventListener('click', safe(event => {
    if (event.detail !== 0 || event.pointerType || drag) return;
    const target = keyboardHit(event);
    if (target) { consume(event); accessible(target); }
    else { buttons.releaseLatches(); klappes.cancel(); }
  }), capture);
  root.addEventListener('keydown', safe(event => {
    if (![' ', 'Enter'].includes(event.key)) return;
    if (event.target.closest?.('[data-desk-key-switch]')) { consume(event); if (!event.repeat) scene.deskKeySwitch?.toggle(); return; }
    const target = keyboardHit(event);
    if (!target) return;
    consume(event);
    if (event.repeat || drag) return;
    if (!klappes.carried && !klappes.occupant(target.id) && target.kind === 'button' && buttons.buttons.get(target.buttonId).type === ButtonType.SINGLE) {
      const key = event.code || event.key;
      if (!keys.has(key)) { keys.set(key, target.buttonId); buttons.contactDown(target.buttonId, `key:${key}`, 'keyboard'); }
    } else accessible(target);
  }), capture);
  eventWindow.addEventListener('keyup', safe(event => {
    const key = event.code || event.key;
    if (keys.delete(key)) buttons.contactUp(`key:${key}`);
  }), capture);
  root.addEventListener('contextmenu', event => event.preventDefault(), capture);

  function clear() {
    const ids = new Set([...pointers.keys(), ...viewportTouches.keys(), ...(drag ? [drag.id] : []), ...(pan ? [pan.id] : [])]);
    drag = null; pan = null; pointers.clear(); keys.clear(); viewportTouches.clear();
    klappes.cancel(); buttons.releaseAll(); klappes.closeAllFixed(); scene.hideGhost(); root.classList.remove('is-panning');
    for (const id of ids) releaseCapture(id);
  }
  eventWindow.addEventListener('blur', event => { if (event.target === eventWindow) clear(); }, capture);
  eventWindow.document.addEventListener('visibilitychange', () => { if (eventWindow.document.hidden) clear(); }, capture);
  return { releaseAll: clear, dispose() { clear(); unsubscribeFixed(); abort.abort(); } };
}
