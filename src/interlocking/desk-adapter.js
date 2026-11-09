/** Keep input names and positions separate from operation logic. ButtonController handles cover blocking. */
export function bindInterlockingInput(engine, buttons, modelBindings) {
  const source = button => modelBindings.buttons[button.id];
  const matches = (definition, first, second) => {
    const start = first?.kind === 'signal' && first.signalId === definition.startSignalId;
    const target = definition.target;
    return start && second?.kind === 'route-target' && second.targetId === target.targetId;
  };
  const unsubscribe = buttons.subscribe(event => {
    engine.setHeldButtons(buttons.enabled ? event.pressedIds : [], { reportEarlyRelease: buttons.enabled && event.kind === 'state' && event.reason === 'release' });
    if (event.kind === 'button-down') {
      const item = source(event.buttons[0]);
      if (item?.kind === 'group') engine.pressGroup(item.command);
    }
    if (!buttons.enabled) return;
    if (event.kind === 'button-down') {
      const bellGroup = { CSD_SIGNAL: 'signal', CSD_POINT: 'point', CSD_60: 'power60', CSD_12: 'power12' }[event.buttons[0].key];
      if (bellGroup) engine.acknowledgeAlarm(bellGroup);
    }
    if (event.kind !== 'pair') return;
    const sources = event.buttons.map(source);
    const group = sources.find(item => item?.kind === 'group');
    const continuous = sources.find(item => item?.kind === 'continuous-operation');
    const target = sources.find(item => item?.kind === 'route-target');
    const point = sources.find(item => item?.kind === 'point');
    const signal = sources.find(item => item?.kind === 'signal');
    if (continuous && target) engine.requestContinuous(continuous.command, continuous.id, target.targetId, event.buttons.map(button => button.id));
    else if (group?.command === 'SYIYD' && target) engine.requestCommand('SYIYD', target.targetId, event.buttons.map(button => button.id), { subjectKind: 'route-target' });
    else if (group && point && ['MGD', 'MYD'].includes(group.command)) engine.requestCommand(group.command, point.nodeId, event.buttons.map(button => button.id));
    else if (group && signal) {
      if (['STGD','SYIYD','SGD','YSGD'].includes(group.command)) engine.requestCommand(group.command, signal.signalId, event.buttons.map(button => button.id));
    } else for (const route of engine.routes.values()) if (matches(route.definition, ...sources) || matches(route.definition, ...[...sources].reverse())) {
      engine.requestRoute(route.id, event.buttons.map(button => button.id)); break;
    }
  });
  engine.setHeldButtons(buttons.enabled ? buttons.pressedIds : []);
  return () => { unsubscribe(); engine.setHeldButtons([]); };
}

export function bindInterlockingDisplay(engine, modelBindings, bindings) {
  const update = () => {
    const changes = [];
    for (const [channelId, source] of Object.entries(modelBindings.channels)) {
      let value;
      if (source.kind === 'continuous-operation') { const active = engine.getContinuousOperation(source.id).active; value = { mode: (source.state === 'active' ? active : !active) ? 'on' : 'off', color: 'white' }; }
      else if (source.kind === 'track-circuit') {
        const occupied = engine.gleisrelais.get(source.id).occupied;
        const routed = [...engine.routes.values()].some(route => route.active && route.definition.releaseTrackCircuits.includes(source.id));
        value = { mode: occupied || routed ? 'on' : 'off', color: occupied ? 'red' : 'white' };
      }
      else if (source.kind === 'point-indicator') {
        const p = engine.getPoint(source.nodeId);
        const selected = (p.position === null ? p.target : p.position) === source.branch;
        if (p.trailed && !p.driveActive) {
          const red = p.occupied || source.branch !== p.trailed.previousPosition;
          value = { mode: 'blink', color: red ? 'red' : 'white' };
        } else {
          value = { mode: !selected ? 'off' : p.position === null ? 'blink' : 'on', color: p.occupied ? 'red' : 'white' };
        }
      } else if (source.kind === 'signal-indicator') {
        const s = engine.getSignal(source.signalId);
        const on = source.indication === 'substitute' ? s.substitute : source.indication === 'stop' ? s.redLit : s.aspect === source.indication;
        value = { mode: on ? (source.indication === 'stop' && s.redLampFault ? 'blink' : 'on') : 'off' };
      } else if (source.kind === 'route-locked' || source.kind === 'signal-route-locked') {
        const active = [...engine.routes.values()].some(route => route.active && (source.kind === 'signal-route-locked' ? route.definition.startSignalId === source.signalId : route.definition.target.kind === 'route-target' && route.definition.target.targetId === source.targetId));
        value = { mode: active ? 'on' : 'off', color: 'white' };
      } else if (source.kind === 'operation-counter') value = { value: engine.counters[source.command] };
      if (value) {
        if (value.mode === 'blink') value.periodMs = engine.takt.periodMs;
        changes.push({ channelId, value });
      }
    }
    bindings.apply(changes);
  };
  const unsubscribe = engine.subscribe(update);
  update();
  return unsubscribe;
}
