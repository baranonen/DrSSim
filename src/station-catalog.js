// A station can be selected as soon as its control desk is available.
export const STATIONS = Object.freeze([
  { id: 'yedikule', name: 'Yedikule', tisch: './config/yedikule.json', graph: './config/graphs/yedikule.json', modelBindings: './config/model-bindings/yedikule.json', interlocking: './config/interlocking/yedikule.json' },
  { id: 'bakirkoy', name: 'Bakırköy', tisch: './config/bakirkoy.json', graph: './config/graphs/bakirkoy.json', modelBindings: './config/model-bindings/bakirkoy.json', interlocking: './config/interlocking/bakirkoy.json' },
  { id: 'yesilkoy', name: 'Yeşilköy', tisch: './config/yesilkoy.json', graph: './config/graphs/yesilkoy.json', modelBindings: './config/model-bindings/yesilkoy.json', interlocking: './config/interlocking/yesilkoy.json' },
]);
