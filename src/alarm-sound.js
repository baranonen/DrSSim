import { AUDIO_RECORDINGS } from './audio-recordings.js';

const APPROACH_STRIKE_COUNT = 4;
const APPROACH_STRIKE_INTERVAL_SECONDS = 1;
const APPROACH_MAX_DELAY_MS = 250;
const STALLED_PLAYBACK_MS = 500;
const PLAYBACK_RECOVERY_INTERVAL_MS = 5000;

/** Decaying upper harmonics of a small metal bell. */
export function createBellBuffer(context) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .28), context.sampleRate);
  const data = buffer.getChannelData(0), partials = [[1200,1,12], [2062,.5,18], [2955,.3,24], [4685,.13,32]];
  for (let i=0; i<data.length; i++) {
    const t = i/context.sampleRate, attack = Math.min(1, t/.002), tail = Math.min(1, (.28-t)/.01);
    data[i] = .16 * attack * tail * partials.reduce((sum,[hz,gain,decay]) => sum + gain * Math.sin(2*Math.PI*hz*1.3*t) * Math.exp(-decay*1.25*t), 0);
  }
  return buffer;
}
const decodedRecordings = new Map();
/** CC0 recordings; resample local PCM directly to the audio device sample rate. */
export function createClickBuffer(context, kind = 'button') {
  const key = kind === 'cover' ? 'cover' : kind === 'release' ? 'release' : 'button', recording = AUDIO_RECORDINGS[key];
  if (!decodedRecordings.has(key)) {
    const bytes = Uint8Array.from(atob(recording.pcm16), char => char.charCodeAt(0));
    const view = new DataView(bytes.buffer), samples = new Float32Array(bytes.length / 2);
    for (let i=0; i<samples.length; i++) samples[i] = view.getInt16(i*2,true)/32768;
    decodedRecordings.set(key,samples);
  }
  const samples = decodedRecordings.get(key), ratio = recording.sampleRate / context.sampleRate;
  const buffer = context.createBuffer(1,Math.round(samples.length/ratio),context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i=0; i<data.length; i++) {
    const position = i*ratio, lower = Math.min(Math.floor(position),samples.length-1), upper = Math.min(lower+1,samples.length-1);
    data[i] = samples[lower] + (samples[upper]-samples[lower])*(position-lower);
  }
  return buffer;
}
export function bindAlarmSound(engine, { document = globalThis.document, AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext, schedule = setInterval, cancel = clearInterval, simulation, buttons, klappes, now = () => performance.now() } = {}) {
  let context = null, buffer = null, clickBuffers = null, timer = null, disposed = false, pendingResume = null, pendingEffect = null;
  let removeStateListener = () => {};
  const sources = new Set();
  const effectSources = new Set();
  const approachSources = new Set();
  let approachRequestedAt = null;
  let playbackClock = null, lastPlaybackRecovery = -Infinity;
  const approachCircuits = (engine.config?.approachAnnouncementCircuits ?? []).map(id => {
    const relay = engine.gleisrelais.get(id);
    return { relay, wasOccupied: relay.occupied };
  });
  const enabled = () => !simulation || (simulation.soundEnabled && !simulation.paused);
  const effectsEnabled = (allowPaused = false) => !simulation || (simulation.buttonSoundsEnabled && (allowPaused || !simulation.paused));
  const bellsEnabled = () => enabled() && (!simulation || simulation.bellSoundsEnabled);
  const ringing = () => bellsEnabled() && Object.values(engine.alarms).some(Boolean);

  function playBell(activeSources, when = 0) {
    if (context?.state !== 'running') return;
    let source;
    try {
      source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination);
      activeSources.add(source);
      source.onended = () => { activeSources.delete(source); source.disconnect(); };
      source.start(when);
      playbackClock ??= { audioTime: context.currentTime, observedAt: now() };
    } catch {
      // Do not interrupt interlocking notifications if the audio device closes at this point.
      activeSources.delete(source); source?.disconnect();
    }
  }
  function strike() {
    if (ringing()) playBell(sources);
  }
  function stopSources(activeSources) {
    for (const source of activeSources) {
      source.onended = null;
      try { source.stop(); } catch { /* The source has ended or closed. */ }
      source.disconnect();
    }
    activeSources.clear();
  }
  function stopPlayback() {
    if (timer !== null) { cancel(timer); timer = null; }
    stopSources(sources);
  }
  function recoverStalledPlayback() {
    if (document.hidden || context?.state !== 'running' || !(sources.size || effectSources.size || approachSources.size)) {
      playbackClock = null;
      return false;
    }
    const audioTime = context.currentTime, observedAt = now();
    if (!playbackClock || playbackClock.audioTime !== audioTime) {
      playbackClock = { audioTime, observedAt };
      return false;
    }
    if (observedAt - playbackClock.observedAt < STALLED_PLAYBACK_MS ||
        observedAt - lastPlaybackRecovery < PLAYBACK_RECOVERY_INTERVAL_MS) return false;
    // WebKit may report a running context even when its audio clock has stopped.
    lastPlaybackRecovery = observedAt;
    try {
      createContext();
    } catch {
      return false;
    }
    resume(true);
    return true;
  }
  function observeApproachCircuits() {
    let entered = false;
    for (const circuit of approachCircuits) {
      const occupied = circuit.relay.occupied;
      if (occupied && !circuit.wasOccupied) entered = true;
      circuit.wasOccupied = occupied;
    }
    if (!entered || !bellsEnabled() || approachSources.size) return;
    const time = now();
    if (approachRequestedAt === null || time - approachRequestedAt > APPROACH_MAX_DELAY_MS) approachRequestedAt = time;
  }
  function updateApproachBell() {
    if (!bellsEnabled()) {
      approachRequestedAt = null;
      stopSources(approachSources);
      return;
    }
    if (approachRequestedAt === null || context?.state !== 'running') return;
    const requestedAt = approachRequestedAt;
    approachRequestedAt = null;
    if (now() - requestedAt > APPROACH_MAX_DELAY_MS) return;
    const start = context.currentTime;
    for (let strikeIndex = 0; strikeIndex < APPROACH_STRIKE_COUNT; strikeIndex++) {
      playBell(approachSources, start + strikeIndex * APPROACH_STRIKE_INTERVAL_SECONDS);
    }
  }
  function flushEffect() {
    if (!pendingEffect || !effectsEnabled(pendingEffect.allowPaused) || context?.state !== 'running') return;
    const effect = pendingEffect; pendingEffect = null;
    if (now()-effect.at > 250) return; // Delayed Safari permission must not replay stale clicks.
    let source;
    try {
      source = context.createBufferSource(); source.buffer = clickBuffers[effect.kind]; source.connect(context.destination);
      effectSources.add(source); source.onended = () => { effectSources.delete(source); source.disconnect(); }; source.start();
      playbackClock ??= { audioTime: context.currentTime, observedAt: now() };
    } catch { effectSources.delete(source); source?.disconnect(); }
  }
  function click(kind, allowPaused = false) {
    if (disposed || !effectsEnabled(allowPaused)) return;
    pendingEffect = { kind, at: now(), allowPaused }; unlock(allowPaused); update();
  }
  function update() {
    if (disposed) return;
    if (recoverStalledPlayback()) return;
    if (!effectsEnabled(true)) { pendingEffect = null; stopSources(effectSources); }
    else if (pendingEffect && !effectsEnabled(pendingEffect.allowPaused)) pendingEffect = null;
    else flushEffect();
    updateApproachBell();
    if (ringing() && context?.state === 'running') {
      if (timer === null) {
        strike();
        timer = schedule(() => { if (!recoverStalledPlayback()) strike(); }, 70);
      }
    } else stopPlayback();
  }
  function resume(retryPending = false) {
    if (disposed || !context || context.state === 'closed') return;
    if (context.state === 'running') { update(); return; }
    // Coalesce repeated state events. A new interaction or return to the page
    // must not wait on an old permission request: pointerdown may not grant permission.
    if (!retryPending && pendingResume?.context === context) return;
    const request = { context }; pendingResume = request;
    try {
      Promise.resolve(context.resume()).then(() => {
        if (context === request.context) update();
      }).catch(() => {
        // Retry on the next pointerup, touchend or click if permission was not granted.
      }).finally(() => { if (pendingResume === request) pendingResume = null; });
    } catch { if (pendingResume === request) pendingResume = null; }
  }
  function alarmChanged() {
    update();
    if ((ringing() || approachRequestedAt !== null) && !document.hidden) resume();
  }
  function restore() {
    if (document.hidden) playbackClock = null;
    if (!disposed && !document.hidden) { update(); resume(true); }
  }
  function createContext() {
    removeStateListener(); stopPlayback(); stopSources(approachSources); stopSources(effectSources);
    if (context && context.state !== 'closed') {
      try { Promise.resolve(context.close()).catch(() => {}); } catch { /* The context is already closed. */ }
    }
    playbackClock = null;
    context = new AudioContext(); buffer = createBellBuffer(context);
    clickBuffers = { button: createClickBuffer(context), release: createClickBuffer(context,'release'), cover: createClickBuffer(context,'cover') };
    const current = context;
    const onStateChange = () => { if (!disposed && context === current) alarmChanged(); };
    current.addEventListener?.('statechange', onStateChange);
    removeStateListener = () => current.removeEventListener?.('statechange', onStateChange);
  }
  function unlock(allowPaused = false) {
    if (disposed || !AudioContext || (!enabled() && !(allowPaused === true && effectsEnabled(true)))) return;
    try {
      if (!context || context.state === 'closed') createContext();
      resume(true);
    } catch { /* Desk and alarm indicators remain functional without audio support. */ }
  }
  const keySwitchSound = event => {
    if (!event.target?.closest?.('[data-desk-key-switch]')) return;
    if (event.type === 'pointerdown' && event.button !== 0) return;
    if (event.type === 'keydown' && (event.repeat || ![' ', 'Enter'].includes(event.key))) return;
    click('button');
  };
  document.addEventListener('pointerdown', keySwitchSound, true);
  document.addEventListener('keydown', keySwitchSound, true);
  const gestures = ['pointerdown', 'pointerup', 'mousedown', 'touchend', 'click', 'keydown'];
  for (const type of gestures) document.addEventListener(type, unlock, true);
  document.addEventListener('visibilitychange', restore);
  const view = document.defaultView;
  view?.addEventListener('pageshow', restore); view?.addEventListener('focus', restore);
  const unsubscribe = engine.subscribe(() => {
    observeApproachCircuits();
    alarmChanged();
  });
  const unsubscribeSimulation = simulation?.subscribe(() => { if (simulation.paused) stopSources(effectSources); if (enabled()) unlock(); update(); }) ?? (() => {});
  function bindControls(controlButtons, controlKlappes, { allowPaused = false } = {}) {
    const offButtons = controlButtons?.subscribe(event => {
      if (event.kind === 'button-down') click('button',allowPaused);
      else if (event.kind === 'button-up' && event.input === 'release') click('release',allowPaused);
    }) ?? (() => {});
    const offKlappes = controlKlappes?.subscribe(() => click('cover',allowPaused)) ?? (() => {});
    return () => { offButtons(); offKlappes(); };
  }
  const unsubscribeControls = bindControls(buttons,klappes);
  const dispose = () => {
    if (disposed) return;
    disposed = true; unsubscribe(); unsubscribeSimulation(); unsubscribeControls(); removeStateListener();
    for (const type of gestures) document.removeEventListener(type, unlock, true);
    document.removeEventListener('visibilitychange', restore);
    document.removeEventListener('pointerdown', keySwitchSound, true);
    document.removeEventListener('keydown', keySwitchSound, true);
    view?.removeEventListener('pageshow', restore); view?.removeEventListener('focus', restore);
    pendingEffect = null;
    approachRequestedAt = null;
    stopPlayback();
    stopSources(approachSources);
    stopSources(effectSources);
    if (context && context.state !== 'closed') {
      try { Promise.resolve(context.close()).catch(() => {}); } catch { /* The context is already closed. */ }
    }
  };
  dispose.bindControls = bindControls;
  return dispose;
}
