import { fieldInstanceId } from './tisch.js';
export class VisualBindings {
  constructor(desk, visuals) {
    this.visuals = visuals;
    this.channels = new Map();
    for (const field of desk.fields) for (const [key, channel] of Object.entries(field.bindings ?? {})) {
      const id = `${fieldInstanceId(desk.id, field.id)}:${key}`;
      if (!visuals.records.has(id)) throw new Error(`Bound visual element not found: ${id}`);
      const targets = this.channels.get(channel) ?? [];
      targets.push(id); this.channels.set(channel, targets);
    }
  }
  apply(changes, timeMs) {
    const batch = [];
    for (const { channelId, value } of changes) {
      const targets = this.channels.get(channelId);
      if (!targets) throw new Error(`Display channel not found: ${channelId}`);
      for (const elementId of targets) batch.push({ elementId, value });
    }
    this.visuals.apply(batch, timeMs);
  }
}
