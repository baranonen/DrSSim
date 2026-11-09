export const SVG_NS = 'http://www.w3.org/2000/svg';
export function svgNode(doc, tag, attrs = {}, parent = null) {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) if (value !== undefined) node.setAttribute(key, String(value));
  if (parent) parent.append(node);
  return node;
}
export const drawShape = (doc, drawing, parent, extra = {}) => svgNode(doc, drawing.tag, { ...drawing.attrs, ...extra }, parent);
export function drawBorder(doc, parent, { omitTop = false, omitBottom = false } = {}) {
  if (!omitTop && !omitBottom) svgNode(doc, 'rect', { x: .1, y: .1, width: 99.8, height: 59.8, fill: 'none', stroke: '#000', 'stroke-width': .2 }, parent);
  else {
    const d = `M .1 .1 V 59.9 M 99.9 .1 V 59.9${omitTop ? '' : ' M .1 .1 H 99.9'}${omitBottom ? '' : ' M .1 59.9 H 99.9'}`;
    svgNode(doc, 'path', { d, fill: 'none', stroke: '#000', 'stroke-width': .2 }, parent);
  }
  for (const x of [-.5, 99.5]) for (const [y, height] of [[8, 9], [27, 6], [43, 9]]) svgNode(doc, 'rect', { x, y, width: 1, height, fill: '#000' }, parent);
}
