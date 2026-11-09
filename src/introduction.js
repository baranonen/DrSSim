import { createDialogCloseButton } from './overlays.js';
import { compileTisch, fieldInstanceId } from './tisch.js';
import { createScene } from './render/scene.js';
import { ButtonController } from './buttons.js';
import { KlappeController } from './klappes.js';
import { VisualState } from './visual-state.js';
import { bindInteractionRouter, isPhoneScreen } from './interaction/router.js';
import { resolveHit } from './interaction/hit-targets.js';
import { HELP_CATALOG } from './help-catalog.js';
import { HELP_ACTIONS } from './help-actions.js';
import { IntroductionLesson } from './introduction-lesson.js';

export const INTRODUCTION_STORAGE_KEY = 'drssim.introduction.v1';
function browserStorage() { try { return globalThis.localStorage; } catch { return null; } }
export function introductionSeen(storage = browserStorage()) { try { return storage?.getItem(INTRODUCTION_STORAGE_KEY) === 'seen'; } catch { return false; } }
export function rememberIntroduction(storage = browserStorage()) { try { storage?.setItem(INTRODUCTION_STORAGE_KEY, 'seen'); } catch { /* Works without persistent storage. */ } }

export function bindIntroduction({ simulation, i18n, timing, help, bindSounds = () => () => {}, releaseDesk = () => {}, onDismiss = () => {}, document = globalThis.document, storage = browserStorage() }) {
  const dialog = document.createElement('dialog'); dialog.className = 'introduction-shell'; dialog.setAttribute('aria-labelledby', 'introduction-title');
  const panel = document.createElement('section'); panel.className = 'introduction';
  const content = document.createElement('div'); content.className = 'introduction-content';
  const header = document.createElement('div'); header.className = 'introduction-header';
  const progress = document.createElement('progress'); progress.className = 'introduction-progress'; progress.max = 4;
  progress.setAttribute('aria-labelledby', 'introduction-title');
  const close = createDialogCloseButton(document);
  header.append(progress, close);
  const title = document.createElement('h1'); title.id = 'introduction-title'; title.tabIndex = -1;
  const demo = document.createElement('div'); demo.className = 'introduction-demo';
  const lead = document.createElement('div'); lead.className = 'introduction-description';
  const description = document.createElement('div'); description.className = 'introduction-description';
  const task = document.createElement('p'); task.className = 'introduction-task';
  const helpToggle = document.createElement('button'); helpToggle.type = 'button'; helpToggle.className = 'introduction-help-toggle'; helpToggle.setAttribute('role','checkbox');
  const check = document.createElement('span'); check.className = 'introduction-help-check'; const toggleLabel = document.createElement('span'); helpToggle.append(check,toggleLabel);
  const example = document.createElement('div'); example.className = 'help-tooltip introduction-help-example'; example.setAttribute('aria-hidden','true');
  const hint = document.createElement('div'); hint.className = 'introduction-hint'; hint.setAttribute('role', 'status'); hint.setAttribute('aria-live', 'polite');
  const hintLabel = document.createElement('span'); hintLabel.className = 'introduction-hint-label';
  const hintMessage = document.createElement('span'); hint.append(hintLabel, hintMessage);
  const footer = document.createElement('div'); footer.className = 'introduction-footer';
  const next = document.createElement('button'); next.type = 'button'; next.className = 'introduction-next'; footer.append(hint, next);
  content.append(lead, demo, description, task, helpToggle); panel.append(header, title, content, footer); dialog.append(panel); document.body.append(dialog);
  let page = 1, lesson, scene, input, buttons, visuals, observer, frame, resume = false, previousFocus, openingInput = 'mouse', nextPointer = null, unbindDemoSounds = () => {};
  const completedExercises = new Set();
  const view = document.defaultView;
  function clearDemo() {
    hint.hidden = true;
    if (frame != null) view.cancelAnimationFrame(frame);
    frame = null; observer?.disconnect(); observer = null;
    unbindDemoSounds(); unbindDemoSounds = () => {};
    lesson?.dispose(); input?.dispose(); scene?.dispose(); lesson = scene = input = buttons = visuals = null;
    demo.replaceChildren(); demo.inert = false; demo.dataset.completed = 'false';
  }
  function translate() {
    if (lesson?.done) completedExercises.add(page);
    progress.value = completedExercises.size;
    close.setAttribute('aria-label', i18n.t('simulation.close'));
    const paragraphs = i18n.t(`intro.body${page}`).split('\n');
    title.textContent = page === 1 ? paragraphs.shift() : page === 6 ? i18n.t('help.descriptions') : i18n.t(`intro.title${page}`);
    const opening = page === 1 ? [] : paragraphs.splice(0, 1);
    if (page === 2) paragraphs.splice(0, paragraphs.length, paragraphs[openingInput === 'touch' ? 0 : 1]);
    lead.replaceChildren(...opening.map(text => { const p = document.createElement('p'); p.textContent = text; return p; }));
    description.replaceChildren(...paragraphs.map(text => { const p = document.createElement('p'); p.textContent = text; return p; }));
    task.textContent = page === 1 || page === 6 ? '' : i18n.t(`intro.task${page}`);
    helpToggle.hidden = page !== 6;
    if (page === 6) {
      check.textContent = help?.enabled ? '✓' : ''; toggleLabel.textContent = i18n.t('help.descriptions'); helpToggle.setAttribute('aria-checked',String(!!help?.enabled));
      example.hidden = !help?.enabled; example.replaceChildren();
      const name = document.createElement('div'), abbreviation = document.createElement('span'), full = document.createElement('em'); abbreviation.textContent = 'STGD '; full.textContent = HELP_CATALOG.STGD.tr; name.append(abbreviation,full); example.append(name);
      const translation = document.createElement('div'); translation.className = 'help-translation'; const italic = document.createElement('em');
      if (i18n.locale === 'en') italic.textContent = HELP_CATALOG.STGD.en; else { const short = document.createElement('span'); short.textContent = 'HaGT '; translation.append(short); italic.textContent = HELP_CATALOG.STGD.de[1]; }
      translation.append(italic); example.append(translation);
      const desc = document.createElement('p'), action = HELP_ACTIONS.STGD[i18n.locale][0];
      if (i18n.locale !== 'tr') { const heading = document.createElement('span'); heading.textContent = i18n.locale === 'de' ? 'Zusammen drücken mit' : 'Press together with'; desc.append(heading,document.createElement('br')); }
      else { const heading = document.createElement('span'); heading.textContent = 'Bu düğmeyle birlikte'; desc.append(heading,document.createElement('br')); }
      const bullet = document.createElement('span'); bullet.textContent = '• '; const partner = document.createElement('strong'); partner.textContent = action[0]; const result = document.createElement('span'); result.textContent = (i18n.locale === 'tr' ? ' ile ' : i18n.locale === 'de' ? ' um ' : ' to ') + action[1]; desc.append(bullet,partner,result); example.append(desc);
    }
    next.textContent = `${i18n.t(page === 6 ? 'intro.finish' : 'intro.next')} →`;
    next.hidden = page > 1 && page < 6 && !lesson?.done;
    if (lesson?.done && !demo.inert) {
      input?.dispose(); input = null;
      demo.inert = true; demo.dataset.completed = 'true';
    }
    hint.hidden = !next.hidden || !lesson?.hint;
    if (lesson?.hint) { hintLabel.textContent = i18n.t('tip.label'); hintMessage.textContent = i18n.t(['wrong','short'].includes(lesson.hint) ? `intro.${lesson.hint}${lesson.hint === 'wrong' ? page : ''}` : `intro.${lesson.hint}`); }
  }
  function setupDemo() {
    const fields = [];
    const add = (id, address, tile, label) => fields.push({ id, address, tile, ...(label ? { labels: { 'label.name': label } } : {}) });
    if (page === 2) { add('group','0102','MGD-SGD'); add('point','0101','PointToTopRight','1'); }
    if (page === 2) add('track','0201','Track');
    if (page === 4) add('target','0101','RouteTargetWithTopNameplateWithoutRouteLamp','1');
    if (page === 2) add('diagonal','0202','TrackFromBottomLeft');
    if (page === 3 || page === 5 || page === 6) { add('target','0101','RouteTargetWithTopNameplateWithoutRouteLamp','1'); add('signal','0201','ThreeAspectSignalToLeftWithRouteLamp','25'); }
    if (page === 4) { add('stop','0102','STGD'); add('signal','0201','ThreeAspectSignalToLeftWithRouteLamp','25'); }
    if (page === 5 || page === 6) { add('stop','0102','STGD'); add('release','0202','SYIYD'); fields.at(-1).buttons = { SYIYD: { fixedKlappe: 'hexagon' } }; }
    const desk = compileTisch({ version:1, id:`introduction-${page}`, columns: 2, rows: 2, fields });
    demo.style.setProperty('--demo-ratio', `${desk.width} / ${desk.height}`);
    demo.style.setProperty('--demo-width', `${desk.width * 2}px`);
    buttons = new ButtonController({ onChange: () => scene?.updateButtons() });
    const klappes = new KlappeController({ onChange() { for (const id of buttons.buttons.keys()) buttons.setBlocked(id, klappes.isCovered(id)); scene?.updateKlappes(); } });
    unbindDemoSounds = bindSounds(buttons,klappes);
    visuals = new VisualState({ now: () => performance.now() });
    scene = createScene(demo, desk, { buttons, klappes, visuals, i18n, document });
    const lamp = (field, key, mode, color = 'white') => { const elementId = `${fieldInstanceId(desk.id,field)}:${key}`; if (visuals.records.has(elementId)) visuals.apply([{ elementId, value:{ mode, color } }]); };
    function paint() {
      if (page === 2) { lamp('point','point.straight',lesson.accepted ? 'off' : 'on'); lamp('point','point.branch',lesson.done ? 'on' : lesson.accepted ? 'blink' : 'off'); }
      else {
        const route = page === 3 ? lesson.done : page === 5 ? !lesson.done : true;
        const green = page === 3 ? lesson.done : page === 4 ? !lesson.done : false;
        lamp('signal','signal.green',green ? 'on' : 'off','green'); lamp('signal','signal.red',green ? 'off' : 'on','red');
        for (const field of ['signal','target']) for (const key of ['track.1','track.2']) lamp(field,key,route ? 'on' : 'off');
        lamp('target','route.locked',route ? 'on' : 'off'); lamp('signal','signal.route',route ? 'on' : 'off');
      }
      translate();
    }
    if (page === 6) {
      help?.setEnabled(true);
      for (const field of ['signal','target']) for (const key of ['track.1','track.2']) lamp(field,key,'off');
      lamp('signal','signal.red','on','red');
      scene.svg.style.pointerEvents = 'none'; scene.svg.setAttribute('aria-hidden','true'); demo.append(example);
      const resize = () => { const box = demo.getBoundingClientRect(); scene.setViewportSize(box.width,box.height); scene.setCamera({ x:0,y:0,scale:box.width/desk.width }); };
      observer = new ResizeObserver(resize); observer.observe(demo); resize();
      const tick = () => { visuals.renderAt(performance.now()); frame = view.requestAnimationFrame(tick); }; frame = view.requestAnimationFrame(tick);
      return;
    }
    lesson = new IntroductionLesson({ page, buttons, timing: { ...timing, pointMovementMs: 1500 }, onChange: paint });
    buttons.subscribe(event => { if (page === 5 && event.kind === 'button-down' && event.buttons[0].key === 'SYIYD') { const elementId = `${fieldInstanceId(desk.id,'release')}:counter.value`; visuals.apply([{ elementId, value: { value: visuals.get(elementId).value + 1 } }]); } });
    paint();
    const resize = () => { const box = demo.getBoundingClientRect(); scene.setViewportSize(box.width,box.height); scene.setCamera({ x:0,y:0,scale:box.width/desk.width }); };
    observer = new ResizeObserver(resize); observer.observe(demo); resize();
    scene.svg.addEventListener('pointerdown', event => { if (event.button === 0 && !resolveHit(scene, klappes, event.clientX, event.clientY, event.pointerType || 'mouse')) lesson.showInstruction(); }, { capture: true });
    input = bindInteractionRouter({ scene, buttons, klappes, camera: { pan() {} }, eventWindow: view });
    const tick = () => { lesson.tick(); visuals.renderAt(performance.now()); frame = view.requestAnimationFrame(tick); };
    frame = view.requestAnimationFrame(tick);
  }
  function render() {
    clearDemo();
    const isExercise = page > 1 && page < 6;
    demo.hidden = page === 1;
    task.hidden = progress.hidden = !isExercise;
    panel.dataset.page = String(page);
    if (isExercise) panel.insertBefore(title, content);
    else header.insertBefore(title, close);
    content.scrollTop = 0;
    if (page > 1) setupDemo();
    translate(); title.focus();
  }
  function hide(skipped = false) {
    if (!dialog.open) return;
    rememberIntroduction(storage); clearDemo(); dialog.close();
    if (resume) simulation.setPaused(false);
    previousFocus?.focus();
    if (skipped) onDismiss();
  }
  function show() {
    if (dialog.open) return;
    completedExercises.clear();
    previousFocus = document.activeElement; resume = !simulation.paused;
    releaseDesk(); simulation.setPaused(true); openingInput = 'mouse'; nextPointer = null; page = 1; dialog.showModal(); render();
  }
  content.addEventListener('pointerdown',event => { if (event.button === 0 && !demo.contains(event.target)) lesson?.showInstruction(); });
  helpToggle.addEventListener('click',()=>{ help?.setEnabled(!help.enabled); translate(); });
  close.addEventListener('click', () => hide(true));
  dialog.addEventListener('click',event => { if (event.target === dialog) hide(true); });
  dialog.addEventListener('cancel',event => { event.preventDefault(); hide(true); });
  next.addEventListener('pointerdown', event => { nextPointer = event.pointerType; });
  next.addEventListener('pointercancel', () => { nextPointer = null; });
  next.addEventListener('click', event => {
    if (next.hidden) return;
    if (page === 1) {
      const usesDirectTouch = nextPointer === 'touch' && !isPhoneScreen(view.screen);
      openingInput = event.detail !== 0 && usesDirectTouch ? 'touch' : 'mouse';
    }
    nextPointer = null;
    if (page === 6) hide(); else { page++; render(); }
  });
  const keydown = event => { if (event.key !== 'Tab') return; const focusable = [...dialog.querySelectorAll('button:not(:disabled), [tabindex="0"]')].filter(node => !node.closest('[hidden], [inert], [display="none"]')); const first = focusable[0], last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } };
  dialog.addEventListener('keydown',keydown);
  const unsubscribe = i18n.subscribe(() => { if (dialog.open) translate(); });
  if (!introductionSeen(storage)) show();
  return { show, dispose() { hide(); unsubscribe(); dialog.remove(); } };
}
