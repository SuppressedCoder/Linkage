// Linkage data model: controller types, inputs, binding types and the example robot.
// Pure module: no DOM. Used by the UI, the tests and anything else that needs it.

/** The six Trigger binding methods, in the order the editor offers them. */
export const BINDING_TYPES = [
  { id: 'onTrue', edge: 'rise', held: false, verb: 'Press' },
  { id: 'onFalse', edge: 'fall', held: false, verb: 'Release' },
  { id: 'whileTrue', edge: 'rise', held: true, verb: 'Hold' },
  { id: 'whileFalse', edge: 'fall', held: true, verb: 'While released' },
  { id: 'toggleOnTrue', edge: 'rise', held: true, verb: 'Press to toggle' },
  { id: 'toggleOnFalse', edge: 'fall', held: true, verb: 'Release to toggle' },
];
export const bindingType = (id) => BINDING_TYPES.find((t) => t.id === id) || BINDING_TYPES[0];

/**
 * Canonical inputs, shared by every controller type so a config survives a type change.
 * kind: button (no threshold), trigger (analog, optional threshold), pov, axis (stick direction).
 */
export const INPUTS = [
  { id: 'south', kind: 'button' },
  { id: 'east', kind: 'button' },
  { id: 'west', kind: 'button' },
  { id: 'north', kind: 'button' },
  { id: 'lb', kind: 'button' },
  { id: 'rb', kind: 'button' },
  { id: 'lt', kind: 'trigger' },
  { id: 'rt', kind: 'trigger' },
  { id: 'back', kind: 'button' },
  { id: 'start', kind: 'button' },
  { id: 'ls', kind: 'button' },
  { id: 'rs', kind: 'button' },
  { id: 'povUp', kind: 'pov', angle: 0 },
  { id: 'povUpRight', kind: 'pov', angle: 45 },
  { id: 'povRight', kind: 'pov', angle: 90 },
  { id: 'povDownRight', kind: 'pov', angle: 135 },
  { id: 'povDown', kind: 'pov', angle: 180 },
  { id: 'povDownLeft', kind: 'pov', angle: 225 },
  { id: 'povLeft', kind: 'pov', angle: 270 },
  { id: 'povUpLeft', kind: 'pov', angle: 315 },
  { id: 'lsUp', kind: 'axis', axis: 'kLeftY', sign: -1 },
  { id: 'lsDown', kind: 'axis', axis: 'kLeftY', sign: 1 },
  { id: 'lsLeft', kind: 'axis', axis: 'kLeftX', sign: -1 },
  { id: 'lsRight', kind: 'axis', axis: 'kLeftX', sign: 1 },
  { id: 'rsUp', kind: 'axis', axis: 'kRightY', sign: -1 },
  { id: 'rsDown', kind: 'axis', axis: 'kRightY', sign: 1 },
  { id: 'rsLeft', kind: 'axis', axis: 'kRightX', sign: -1 },
  { id: 'rsRight', kind: 'axis', axis: 'kRightX', sign: 1 },
];
export const inputDef = (id) => INPUTS.find((i) => i.id === id);

const POV_LABEL = {
  povUp: 'D-pad up', povUpRight: 'D-pad up-right', povRight: 'D-pad right', povDownRight: 'D-pad down-right',
  povDown: 'D-pad down', povDownLeft: 'D-pad down-left', povLeft: 'D-pad left', povUpLeft: 'D-pad up-left',
};
const POV_METHOD = Object.fromEntries(Object.keys(POV_LABEL).map((k) => [k, k]));

/**
 * Controller types. `methods` maps canonical inputs to the real method on the Command*Controller
 * class (only methods that exist in wpilibj2). Triggers with a threshold, POV and stick axes are
 * handled in inputMethod().
 */
export const CONTROLLER_TYPES = {
  xbox: {
    name: 'Xbox',
    cls: 'CommandXboxController',
    hid: 'XboxController',
    hidImport: 'edu.wpi.first.wpilibj.XboxController',
    methods: {
      south: 'a', east: 'b', west: 'x', north: 'y', lb: 'leftBumper', rb: 'rightBumper',
      lt: 'leftTrigger', rt: 'rightTrigger', back: 'back', start: 'start', ls: 'leftStick', rs: 'rightStick',
    },
    labels: {
      south: 'A', east: 'B', west: 'X', north: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT',
      back: 'Back', start: 'Start', ls: 'Left stick click', rs: 'Right stick click',
    },
    analogTriggers: true,
  },
  ps5: {
    name: 'PS5',
    cls: 'CommandPS5Controller',
    hid: 'PS5Controller',
    hidImport: 'edu.wpi.first.wpilibj.PS5Controller',
    methods: {
      south: 'cross', east: 'circle', west: 'square', north: 'triangle', lb: 'L1', rb: 'R1',
      lt: 'L2', rt: 'R2', back: 'create', start: 'options', ls: 'L3', rs: 'R3',
    },
    labels: {
      south: 'Cross', east: 'Circle', west: 'Square', north: 'Triangle', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2',
      back: 'Create', start: 'Options', ls: 'L3', rs: 'R3',
    },
    analogTriggers: false,
  },
  ps4: {
    name: 'PS4',
    cls: 'CommandPS4Controller',
    hid: 'PS4Controller',
    hidImport: 'edu.wpi.first.wpilibj.PS4Controller',
    methods: {
      south: 'cross', east: 'circle', west: 'square', north: 'triangle', lb: 'L1', rb: 'R1',
      lt: 'L2', rt: 'R2', back: 'share', start: 'options', ls: 'L3', rs: 'R3',
    },
    labels: {
      south: 'Cross', east: 'Circle', west: 'Square', north: 'Triangle', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2',
      back: 'Share', start: 'Options', ls: 'L3', rs: 'R3',
    },
    analogTriggers: false,
  },
};
export const ctype = (t) => CONTROLLER_TYPES[t] || CONTROLLER_TYPES.xbox;

const AXIS_LABEL = { lsUp: 'Left stick up', lsDown: 'Left stick down', lsLeft: 'Left stick left', lsRight: 'Left stick right',
  rsUp: 'Right stick up', rsDown: 'Right stick down', rsLeft: 'Right stick left', rsRight: 'Right stick right' };

/** Human label for an input on a controller type ("A", "D-pad up", "Left stick up"). */
export function inputLabel(type, id) {
  return ctype(type).labels[id] || POV_LABEL[id] || AXIS_LABEL[id] || id;
}

/** Whether this input on this controller type takes a threshold. */
export function takesThreshold(type, id) {
  const d = inputDef(id);
  if (!d) return false;
  if (d.kind === 'axis') return true;
  return d.kind === 'trigger' && ctype(type).analogTriggers;
}

export const DEFAULT_THRESHOLD = 0.5;

const num = (v) => {
  const s = String(Number(v));
  return s.includes('.') || s.includes('e') ? s : s + '.0';
};

/** The Java call that makes this input's Trigger, without the controller variable: "a()", "leftTrigger(0.5)". */
export function inputMethod(type, id, threshold) {
  const t = ctype(type);
  const d = inputDef(id);
  if (!d) return null;
  if (d.kind === 'pov') return POV_METHOD[id] + '()';
  if (d.kind === 'axis') {
    const v = threshold == null || threshold === '' ? DEFAULT_THRESHOLD : Math.abs(Number(threshold));
    return d.sign < 0
      ? `axisLessThan(${t.hid}.Axis.${d.axis}.value, -${num(v)})`
      : `axisGreaterThan(${t.hid}.Axis.${d.axis}.value, ${num(v)})`;
  }
  const m = t.methods[id];
  if (d.kind === 'trigger' && t.analogTriggers && threshold != null && threshold !== '') return `${m}(${num(threshold)})`;
  return m + '()';
}

let seq = 0;
export const uid = (p = 'id') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

/** A blank configuration: two Xbox controllers and nothing else. */
export function blankConfig() {
  return {
    version: 1,
    controllers: [
      { id: 'driver', name: 'Driver', var: 'driver', port: 0, type: 'xbox' },
      { id: 'operator', name: 'Operator', var: 'operator', port: 1, type: 'xbox' },
    ],
    subsystems: [],
    commands: [],
    conditions: [],
    modes: { enumName: 'Mode', field: 'mode', list: [] },
    bindings: [],
    keep: [],
  };
}

/** The example robot the tool opens with: a 2024-style note game robot. */
export function exampleConfig() {
  const c = blankConfig();
  c.subsystems = [
    { id: 'drive', name: 'Drivetrain', var: 'drivetrain' },
    { id: 'intake', name: 'Intake', var: 'intake' },
    { id: 'shooter', name: 'Shooter', var: 'shooter' },
    { id: 'arm', name: 'Arm', var: 'arm' },
    { id: 'climber', name: 'Climber', var: 'climber' },
  ];
  c.commands = [
    { id: 'slow', name: 'Slow mode', expr: 'drivetrain.slowMode()', reqs: ['drive'] },
    { id: 'zero', name: 'Zero heading', expr: 'Commands.runOnce(drivetrain::zeroHeading)', reqs: [] },
    { id: 'intake', name: 'Run intake', expr: 'intake.runIntake()', reqs: ['intake'] },
    { id: 'eject', name: 'Eject note', expr: 'intake.eject()', reqs: ['intake'] },
    { id: 'feed', name: 'Feed to shooter', expr: 'intake.feed()', reqs: ['intake'] },
    { id: 'spin', name: 'Spin up for speaker', expr: 'shooter.spinUpSpeaker()', reqs: ['shooter'] },
    { id: 'amp', name: 'Score amp', expr: 'new ScoreAmp(arm, shooter)', reqs: ['arm', 'shooter'] },
    { id: 'armIntake', name: 'Arm to intake', expr: 'arm.toIntakePosition()', reqs: ['arm'] },
    { id: 'stow', name: 'Stow arm', expr: 'arm.stow()', reqs: ['arm'] },
    { id: 'climbUp', name: 'Climber up', expr: 'climber.extend()', reqs: ['climber'] },
    { id: 'climbDown', name: 'Climber down', expr: 'climber.retract()', reqs: ['climber'] },
    { id: 'modeIntake', name: 'Switch to intake mode', expr: 'Commands.runOnce(() -> mode = Mode.INTAKE)', reqs: [] },
    { id: 'modeScoring', name: 'Switch to scoring mode', expr: 'Commands.runOnce(() -> mode = Mode.SCORING)', reqs: [] },
    {
      id: 'rumble', name: 'Rumble driver',
      expr: 'Commands.startEnd(() -> driver.getHID().setRumble(RumbleType.kBothRumble, 0.6), () -> driver.getHID().setRumble(RumbleType.kBothRumble, 0)).withTimeout(0.4)',
      reqs: [],
    },
    { id: 'pass', name: 'Pass note', expr: 'shooter.pass()', reqs: ['shooter'] },
  ];
  c.conditions = [
    { id: 'hasNote', name: 'hasNote', supplier: 'intake::hasNote', kind: 'supplier' },
    { id: 'armAtSetpoint', name: 'armAtSetpoint', supplier: '() -> arm.atSetpoint()', kind: 'supplier' },
    { id: 'shooterReady', name: 'shooterReady', supplier: 'shooter.atSpeed()', kind: 'trigger' },
  ];
  c.modes.list = [
    { id: 'intake', name: 'Intake', const: 'INTAKE' },
    { id: 'scoring', name: 'Scoring', const: 'SCORING' },
  ];
  const b = (ctrl, input, type, cmd, extra = {}) => ({
    id: uid('b'), ctrl, input, type, cmd, mode: null, conds: [], debounce: null, threshold: null, ...extra,
  });
  c.bindings = [
    b('driver', 'rb', 'whileTrue', 'slow'),
    b('driver', 'start', 'onTrue', 'zero'),
    b('driver', 'lt', 'whileTrue', 'intake', { threshold: 0.5, conds: [{ op: 'and', neg: true, ref: 'cond:hasNote' }] }),
    b('operator', 'lb', 'onTrue', 'modeIntake'),
    b('operator', 'rb', 'onTrue', 'modeScoring'),
    b('operator', 'south', 'whileTrue', 'armIntake', { mode: 'intake' }),
    b('operator', 'south', 'onTrue', 'amp', { mode: 'scoring', conds: [{ op: 'and', neg: false, ref: 'cond:hasNote' }] }),
    b('operator', 'west', 'whileTrue', 'eject', { mode: 'intake' }),
    b('operator', 'rt', 'whileTrue', 'spin', { mode: 'scoring', threshold: 0.3 }),
    b('operator', 'east', 'onTrue', 'feed', {
      mode: 'scoring', debounce: 0.1,
      conds: [{ op: 'and', neg: false, ref: 'cond:shooterReady' }, { op: 'and', neg: false, ref: 'cond:armAtSetpoint' }],
    }),
    b('operator', 'north', 'onTrue', 'stow'),
    b('operator', 'povUp', 'whileTrue', 'climbUp'),
    b('operator', 'povDown', 'whileTrue', 'climbDown'),
    b('state', 'hasNote', 'onTrue', 'rumble'),
  ];
  return c;
}

/** Make a loaded config safe to use: fill gaps, drop what can't be shown. Never throws on bad input shapes. */
export function normalizeConfig(raw) {
  const c = blankConfig();
  if (!raw || typeof raw !== 'object') return c;
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  const str = (v, d = '') => (typeof v === 'string' ? v : v == null ? d : String(v));
  const optNum = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));
  if (arr(raw.controllers).length) {
    c.controllers = arr(raw.controllers).map((k, i) => ({
      id: str(k.id, 'c' + i), name: str(k.name, 'Controller ' + i), var: str(k.var, 'controller' + i),
      port: Number.isInteger(Number(k.port)) ? Number(k.port) : i, type: CONTROLLER_TYPES[k.type] ? k.type : 'xbox',
    }));
  }
  c.subsystems = arr(raw.subsystems).map((s, i) => ({ id: str(s.id, 's' + i), name: str(s.name), var: str(s.var) }));
  c.commands = arr(raw.commands).map((k, i) => ({
    id: str(k.id, 'k' + i), name: str(k.name), expr: str(k.expr), reqs: Array.isArray(k.reqs) ? k.reqs.map(String) : [],
  }));
  c.conditions = arr(raw.conditions).map((k, i) => ({
    id: str(k.id, 'q' + i), name: str(k.name), supplier: str(k.supplier), kind: k.kind === 'trigger' ? 'trigger' : 'supplier',
  }));
  const m = raw.modes && typeof raw.modes === 'object' ? raw.modes : {};
  c.modes = {
    enumName: str(m.enumName, 'Mode'), field: str(m.field, 'mode'),
    list: arr(m.list).map((x, i) => ({ id: str(x.id, 'm' + i), name: str(x.name), const: str(x.const) })),
  };
  c.bindings = arr(raw.bindings).map((x) => ({
    id: str(x.id, uid('b')), ctrl: str(x.ctrl), input: str(x.input),
    type: BINDING_TYPES.some((t) => t.id === x.type) ? x.type : 'onTrue',
    cmd: str(x.cmd), mode: x.mode == null || x.mode === '' ? null : str(x.mode),
    conds: arr(x.conds).map((q) => ({ op: q.op === 'or' ? 'or' : 'and', neg: !!q.neg, ref: str(q.ref) })),
    debounce: optNum(x.debounce), threshold: optNum(x.threshold),
  }));
  c.keep = Array.isArray(raw.keep) ? raw.keep.filter((x) => typeof x === 'string' && x.trim()) : [];
  return c;
}

/** Turn a display name into a Java identifier in lowerCamelCase. */
export function camel(s, fallback = 'value') {
  const words = String(s).replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return fallback;
  const out = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w[0].toLowerCase() + w.slice(1))).join('');
  return /^[0-9]/.test(out) ? '_' + out : out;
}

/** Key of the Trigger an input makes: same controller, input and threshold = same Trigger. */
export const triggerKey = (ctrl, input, threshold) => `${ctrl}:${input}:${threshold ?? ''}`;
