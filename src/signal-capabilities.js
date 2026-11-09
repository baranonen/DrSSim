const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Field signal capabilities are not inferred from the number of desk lamps. */
export function compileSignalCapabilities(signal) {
  const type = signal.type === undefined ? 'normal' : signal.type;
  if (type === 'EndOfShunting') {
    if (signal.capabilities !== undefined) throw new Error('End-of-shunting markers do not define capabilities.');
    return { type, capabilities: { substitute: false, shunt: false }, indications: [] };
  }
  if (!['normal', 'shunting'].includes(type)) throw new Error('Signal type must be normal or shunting.');
  const input = signal.capabilities === undefined ? {} : signal.capabilities;
  if (!object(input) || Object.entries(input).some(([key, value]) => !['substitute', 'shunt'].includes(key) || typeof value !== 'boolean')) {
    throw new Error('Signal capabilities must contain boolean substitute and shunt fields.');
  }
  const capabilities = { substitute: input.substitute ?? false, shunt: input.shunt ?? (type === 'shunting') };
  if (type === 'shunting' && (capabilities.substitute || !capabilities.shunt)) {
    throw new Error('Shunting signals can only display stop and shunting proceed.');
  }
  const indications = type === 'shunting' ? ['stop', 'shunt'] : ['stop', 'proceed'];
  if (type === 'normal' && capabilities.substitute) indications.push('substitute');
  if (type === 'normal' && capabilities.shunt) indications.push('shunt');
  return { type, capabilities, indications };
}
