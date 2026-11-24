// Java code generation for RobotContainer: fields plus a paste-ready configureBindings().
// Uses only Trigger methods (and, or, negate, debounce, onTrue, onFalse, whileTrue, whileFalse,
// toggleOnTrue, toggleOnFalse), the Trigger(BooleanSupplier) constructor and the input methods
// of CommandXboxController / CommandPS4Controller / CommandPS5Controller.
import { ctype, inputMethod, inputLabel, camel, triggerKey, inputDef } from './model.js';

const IND = '  ';
const WRAP = 96;

/** Lookup helpers shared by codegen, checks and the cheat sheet. */
export function index(cfg) {
  const by = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  return {
    ctrl: by(cfg.controllers),
    cmd: by(cfg.commands),
    cond: by(cfg.conditions),
    mode: by(cfg.modes.list),
    sub: by(cfg.subsystems),
  };
}

export const conditionVar = (q) => camel(q.name, 'condition');
/** What a condition's Trigger variable is set to: new Trigger(supplier), or a Trigger expression as-is. */
export const conditionInit = (q) => (q.kind === 'trigger' && q.supplier.trim() ? q.supplier.trim() : `new Trigger(${q.supplier.trim() || '() -> false'})`);
export const modeVar = (m) => camel(m.name + ' mode', 'mode');
const constName = (m) => (m.const || m.name || 'MODE').toUpperCase().replace(/[^A-Z0-9]+/g, '_');

/** Trigger variable name for an input that is used more than once: driverRightBumper, operatorPovUp. */
export function inputVar(ctrl, input, threshold) {
  const label = inputLabel(ctrl.type, input).replace(/click/i, '');
  let name = camel(`${ctrl.var} ${label}`);
  if (threshold != null && inputDef(input)?.kind !== 'pov') name += String(threshold).replace('.', '_').replace(/^0_/, '');
  return name;
}

/** The inputs referenced, as base or condition, more than once get their own Trigger variable. */
function sharedInputs(cfg, ix) {
  const count = new Map();
  const bump = (k) => count.set(k, (count.get(k) || 0) + 1);
  for (const b of cfg.bindings) {
    if (ix.ctrl[b.ctrl]) bump(triggerKey(b.ctrl, b.input, b.threshold));
    for (const q of b.conds) {
      const r = parseRef(q.ref);
      if (r.kind === 'in' && ix.ctrl[r.ctrl]) bump(triggerKey(r.ctrl, r.input, null));
    }
  }
  return new Set([...count].filter(([, n]) => n > 1).map(([k]) => k));
}

/** A condition reference: "cond:<id>" or "in:<controllerId>:<input>". */
export function parseRef(ref) {
  const [kind, a, b] = String(ref).split(':');
  if (kind === 'cond') return { kind, id: a };
  if (kind === 'in') return { kind, ctrl: a, input: b };
  return { kind: 'none' };
}

/** Build the generator context once; expression helpers read from it. */
export function context(cfg) {
  const ix = index(cfg);
  const shared = sharedInputs(cfg, ix);
  const names = new Map();
  for (const k of shared) {
    const [ctrl, input, th] = k.split(':');
    names.set(k, inputVar(ix.ctrl[ctrl], input, th === '' ? null : Number(th)));
  }
  return { cfg, ix, shared, names };
}

/** Java expression for an input's Trigger, honoring shared variables. */
export function inputExpr(cx, ctrlId, input, threshold) {
  const k = triggerKey(ctrlId, input, threshold);
  if (cx.names.has(k)) return cx.names.get(k);
  const c = cx.ix.ctrl[ctrlId];
  if (!c) return null;
  return `${c.var}.${inputMethod(c.type, input, threshold)}`;
}

function refExpr(cx, ref) {
  const r = parseRef(ref);
  if (r.kind === 'cond') {
    const q = cx.ix.cond[r.id];
    return q ? conditionVar(q) : null;
  }
  if (r.kind === 'in') return inputExpr(cx, r.ctrl, r.input, null);
  return null;
}

/**
 * The parts of one binding's statement: base trigger, then chained calls.
 * Returns null when the binding can't be written (missing command or input).
 */
export function bindingParts(cx, b) {
  const cmd = cx.ix.cmd[b.cmd];
  if (!cmd || !cmd.expr.trim()) return null;
  let base;
  if (b.ctrl === 'state') {
    const q = cx.ix.cond[b.input];
    if (!q) return null;
    base = conditionVar(q);
  } else {
    base = inputExpr(cx, b.ctrl, b.input, b.threshold);
    if (!base) return null;
  }
  const calls = [];
  const m = b.mode && cx.ix.mode[b.mode];
  if (m) calls.push(`and(${modeVar(m)})`);
  for (const q of b.conds) {
    const e = refExpr(cx, q.ref);
    if (!e) continue;
    calls.push(`${q.op === 'or' ? 'or' : 'and'}(${q.neg ? e + '.negate()' : e})`);
  }
  if (b.debounce != null && b.debounce > 0) calls.push(`debounce(${b.debounce})`);
  calls.push(`${b.type}(${cmd.expr.trim()})`);
  return { base, calls };
}

/** One binding as a Java statement, wrapped onto continuation lines when long. */
export function bindingStatement(cx, b, indent = IND) {
  const p = bindingParts(cx, b);
  if (!p) return null;
  const one = `${indent}${p.base}.${p.calls.join('.')};`;
  if (p.calls.length < 2 || (one.length <= WRAP && p.calls.length <= 3)) return one;
  return [`${indent}${p.base}`, ...p.calls.map((c, i) => `${indent}${IND}${IND}.${c}${i === p.calls.length - 1 ? ';' : ''}`)].join('\n');
}

function usedConditions(cx) {
  const used = new Set();
  for (const b of cx.cfg.bindings) {
    if (b.ctrl === 'state') used.add(b.input);
    for (const q of b.conds) {
      const r = parseRef(q.ref);
      if (r.kind === 'cond') used.add(r.id);
    }
  }
  return cx.cfg.conditions.filter((q) => used.has(q.id));
}

function usedModes(cx) {
  const used = new Set(cx.cfg.bindings.map((b) => b.mode).filter(Boolean));
  return cx.cfg.modes.list.filter((m) => used.has(m.id));
}

/** Imports the generated code needs, sorted. */
export function imports(cfg) {
  const out = new Set(['edu.wpi.first.wpilibj2.command.button.Trigger']);
  const cx = context(cfg);
  for (const c of cfg.controllers) {
    if (!cfg.bindings.some((b) => b.ctrl === c.id)) continue;
    out.add('edu.wpi.first.wpilibj2.command.button.' + ctype(c.type).cls);
  }
  for (const b of cfg.bindings) {
    const c = cx.ix.ctrl[b.ctrl];
    if (c && inputDef(b.input)?.kind === 'axis') out.add(ctype(c.type).hidImport);
  }
  const exprs = cfg.commands.filter((k) => cfg.bindings.some((b) => b.cmd === k.id)).map((k) => k.expr);
  if (exprs.some((e) => /\bCommands\./.test(e))) out.add('edu.wpi.first.wpilibj2.command.Commands');
  if (exprs.some((e) => /(?<![\w.])RumbleType\./.test(e))) out.add('edu.wpi.first.wpilibj.GenericHID.RumbleType');
  return [...out].sort();
}

/** Fields RobotContainer needs: controllers, plus the mode enum and field when modes are used. [{ key, lines }] */
export function fieldBlocks(cfg) {
  const cx = context(cfg);
  const out = cfg.controllers.map((c) => ({ key: `controller:${c.var}`, ctrl: c, lines: [`private final ${ctype(c.type).cls} ${c.var} = new ${ctype(c.type).cls}(${c.port});`] }));
  if (usedModes(cx).length) {
    const all = cfg.modes.list;
    out.push({
      key: 'modes',
      lines: [
        '/** Operator modes: the same button can do something different in each. */',
        `private enum ${cfg.modes.enumName} { ${all.map(constName).join(', ')} }`,
        `private ${cfg.modes.enumName} ${cfg.modes.field} = ${cfg.modes.enumName}.${constName(all[0])};`,
      ],
    });
  }
  return out;
}

/** The full generated text: imports, fields, then configureBindings(). */
export function generateJava(cfg) {
  const L = [];
  L.push('// ---- Imports (merge with the ones RobotContainer already has) ----');
  for (const i of imports(cfg)) L.push(`import ${i};`);
  L.push('');
  L.push('// ---- Fields in RobotContainer ----');
  fieldBlocks(cfg).forEach((f, i) => {
    if (i && f.key === 'modes') L.push('');
    L.push(...f.lines);
  });
  L.push('');
  L.push(...methodLines(cfg));
  return L.join('\n') + '\n';
}

/** configureBindings() as lines, indented with two spaces. */
export function methodLines(cfg) {
  const cx = context(cfg);
  const modes = usedModes(cx);
  const L = [];
  L.push('private void configureBindings() {');
  const conds = usedConditions(cx);
  if (conds.length) {
    L.push(`${IND}// Robot state`);
    for (const q of conds) L.push(`${IND}Trigger ${conditionVar(q)} = ${conditionInit(q)};`);
  }
  if (modes.length) {
    if (conds.length) L.push('');
    L.push(`${IND}// Modes`);
    for (const m of modes) {
      L.push(`${IND}Trigger ${modeVar(m)} = new Trigger(() -> ${cfg.modes.field} == ${cfg.modes.enumName}.${constName(m)});`);
    }
  }
  if (cx.names.size) {
    if (conds.length || modes.length) L.push('');
    L.push(`${IND}// Inputs used more than once`);
    for (const [k, name] of cx.names) {
      const [ctrl, input, th] = k.split(':');
      const c = cx.ix.ctrl[ctrl];
      L.push(`${IND}Trigger ${name} = ${c.var}.${inputMethod(c.type, input, th === '' ? null : Number(th))};`);
    }
  }
  const section = (title, list) => {
    const lines = list.map((b) => bindingStatement(cx, b)).filter(Boolean);
    if (!lines.length) return;
    L.push('');
    L.push(`${IND}// ${title}`);
    L.push(...lines);
  };
  for (const c of cfg.controllers) {
    const mine = cfg.bindings.filter((b) => b.ctrl === c.id);
    if (!mine.length) continue;
    const head = `${c.name} controller (port ${c.port})`;
    const always = mine.filter((b) => !b.mode || !cx.ix.mode[b.mode]);
    if (!modes.length || mine.every((b) => !b.mode)) {
      section(head, mine);
      continue;
    }
    section(`${head}: every mode`, always);
    for (const m of cfg.modes.list) section(`${head}: ${m.name.toLowerCase()} mode`, mine.filter((b) => b.mode === m.id));
  }
  section('Robot state triggers', cfg.bindings.filter((b) => b.ctrl === 'state'));
  if (cfg.keep?.length) {
    L.push('');
    L.push(`${IND}// Kept as written (Linkage doesn't edit these)`);
    for (const raw of cfg.keep) {
      const text = raw.trim();
      const lines = (/[;}]$/.test(text) ? text : text + ';').split(/\r?\n/);
      const lead = (l) => l.length - l.trimStart().length;
      const rest = lines.slice(1).filter((l) => l.trim());
      const pad = rest.length ? Math.min(...rest.map(lead)) : 0;
      const steps = rest.map((l) => lead(l) - pad).filter((n) => n > 0);
      const step = steps.length ? Math.min(...steps) : 2;
      const block = lines[0].trimEnd().endsWith('{');
      L.push(IND + lines[0], ...lines.slice(1).map((l) => {
        if (!l.trim()) return '';
        const level = Math.round((lead(l) - pad) / step) + (block ? 0 : 2);
        return IND + IND.repeat(level) + l.trimStart();
      }));
    }
  }
  L.push('}');
  return L.join('\n').split('\n');
}
