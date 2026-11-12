/** Click to open the menu bar; hover between roots while it is open. */
export function createMenuBar() {
  const entries = new Map(); let active = null;
  const close = key => {
    const entry = entries.get(key); if (!entry) return;
    if (active === key) active = null;
    entry.close();
  };
  const open = key => {
    if (active === key) return;
    if (active !== null) close(active);
    active = key; entries.get(key)?.open();
  };
  return {
    register(key, button, entry) {
      entries.set(key, entry);
      button.setAttribute('aria-haspopup','menu');
      const click = () => active === key ? close(key) : open(key);
      const hover = event => { if (event.pointerType !== 'touch' && active !== null) open(key); };
      button.addEventListener('click', click); button.addEventListener('pointerenter', hover);
      return { open: () => open(key), close: () => close(key), dispose() {
        close(key); entries.delete(key); button.removeEventListener('click', click); button.removeEventListener('pointerenter', hover);
      } };
    },
  };
}

/** Touch taps, mouse hover and keyboard focus open the same submenu. */
export function bindSubmenuHover(button, open) {
  button.setAttribute('aria-haspopup', 'menu');
  const enter = event => { if (event.pointerType !== 'touch') open(); };
  button.addEventListener('pointerenter', enter);
  button.addEventListener('focus', open);
  return () => { button.removeEventListener('pointerenter', enter); button.removeEventListener('focus', open); };
}

/** All menu rows reserve the same leading space for a checkmark. */
export function createMenuItem(document, title, { checked, submenu = false } = {}) {
  const button = document.createElement('button'); button.type = 'button';
  const hasCheck = typeof checked === 'boolean';
  button.setAttribute('role', hasCheck ? 'menuitemcheckbox' : 'menuitem');
  if (hasCheck) button.setAttribute('aria-checked', String(checked));
  const mark = document.createElement('span'); mark.className = 'failure-check'; mark.textContent = checked ? '✓' : '';
  const label = document.createElement('span'); label.className = 'failure-label'; label.textContent = title;
  button.append(mark, label);
  if (submenu) { button.className = 'submenu-trigger'; button.setAttribute('aria-expanded','false'); }
  return { button, mark, label };
}

/** Align the first submenu row with its trigger and overlap the parent card slightly. */
export function positionSubmenu(panel, anchor, parent = anchor?.parentElement) {
  if (!anchor || panel.hidden) return;
  const document = panel.ownerDocument;
  const box = anchor.getBoundingClientRect();
  const parentBox = (parent ?? anchor).getBoundingClientRect();
  const width = panel.offsetWidth, height = panel.offsetHeight;
  const first = panel.querySelector('button');
  const inset = first ? first.getBoundingClientRect().top - panel.getBoundingClientRect().top : 0;
  const overlap = 3, margin = 8;
  const maxX = document.documentElement.clientWidth - width - margin;
  const maxY = document.documentElement.clientHeight - height - margin;
  const right = parentBox.right - overlap;
  const left = right <= maxX ? right : parentBox.left - width + overlap;
  panel.style.left = `${Math.max(margin, Math.min(left, maxX))}px`;
  panel.style.top = `${Math.max(margin, Math.min(box.top - inset, maxY))}px`;
}
