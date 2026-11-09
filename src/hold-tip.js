/** Temporary simulation-layer tip for desk and train commands. */
export function bindHoldTip({ interlocking, trains, i18n, simulation, onChange = () => {}, document = globalThis.document, schedule = setTimeout, cancel = clearTimeout }) {
  const tip = document.querySelector('#hold-tip');
  const label = document.querySelector('#hold-tip-label');
  const message = document.querySelector('#hold-tip-message');
  let timer = null, messageKey = 'tip.holdLonger';
  tip.hidden = true;
  const translate = () => { label.textContent = i18n.t('tip.label'); message.textContent = i18n.t(messageKey); };
  function hide() {
    if (timer !== null) cancel(timer);
    timer = null;
    if (tip.hidden) return;
    tip.hidden = true;
    onChange();
  }
  // Dismiss the existing tip before this press can trigger a new one.
  document.addEventListener('pointerdown', hide, true);
  function show(key, { allowPaused = false } = {}) {
    if (simulation?.paused && !allowPaused) return;
    messageKey = key; translate(); tip.hidden = false; onChange();
    if (timer !== null) cancel(timer);
    timer = schedule(() => { timer = null; hide(); }, 4000);
  }
  const unsubscribe = interlocking.subscribeFeedback(event => {
    if (event.kind === 'hold-too-short') show('tip.holdLonger');
  });
  const unsubscribeTrains = trains?.subscribeFeedback(event => {
    if (event.kind === 'substitute-released-before-departure') show('tip.holdSubstituteUntilPassed');
  }) ?? (() => {});
  const unsubscribeLocale = i18n.subscribe(() => { if (!tip.hidden) { translate(); onChange(); } });
  const dispose = () => {
    unsubscribe(); unsubscribeTrains(); unsubscribeLocale();
    document.removeEventListener('pointerdown', hide, true);
    hide();
  };
  dispose.showIntroductionReplay = () => show('tip.replayIntroduction', { allowPaused: true });
  return dispose;
}
