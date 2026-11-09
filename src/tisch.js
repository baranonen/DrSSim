import { FIELD_SIZE, createEmptyLayout, parseAddress, validateDimensions } from './layout.js';
import { TILES, ButtonType } from './tiles.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identity = value => typeof value === 'string' && value.trim().length > 0;

/** The configuration describes the visual desk layout; it does not define the railway graph. */
export function compileTisch(config) {
  if (!object(config) || config.version !== 1 || !identity(config.id)) throw new Error('A desk configuration with a valid version and ID is required.');
  const { columns, rows } = config;
  validateDimensions(columns, rows);
  if (config.fields !== undefined && !Array.isArray(config.fields)) throw new Error('The tile layout must be a list.');

  const fields = createEmptyLayout(columns, rows).map(field => ({ ...field, id: `empty@${field.address}` }));
  const byAddress = new Map(fields.map((field, index) => [field.address, index]));
  const addresses = new Set();
  const explicitIds = new Set();
  for (const entry of config.fields ?? []) {
    if (!object(entry) || !identity(entry.id)) throw new Error('Every placed tile requires a stable ID.');
    const { column, row } = parseAddress(entry.address);
    if (column > columns || row > rows) throw new Error(`Tile is outside the desk: ${entry.address}`);
    if (addresses.has(entry.address)) throw new Error(`Two tiles share an address: ${entry.address}`);
    if (explicitIds.has(entry.id)) throw new Error(`Duplicate tile ID: ${entry.id}`);
    if (!Object.hasOwn(TILES, entry.tile)) throw new Error(`Unknown tile: ${entry.tile}`);
    const definition = TILES[entry.tile];
    const orientation = entry.orientation ?? definition.defaultOrientation ?? 'identity';
    if (!definition.orientations.includes(orientation)) throw new Error('Invalid tile orientation.');
    for (const [property, kind] of [['labels', 'text'], ['counters', 'counter'], ['bindings', null]]) {
      if (entry[property] === undefined) continue;
      if (!object(entry[property])) throw new Error(`Invalid ${property} definition.`);
      for (const [key, value] of Object.entries(entry[property])) {
        const element = definition.elements.find(element => element.key === key);
        if (!element || (kind ? element.kind !== kind : element.kind === 'button')) throw new Error(`Invalid visual element: ${key}`);
        if (property === 'labels' && typeof value !== 'string') throw new Error('The label must be text.');
        if (property === 'counters' && (!Number.isSafeInteger(value) || value < 0 || String(value).length > element.digits)) throw new Error('Counter value exceeds the digit limit.');
        if (property === 'bindings' && !identity(value)) throw new Error('A display channel ID is required.');
      }
    }
    if (entry.klappeStorage !== undefined && typeof entry.klappeStorage !== 'boolean') throw new Error('Cover storage must be a boolean.');
    if (entry.buttons !== undefined && !object(entry.buttons)) throw new Error('Button settings must be an object.');
    const knownButtons = new Set(TILES[entry.tile].buttons.map(button => button.key));
    for (const [key, settings] of Object.entries(entry.buttons ?? {})) {
      if (!knownButtons.has(key) || !object(settings)) throw new Error(`Invalid tile button: ${key}`);
      if (settings.type !== undefined && !Object.values(ButtonType).includes(settings.type)) throw new Error(`Invalid button type: ${key}`);
      if (settings.labelKey !== undefined && !identity(settings.labelKey)) throw new Error(`Invalid button translation key: ${key}`);
      if (settings.label !== undefined && typeof settings.label !== 'string') throw new Error(`Invalid button label: ${key}`);
      if (settings.fixedKlappe != null && settings.fixedKlappe !== 'hexagon') throw new Error(`Invalid fixed cover type: ${key}`);
    }
    addresses.add(entry.address);
    explicitIds.add(entry.id);
    fields[byAddress.get(entry.address)] = {
      id: entry.id,
      address: entry.address,
      column,
      row,
      tile: entry.tile,
      ...(entry.orientation !== undefined || definition.defaultOrientation ? { orientation } : {}),
      ...Object.fromEntries(['labels', 'counters', 'bindings'].filter(key => entry[key] !== undefined).map(key => [key, structuredClone(entry[key])])),
      ...(entry.klappeStorage !== undefined ? { klappeStorage: entry.klappeStorage } : {}),
      ...(entry.buttons ? { buttons: structuredClone(entry.buttons) } : {}),
    };
  }
  if (new Set(fields.map(field => field.id)).size !== fields.length) throw new Error('Tile ID conflicts with an automatically generated empty field ID.');
  return {
    id: config.id,
    name: config.name ?? config.id,
    columns,
    rows,
    tileWidth: FIELD_SIZE.width,
    tileHeight: FIELD_SIZE.height,
    width: columns * FIELD_SIZE.width,
    height: rows * FIELD_SIZE.height,
    fields,
  };
}

export async function loadTisch(url, fetcher = globalThis.fetch) {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Failed to load desk configuration: HTTP ${response.status}`);
  return compileTisch(await response.json());
}

export function fieldInstanceId(deskId, fieldId) {
  return `${encodeURIComponent(deskId)}/${encodeURIComponent(fieldId)}`;
}
