import { bindHelp } from './help.js';
import { createOverlays } from './overlays.js';
import { bindIntroduction } from './introduction.js';
import { loadTisch } from './tisch.js';
import { loadRailGraph } from './rail-graph.js';
import { loadModelBindings } from './model-bindings.js';
import { ButtonController } from './buttons.js';
import { KlappeController } from './klappes.js';
import { createScene } from './render/scene.js';
import { VisualState, startVisualClock } from './visual-state.js';
import { VisualBindings } from './visual-bindings.js';
import { bindInteractionRouter } from './interaction/router.js';
import { handlePair, handleSingle, handleButton } from './handlers.js';
import { bindDayNightSelection, bindFaultIndicators } from './desk-controls.js';
import { TrainSimulation, startTrainClock } from './trains.js';
import { bindCounterStorage } from './counter-storage.js';
import { bindTrainsUI } from './trains-ui.js';
import { bindFailuresUI } from './failures-ui.js';
import { bindAlarmSound } from './alarm-sound.js';
import { bindHoldTip } from './hold-tip.js';
import { SimulationControl } from './simulation-control.js';
import { loadSoundPreferences, bindSoundPreferences } from './sound-preferences.js';
import { bindSimulationUI } from './simulation-ui.js';
import { createMenuBar } from './menu-bar.js';
import { bindViewport } from './viewport.js';
import { createI18n, preferredLocale, bindLocalePreference, translateElements } from './i18n.js';
import { loadInterlockingConfig } from './interlocking/config.js';
import { Interlocking, startInterlockingClock } from './interlocking/engine.js';
import { bindInterlockingInput, bindInterlockingDisplay } from './interlocking/desk-adapter.js';

const root = document.querySelector('#desk');
const i18n = createI18n(preferredLocale(navigator));
const refreshLocale = () => { document.documentElement.lang = i18n.locale; translateElements(document, i18n); };
refreshLocale();
const unbindLocaleView = i18n.subscribe(refreshLocale);
const unbindLocalePreference = bindLocalePreference(i18n);
const desk = await loadTisch(new URL(root.dataset.tisch, document.baseURI));
const graph = root.dataset.graph ? await loadRailGraph(new URL(root.dataset.graph, document.baseURI), globalThis.fetch, { allowIncomplete: true }) : null;
const modelBindings = root.dataset.modelBindings ? await loadModelBindings(new URL(root.dataset.modelBindings, document.baseURI), { graph, desk }) : null;
const interlockingConfig = root.dataset.interlocking ? await loadInterlockingConfig(new URL(root.dataset.interlocking, document.baseURI), { graph, modelBindings }) : null;
let scene;
const buttons = new ButtonController({ onPair: handlePair, onSingle: handleSingle, onChange() { scene?.updateButtons(); } });
const klappes = new KlappeController({ onChange() {
  for (const id of buttons.buttons.keys()) buttons.setBlocked(id, klappes.isCovered(id));
  scene?.updateKlappes();
} });
const simulation = new SimulationControl(loadSoundPreferences());
const unbindSoundPreferences = bindSoundPreferences(simulation);
const menuBar = createMenuBar();
const overlays = createOverlays({ i18n });
const now = simulation.now;
const interlocking = interlockingConfig ? new Interlocking(graph, interlockingConfig, { now }) : null;
const unbindCounterStorage = interlocking ? bindCounterStorage(interlocking, desk.id) : () => {};
const visuals = new VisualState({ now, ...(interlocking ? { takt: interlocking.takt } : {}) });
scene = createScene(root, desk, { buttons, klappes, visuals, i18n });
const bindings = new VisualBindings(desk, visuals);
const dayNight = interlocking ? bindDayNightSelection(desk, buttons, visuals, interlocking) : { dispose() {} };
const unbindFaultIndicators = interlocking ? bindFaultIndicators(desk, visuals, interlocking) : () => {};
const unbindInterlockingInput = interlocking ? bindInterlockingInput(interlocking, buttons, modelBindings) : () => {};
const unbindButtonEvents = buttons.subscribe(handleButton);
const unbindInterlockingDisplay = interlocking ? bindInterlockingDisplay(interlocking, modelBindings, bindings) : () => {};
const trains = graph && interlocking ? new TrainSimulation(graph, interlocking) : null;
const stopTrainClock = trains ? startTrainClock(trains, { now, control: simulation }) : () => {};
const unbindTrainsUI = trains ? bindTrainsUI({ trains, graph, modelBindings, interlocking, i18n, menuBar, confirmTrain: overlays.confirmTrain }) : () => {};
const unbindFailuresUI = interlocking ? bindFailuresUI({ interlocking, i18n, menuBar }) : () => {};
const unbindSimulationUI = bindSimulationUI({
  simulation, i18n, menuBar,
  onIntroduction: () => introduction.show(),
  onResetCounters: () => overlays.confirmCounters(() => interlocking?.resetCounters()),
  onReturnHome: () => overlays.confirmReturnHome(() => {
    const url = new URL(location.href);
    url.searchParams.delete('station');
    url.searchParams.delete('desk');
    location.assign(url);
  }),
});
const unbindAlarmSound = interlocking ? bindAlarmSound(interlocking, { simulation, buttons, klappes }) : () => {};
const stopInterlockingClock = interlocking ? startInterlockingClock(interlocking, { simulation }) : () => {};
const resetButton = document.querySelector('#reset-view');
const camera = bindViewport(document.querySelector('#viewport'), scene, { width: desk.width, height: desk.height, onChange(view) { resetButton.hidden = view.isAtFit; } });
const help = bindHelp({ scene, desk, modelBindings, routes: interlockingConfig?.routes ?? [], buttons, klappes, i18n, menuBar, holdTip: document.querySelector('#hold-tip'), onIntroduction: () => introduction.show(), onAbout: overlays.about });
const unbindHoldTip = interlocking ? bindHoldTip({ interlocking, trains, i18n, simulation, onChange: help.positionOverlays }) : () => {};
const input = bindInteractionRouter({ scene, buttons, klappes, camera, dismissPointerHelp: help.dismissPointerHelp });
resetButton.addEventListener('click', () => camera.reset());
const stopClock = startVisualClock(visuals, { simulation });
const introduction = bindIntroduction({ simulation, i18n, help, timing: interlocking?.config ?? { routeHoldMs: 100, routeOperationMs: 500, controlHoldMs: 100, controlOperationMs: 500 }, bindSounds: (buttons,klappes) => unbindAlarmSound.bindControls?.(buttons,klappes,{ allowPaused:true }) ?? (() => {}), releaseDesk: () => input.releaseAll(), onDismiss: () => unbindHoldTip.showIntroductionReplay?.() });
export const runtime = { desk, graph, modelBindings, interlocking, trains, simulation, scene, buttons, klappes, visuals, bindings, camera, dayNight, introduction, dispose() { help.dispose(); introduction.dispose(); overlays.dispose(); unbindSoundPreferences(); unbindLocalePreference(); unbindLocaleView(); unbindSimulationUI(); unbindHoldTip(); input.dispose(); unbindTrainsUI(); unbindFailuresUI(); unbindAlarmSound(); stopTrainClock(); unbindFaultIndicators(); dayNight.dispose(); unbindInterlockingInput(); unbindButtonEvents(); unbindInterlockingDisplay(); unbindCounterStorage(); stopInterlockingClock(); interlocking?.dispose(); camera.dispose(); stopClock(); scene.dispose(); } };
