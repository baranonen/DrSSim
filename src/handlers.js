// Publish command events for external observers; the operation model subscribes separately.
// event.buttons: paired or single buttons with their position, identity and type.
export function handlePair(event) {
  window.dispatchEvent(new CustomEvent('drssim:pair', { detail: event }));
}

export function handleSingle(event) {
  window.dispatchEvent(new CustomEvent('drssim:single', { detail: event }));
}

/** A paired button pressed alone still generates electrical press and release events. */
export function handleButton(event) {
  if (event.kind === 'button-down' || event.kind === 'button-up') window.dispatchEvent(new CustomEvent(`drssim:${event.kind}`, { detail: event }));
}
