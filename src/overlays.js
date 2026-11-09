const bodyKeys = {
  about: 'simulation.aboutBody',
  counters: 'simulation.confirmCounters',
  train: 'trains.confirmAuthorize',
  returnHome: 'simulation.confirmReturnHome',
};

export function createDialogCloseButton(document) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dialog-close';

  const svgNamespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(svgNamespace, 'svg');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('aria-hidden', 'true');
  const cross = document.createElementNS(svgNamespace, 'path');
  cross.setAttribute('d', 'M4 4l8 8m0-8-8 8');
  icon.append(cross);
  button.append(icon);
  return button;
}

/** Shared dialogs for confirmation and simulator information. */
export function createOverlays({ i18n, document = globalThis.document }) {
  const dialog = document.createElement('dialog'); dialog.className = 'modal-overlay';
  dialog.setAttribute('aria-labelledby','modal-overlay-title');
  const panel = document.createElement('section'); panel.className = 'modal-panel';
  const header = document.createElement('div'); header.className = 'modal-header';
  const title = document.createElement('h2'); title.id = 'modal-overlay-title'; title.tabIndex = -1;
  const close = createDialogCloseButton(document);
  header.append(title,close);
  const body = document.createElement('p'); body.className = 'modal-body';
  const credit = document.createElement('p'); credit.className = 'modal-credit'; credit.textContent = 'Baran Önen, 2026';
  const footer = document.createElement('div'); footer.className = 'modal-actions';
  const no = document.createElement('button'); no.type='button'; no.className='modal-no';
  const yes = document.createElement('button'); yes.type='button'; yes.className='modal-yes';
  footer.append(no,yes); panel.append(header,body,credit,footer); dialog.append(panel); document.body.append(dialog);
  let kind = null, action = null, focusBefore = null;
  function translate() {
    if (!kind) return;
    title.textContent = kind === 'about' ? 'DrSSim' : i18n.t('trains.confirm');
    body.textContent = i18n.t(bodyKeys[kind]);
    close.setAttribute('aria-label', i18n.t('simulation.close'));
    no.textContent = i18n.t('trains.no'); yes.textContent = i18n.t('trains.yes');
    close.hidden = kind !== 'about'; credit.hidden = kind !== 'about'; footer.hidden = kind === 'about';
  }
  function dismiss() { if (!dialog.open) return; action = null; kind = null; dialog.close(); focusBefore?.focus(); }
  function show(next, callback) { if (dialog.open) dismiss(); focusBefore = document.activeElement; kind = next; action = callback ?? null; translate(); dialog.showModal(); title.focus(); }
  close.addEventListener('click',dismiss); no.addEventListener('click',dismiss);
  yes.addEventListener('click',() => { const perform = action; dismiss(); perform?.(); });
  dialog.addEventListener('click',event => { if (event.target === dialog) dismiss(); });
  dialog.addEventListener('cancel',event => { event.preventDefault(); dismiss(); });
  const unsubscribe = i18n.subscribe(translate);
  return { confirmCounters: callback => show('counters',callback), confirmTrain: callback => show('train',callback), confirmReturnHome: callback => show('returnHome',callback), about: () => show('about'), dispose() { dismiss(); unsubscribe(); dialog.remove(); } };
}
