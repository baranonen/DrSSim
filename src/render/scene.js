import { resolveRailCorners, railCornerShape } from './rail-corners.js';
import { TILES } from '../tiles.js';
import { screenPosition } from '../layout.js';
import { fieldInstanceId } from '../tisch.js';
import { createI18n } from '../i18n.js';
import { VisualState } from '../visual-state.js';
import { svgNode, drawShape, drawBorder } from './primitives.js';
import { orientPoint, orientationMatrix } from './orientation.js';
import { PALETTE, LAMP_GRADIENTS } from './palette.js';
let sequence = 0;

export function createScene(container, desk, { buttons, klappes, visuals = new VisualState(), i18n = createI18n(), document: doc = globalThis.document }) {
  const prefix = `drssim-scene-${++sequence}`;
  const svg = svgNode(doc, 'svg', { width: '100%', height: '100%', role: 'group', 'aria-label': i18n.t('desk.dimensions', desk), 'data-scene': desk.id });
  const defs = svgNode(doc, 'defs', {}, svg);
  const lampPaints = Object.fromEntries(Object.entries(LAMP_GRADIENTS).map(([color, stops]) => {
    const id = `${prefix}-lamp-${color}`;
    const gradient = svgNode(doc, 'radialGradient', { id, cx: '50%', cy: '50%', r: '60%', 'color-interpolation': 'sRGB' }, defs);
    stops.forEach((stopColor, index) => svgNode(doc, 'stop', { offset: ['0%', '55%', '100%'][index], 'stop-color': stopColor }, gradient));
    return [color, `url(#${id})`];
  }));
  const dome = svgNode(doc, 'radialGradient', { id: `${prefix}-dome`, cx: '50%', cy: '40%', r: '75%' }, defs);
  for (const [offset, color, opacity] of [['0%', '#fff', .25], ['35%', '#fff', .06], ['75%', '#000', 0], ['100%', '#000', .12]]) svgNode(doc, 'stop', { offset, 'stop-color': color, 'stop-opacity': opacity }, dome);
  const coverPaint = svgNode(doc, 'radialGradient', { id: `${prefix}-cover-dome`, cx: '50%', cy: '40%', r: '75%' }, defs);
  for (const [offset, color] of [['0%', '#e15d59'], ['38%', '#cd2421'], ['100%', '#ad201f']]) svgNode(doc, 'stop', { offset, 'stop-color': color }, coverPaint);
  const coverMetal = svgNode(doc, 'linearGradient', { id: `${prefix}-cover-metal`, x1: '0%', y1: '0%', x2: '0%', y2: '100%' }, defs);
  for (const [offset, color] of [['0%', '#9b9f9c'], ['45%', '#c4c7c4'], ['100%', '#8c918e']]) svgNode(doc, 'stop', { offset, 'stop-color': color }, coverMetal);
  const tableClip = svgNode(doc, 'clipPath', { id: `${prefix}-table` }, defs);
  svgNode(doc, 'rect', { width: desk.width, height: desk.height }, tableClip);
  const filter = svgNode(doc, 'filter', { id: `${prefix}-button-shadow`, x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
  svgNode(doc, 'feGaussianBlur', { stdDeviation: 2 }, filter);
  svgNode(doc, 'feColorMatrix', { type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .5 0' }, filter);
  const insetShadow = svgNode(doc, 'filter', { id: `${prefix}-indicator-inset`, x: '-20%', y: '-20%', width: '140%', height: '140%' }, defs);
  svgNode(doc, 'feGaussianBlur', { stdDeviation: .2 }, insetShadow);
  const world = svgNode(doc, 'g', { 'data-layer': 'world' }, svg);
  // Keep backgrounds separate from the bounded rail layer.
  const layers = Object.fromEntries(['backgrounds', 'borders', 'rails', 'details', 'lamps', 'labels', 'controls', 'covers'].map(name => [name, svgNode(doc, 'g', { 'data-layer': name }, world)]));
  layers.rails.setAttribute('clip-path', `url(#${prefix}-table)`);
  const dragLayer = svgNode(doc, 'g', { 'data-layer': 'drag', 'pointer-events': 'none' }, svg);
  const ghost = svgNode(doc, 'circle', { r: 10.53, fill: `url(#${prefix}-cover-dome)`, stroke: '#791b1a', 'stroke-width': .81, opacity: .85, display: 'none' }, dragLayer);
  const fields = new Map(), elements = new Map(), hitTargets = new Map(), buttonElements = new Map();
  const translatedLabels = new Map(), storageGroups = [];
  let camera = { x: 0, y: 0, scale: 1 };
  let disposed = false, deskKeySwitch = null;

  function addTarget(target, parent) {
    const attrs = { 'data-hit-id': target.id, role: 'button', tabindex: 0, 'aria-label': target.label };
    if (target.buttonId) attrs['data-button-id'] = target.buttonId;
    const node = svgNode(doc, 'g', attrs, parent);
    const coverNode = svgNode(doc, 'g', { 'data-hit-id': target.id, role: 'button', tabindex: -1, display: 'none' }, layers.covers);
    if (target.fixedKlappe === 'hexagon') {
      const radius = 9.72, halfHeight = radius * Math.sin(Math.PI / 3);
      const points = Array.from({length: 6}, (_, i) => { const angle = Math.PI / 3 * i; return `${target.x + radius * Math.cos(angle)},${target.y + radius * Math.sin(angle)}`; }).join(' ');
      svgNode(doc, 'polygon', { points, fill: '#b72b29', stroke: '#791b1a', 'stroke-width': .648 }, coverNode);
      svgNode(doc, 'rect', { x: target.x - radius * .4, y: target.y + halfHeight, width: radius * .8, height: 2 * halfHeight / 5, fill: `url(#${prefix}-cover-metal)`, stroke: '#717573', 'stroke-width': .18 }, coverNode);
    } else svgNode(doc, 'circle', { cx: target.x, cy: target.y, r: 9.72, fill: `url(#${prefix}-cover-dome)`, stroke: '#791b1a', 'stroke-width': .648 }, coverNode);
    const record = { ...target, node, coverNode };
    hitTargets.set(target.id, record);
    klappes.registerTarget({ id: target.id, kind: target.kind, buttonId: target.buttonId, fixedKlappe: target.fixedKlappe, label: target.label });
    return record;
  }

  const railCorners = resolveRailCorners(desk);
  for (const field of desk.fields) {
    const definition = TILES[field.tile];
    const instanceId = fieldInstanceId(desk.id, field.id);
    const position = screenPosition(field.column, field.row, desk.rows);
    const orientation = field.orientation ?? definition.defaultOrientation ?? 'identity';
    const matrix = orientationMatrix(orientation);
    const translated = `translate(${position.x} ${position.y})`;
    const fieldGroup = svgNode(doc, 'g', { transform: translated, 'data-address': field.address, 'data-field-id': field.id, 'data-instance-id': instanceId, 'data-row': field.row, 'data-column': field.column }, layers.backgrounds);
    if (field.id !== 'desk-key-switch-lower') svgNode(doc, 'rect', { width: 100, height: field.id === 'desk-key-switch' ? 120 : 60, fill: '#b5b8b1' }, fieldGroup);
    fields.set(field.address, fieldGroup);
    const groups = {};
    for (const name of ['rails', 'borders', 'details', 'lamps', 'labels']) groups[name] = svgNode(doc, 'g', { transform: translated, 'data-owner': instanceId }, layers[name]);
    const clipId = `${prefix}-tile-${field.column}-${field.row}`;
    const tileClip = svgNode(doc, 'clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' }, defs);
    svgNode(doc, 'rect', { width: 100, height: 60 }, tileClip);
    groups.rails.setAttribute('clip-path', `url(#${clipId})`);
    const railGroup = svgNode(doc, 'g', { transform: matrix }, groups.rails);
    for (const drawing of definition.geometry) drawShape(doc, drawing, railGroup);
    for (const corner of railCorners.get(field.address)) drawShape(doc, railCornerShape(corner), groups.rails);
    drawBorder(doc, groups.borders, { omitBottom: field.id === 'desk-key-switch', omitTop: field.id === 'desk-key-switch-lower' });
    const detailGroup = svgNode(doc, 'g', { transform: matrix }, groups.details);
    for (const drawing of definition.details) drawShape(doc, drawing, detailGroup);
    const lampGroup = svgNode(doc, 'g', { transform: matrix }, groups.lamps);

    for (const element of definition.elements) {
      const id = `${instanceId}:${element.key}`;
      if (element.kind === 'lamp') {
        const group = svgNode(doc, 'g', { 'data-element-id': id }, lampGroup);
        drawShape(doc, element.shape, group, { fill: element.offColor ?? PALETTE.off });
        const active = drawShape(doc, element.shape, group, { fill: lampPaints[element.color], opacity: 0 });
        if (element.caption) {
          const { x, y, width, height } = element.shape.attrs;
          svgNode(doc, 'rect', { x: x + 1, y: y + 1, width: width - 2, height: height - 2, fill: 'none', stroke: '#20221e', 'stroke-opacity': .14, 'stroke-width': .9, filter: `url(#${prefix}-indicator-inset)`, 'pointer-events': 'none' }, group);
          svgNode(doc, 'rect', { x: x + .3, y: y + .3, width: width - .6, height: height - .6, fill: 'none', stroke: '#30322e', 'stroke-opacity': .75, 'stroke-width': .5, 'pointer-events': 'none' }, group);
          svgNode(doc, 'text', { x: element.captionX, y: element.captionY, 'text-anchor': 'middle', 'font-family': 'Arial, Helvetica, sans-serif', 'font-size': 8, fill: '#454640', 'pointer-events': 'none' }, group).textContent = element.caption;
        }
        visuals.register(id, element, element.initialMode ? { mode: element.initialMode, color: element.color } : undefined);
        elements.set(id, { definition: element, node: group, active });
        continue;
      }
      const point = orientPoint(element.x, element.y, orientation);
      if (element.kind === 'button') {
        const labelKey = field.buttons?.[element.key]?.labelKey ?? element.labelKey;
        const button = { ...element, label: i18n.t(labelKey), ...field.buttons?.[element.key], id, fieldId: field.id, address: field.address, row: field.row, column: field.column, tile: field.tile };
        buttons.register(button);
        const x = position.x + point.x, y = position.y + point.y;
        const target = addTarget({ id: `button:${id}`, kind: 'button', buttonId: id, x, y, radius: 16, touchRadius: 24, label: i18n.t('desk.buttonPosition', button), fixedKlappe: button.fixedKlappe }, layers.controls);
        translatedLabels.set(target.id,()=>i18n.t('desk.buttonPosition',{...button,label:field.buttons?.[element.key]?.label ?? i18n.t(labelKey)}));
        svgNode(doc, 'circle', { cx: x, cy: y, r: 7, fill: '#000', filter: `url(#${prefix}-button-shadow)` }, target.node);
        svgNode(doc, 'circle', { cx: x, cy: y, r: 6.9, fill: element.color, stroke: '#313131', 'stroke-width': .2 }, target.node);
        svgNode(doc, 'circle', { cx: x, cy: y, r: 6.9, fill: `url(#${prefix}-dome)`, 'pointer-events': 'none' }, target.node);
        const press = svgNode(doc, 'circle', { cx: x, cy: y, r: 11, fill: '#90918f', opacity: 0, 'pointer-events': 'none' }, target.node);
        svgNode(doc, 'circle', { cx: x, cy: y, r: 24, fill: 'transparent', 'pointer-events': 'all' }, target.node);
        buttonElements.set(id, target.node);
        elements.set(id, { definition: element, node: target.node, press, target });
        continue;
      }
      const group = svgNode(doc, 'g', { 'data-element-id': id, transform: `translate(${point.x} ${point.y})` }, groups.labels);
      const counter = element.kind === 'counter';
      svgNode(doc, 'rect', { x: -element.width / 2 + .1, y: -element.height / 2 + .1, width: element.width - .2, height: element.height - .2, fill: counter ? '#010101' : '#f1ede2', stroke: '#313131', 'stroke-width': .2 }, group);
      const text = svgNode(doc, 'text', { x: 0, y: element.fontSize * .36, 'text-anchor': 'middle', 'font-family': 'Arial, Helvetica, sans-serif', 'font-size': element.fontSize, fill: counter ? '#fafafa' : '#000' }, group);
      visuals.register(id, element, counter ? { value: field.counters?.[element.key] ?? element.default } : { text: field.labels?.[element.key] ?? element.default });
      elements.set(id, { definition: element, node: group, text });
    }

    if (field.id === 'desk-key-switch') {
      const x = position.x, y = position.y;
      const group = svgNode(doc, 'g', { 'data-desk-key-switch': 'true', role: 'switch', tabindex: 0, 'aria-label': 'DKŞ', 'aria-checked': 'true', cursor: 'pointer', transform: `translate(${x} ${y})` }, layers.controls);
      const keyGradient = svgNode(doc, 'linearGradient', { id: `${prefix}-desk-key`, x1: '0%', y1: '0%', x2: '0%', y2: '100%' }, defs);
      for (const [offset,color] of [['0%','#5c5c5c'],['50%','#b6b6b6'],['100%','#5c5c5c']]) svgNode(doc, 'stop', { offset, 'stop-color': color }, keyGradient);
      for (const [cy,rotation] of [[9,91.4915],[111,-76.5085]]) {
        svgNode(doc, 'circle', { cx: 50, cy, r: 4.9, fill: 'none', stroke: '#4c4c4c', 'stroke-width': .2 }, group);
        svgNode(doc, 'line', { x1: 46, y1: cy-2.75, x2: 54, y2: cy+2.75, stroke: '#2e2e2e', 'stroke-width': 1.5, transform: `rotate(${rotation} 50 ${cy})` }, group);
      }
      svgNode(doc, 'rect', { x: 31, y: 23, width: 38, height: 16, fill: '#f1ede2', stroke: '#313131', 'stroke-width': .2 }, group);
      svgNode(doc, 'text', { x: 50, y: 34, 'text-anchor': 'middle', 'font-family': 'Arial, Helvetica, sans-serif', 'font-size': 10, fill: '#000' }, group).textContent = 'DKŞ';
      svgNode(doc, 'rect', { x: 39.25, y: 49.25, width: 21.5, height: 49.5, rx: 10.75, fill: '#acaea9', stroke: '#696969', 'stroke-width': .5 }, group);
      svgNode(doc, 'circle', { cx: 50.5, cy: 63.5, r: 7.5, fill: '#000' }, group);
      svgNode(doc, 'polygon', { points: '47.5,63.5 53.5,63.5 55,88 46,88', fill: '#000' }, group);
      const lever = svgNode(doc, 'rect', { x: 48, y: 48, width: 5, height: 30, fill: `url(#${prefix}-desk-key)` }, group);
      const set = enabled => { lever.setAttribute('transform', `rotate(${enabled ? -60 : 0} 50.5 63.5)`); group.setAttribute('aria-checked', String(enabled)); buttons.setEnabled(enabled); };
      deskKeySwitch = { node: group, toggle() { set(!buttons.enabled); } }; set(true);
    }

    if (field.klappeStorage) {
      storageGroups.push(fieldGroup);
      fieldGroup.setAttribute('aria-label', i18n.t('cover.storageGroup'));
      for (let index = 0; index < 6; index++) {
        const x = position.x + (index % 3 + .5) * 100 / 3, y = position.y + (Math.floor(index / 3) + .5) * 30;
        const target = addTarget({ id: `storage:${instanceId}:${index + 1}`, kind: 'storage', x, y, width: 100 / 3, height: 30, label: i18n.t('cover.storagePosition', { number: index + 1 }) }, layers.controls);
        translatedLabels.set(target.id,()=>i18n.t('cover.storagePosition',{number:index+1}));
        svgNode(doc, 'circle', { cx: x, cy: y, r: 6.9, fill: '#c8c9c5', stroke: '#8b8d84', 'stroke-width': .5 }, target.node);
        klappes.add(`${instanceId}:K${index + 1}`, target.id);
      }
    }
  }

  function paint(ids) {
    if (disposed) return;
    for (const id of ids) {
      const record = elements.get(id), value = visuals.get(id);
      if (record.definition.kind === 'lamp') {
        record.active.setAttribute('fill', lampPaints[value.color]);
        record.active.setAttribute('opacity', String(value.intensity * record.definition.brightness));
      } else if (record.text) {
        record.text.textContent = record.definition.kind === 'counter' ? String(value.value).padStart(record.definition.digits, '0') : value.text;
        if (record.definition.optional) {
          const hidden = value.text === '';
          record.node.setAttribute('display', hidden ? 'none' : 'inline');
          record.node.setAttribute('aria-hidden', hidden);
        }
      }
    }
  }
  const unsubscribe = visuals.subscribe(paint);
  paint([...visuals.records.keys()]);
  container.replaceChildren(svg);
  container.setAttribute('aria-label', i18n.t('desk.dimensions', desk));

  const scene = {
    svg, world, fields, cells: fields, elements, hitTargets, buttonElements, visuals,
    setCamera(view) { camera = { x: view.x, y: view.y, scale: view.scale }; world.setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.scale})`); },
    setViewportSize(width, height) { svg.setAttribute('viewBox', `0 0 ${width} ${height}`); },
    screenToWorld(clientX, clientY) {
      const rect = svg.getBoundingClientRect();
      return { x: (clientX - rect.left - camera.x) / camera.scale, y: (clientY - rect.top - camera.y) / camera.scale };
    },
    get deskKeySwitch() { return deskKeySwitch; },
    worldToScreen(x, y) { const rect = svg.getBoundingClientRect(); return { x: rect.left + camera.x + x * camera.scale, y: rect.top + camera.y + y * camera.scale }; },
    moveGhost(clientX, clientY) {
      const rect = svg.getBoundingClientRect();
      ghost.setAttribute('cx', clientX - rect.left); ghost.setAttribute('cy', clientY - rect.top); ghost.setAttribute('display', 'inline');
    },
    hideGhost() { ghost.setAttribute('display', 'none'); },
    updateButtons() {
      for (const [id, record] of elements) if (record.definition.kind === 'button') {
        const state = buttons.getState(id);
        record.press.setAttribute('opacity', state.pressed ? .7 : 0);
        record.node.setAttribute('aria-pressed', state.pressed);
        record.node.setAttribute('aria-disabled', buttons.isBlocked(id));
        record.node.setAttribute('tabindex', buttons.isBlocked(id) ? -1 : 0);
      }
    },
    updateKlappes() {
      for (const target of hitTargets.values()) {
        const occupant = klappes.occupant(target.id) ?? (klappes.fixedClosed(target.id) ? i18n.t('cover.name') : null);
        target.coverNode.setAttribute('display', occupant ? 'inline' : 'none');
        target.coverNode.setAttribute('aria-hidden', occupant ? 'false' : 'true');
        target.coverNode.setAttribute('role', occupant ? 'button' : 'presentation');
        target.coverNode.setAttribute('tabindex', occupant ? 0 : -1);
        target.coverNode.setAttribute('aria-label', i18n.t('cover.lift', { id: occupant ?? i18n.t('cover.name'), target: target.label }));
        if (target.kind === 'storage') {
          target.node.setAttribute('tabindex', occupant ? -1 : 0);
          target.node.setAttribute('aria-hidden', occupant ? 'true' : 'false');
          target.node.setAttribute('display', occupant ? 'none' : 'inline');
          target.node.setAttribute('role', occupant ? 'presentation' : 'button');
        }
      }
      if (!klappes.carried) scene.hideGhost();
    },
    dispose() { disposed = true; unsubscribe(); unsubscribeLocale(); },
  };
  const unsubscribeLocale = i18n.subscribe(()=>{
    svg.setAttribute('aria-label',i18n.t('desk.dimensions',desk)); container.setAttribute('aria-label',i18n.t('desk.dimensions',desk));
    for (const group of storageGroups) group.setAttribute('aria-label',i18n.t('cover.storageGroup'));
    for (const [id,translate] of translatedLabels) {
      const target = hitTargets.get(id); target.label = translate(); target.node.setAttribute('aria-label',target.label);
    }
    scene.updateKlappes();
  });
  scene.updateButtons(); scene.updateKlappes();
  return scene;
}
