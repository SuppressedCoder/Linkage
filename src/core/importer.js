// Import: read an existing RobotContainer.java and rebuild the bindings it can recognize.
// Not a Java parser: it splits configureBindings() into statements and reads Trigger chains.
// Anything it can't read is reported, never silently dropped.
import { CONTROLLER_TYPES, INPUTS, blankConfig, camel, uid } from './model.js';

const BIND = ['onTrue', 'onFalse', 'whileTrue', 'whileFalse', 'toggleOnTrue', 'toggleOnFalse'];
const CLS = { CommandXboxController: 'xbox', CommandPS4Controller: 'ps4', CommandPS5Controller: 'ps5' };
const AXIS_NUM_XBOX = { 0: 'kLeftX', 1: 'kLeftY', 2: 'kLeftTrigger', 3: 'kRightTrigger', 4: 'kRightX', 5: 'kRightY' };

/** Remove comments, keeping string and char literals intact. */
export function stripComments(src) {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j;
    } else if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const chunk = src.slice(i, end < 0 ? src.length : end + 2);
      out += chunk.replace(/[^\n]/g, ' ');
      i = end < 0 ? src.length : end + 1;
    } else out += c;
  }
  return out;
}

/** Index just past the bracket that closes the one at `open`. */
function closeOf(s, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const stack = [];
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < s.length && s[j] !== c) j += s[j] === '\\' ? 2 : 1;
      i = j;
    } else if (pairs[c]) stack.push(pairs[c]);
    else if (c === ')' || c === '}' || c === ']') {
      if (stack.pop() !== c) return -1;
      if (!stack.length) return i + 1;
    }
  }
  return -1;
}

/** Split on a separator at bracket depth 0. */
function splitTop(s, sep) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < s.length && s[j] !== c) j += s[j] === '\\' ? 2 : 1;
      i = j;
    } else if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c)) depth--;
    else if (c === sep && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out.map((x) => x.trim()).filter(Boolean);
}

/** primary(.call(args))* -> { primary, calls } or null. primary is an identifier or "new Trigger(arg)". */
export function parseChain(text) {
  const s = text.trim();
  let i = 0;
  let primary;
  const nt = /^new\s+Trigger\s*\(/.exec(s);
  if (nt) {
    const open = nt[0].length - 1;
    const end = closeOf(s, open);
    if (end < 0) return null;
    primary = { kind: 'new', arg: s.slice(open + 1, end - 1).trim() };
    i = end;
  } else {
    const id = /^(?:this\s*\.\s*)?([A-Za-z_]\w*)/.exec(s);
    if (!id) return null;
    primary = { kind: 'id', name: id[1] };
    i = id[0].length;
  }
  const calls = [];
  for (;;) {
    while (/\s/.test(s[i] || '')) i++;
    if (i >= s.length) break;
    if (s[i] !== '.') return null;
    i++;
    const m = /^\s*([A-Za-z_]\w*)\s*/.exec(s.slice(i));
    if (!m) return null;
    i += m[0].length;
    if (s[i] !== '(') return null;
    const end = closeOf(s, i);
    if (end < 0) return null;
    calls.push({ name: m[1], args: s.slice(i + 1, end - 1).trim() });
    i = end;
  }
  return { primary, calls };
}

const POV_BY_ANGLE = Object.fromEntries(INPUTS.filter((d) => d.kind === 'pov').map((d) => [d.angle, d.id]));

/** Map one controller method call to a canonical input: { input, threshold } or null. */
export function mapInput(type, call) {
  const t = CONTROLLER_TYPES[type];
  const direct = Object.entries(t.methods).find(([, m]) => m === call.name);
  if (direct) {
    const [id] = direct;
    if ((id === 'lt' || id === 'rt') && call.args && t.analogTriggers) {
      const v = Number(call.args);
      return isFinite(v) ? { input: id, threshold: v } : null;
    }
    return call.args ? null : { input: id, threshold: null };
  }
  if (INPUTS.some((d) => d.kind === 'pov' && d.id === call.name) && !call.args) return { input: call.name, threshold: null };
  if (call.name === 'pov') {
    const a = Number(call.args);
    return POV_BY_ANGLE[a] ? { input: POV_BY_ANGLE[a], threshold: null } : null;
  }
  if (call.name === 'axisGreaterThan' || call.name === 'axisLessThan') {
    const [ax, th] = splitTop(call.args, ',');
    const v = Number(th);
    if (!isFinite(v)) return null;
    let axis = /\b(k\w+)\b/.exec(ax || '')?.[1];
    if (!axis && /^\d+$/.test(ax || '') && type === 'xbox') axis = AXIS_NUM_XBOX[ax];
    if (!axis) return null;
    if (axis === 'kLeftTrigger' || axis === 'kRightTrigger') {
      return call.name === 'axisGreaterThan' ? { input: axis === 'kLeftTrigger' ? 'lt' : 'rt', threshold: v } : null;
    }
    const sign = call.name === 'axisGreaterThan' ? 1 : -1;
    if ((sign > 0 && v < 0) || (sign < 0 && v > 0)) return null;
    const d = INPUTS.find((x) => x.kind === 'axis' && x.axis === axis && x.sign === sign);
    return d ? { input: d.id, threshold: Math.abs(v) } : null;
  }
  return null;
}

/** "intake.runIntake()" -> "Run intake", "new ScoreAmp(arm, shooter)" -> "Score amp". */
export function commandName(expr) {
  const e = expr.trim();
  let word = /^new\s+([A-Z]\w*)/.exec(e)?.[1];
  if (!word) {
    const calls = [...e.matchAll(/\.?([A-Za-z_]\w*)\s*\(/g)].map((m) => m[1]);
    word = calls.find((w) => !['Commands', 'runOnce', 'run', 'startEnd', 'runEnd', 'withTimeout', 'until'].includes(w)) || calls[0];
    const ref = /::\s*(\w+)/.exec(e)?.[1];
    if (ref && /^Commands\.(runOnce|run)\b/.test(e)) word = ref;
  }
  if (!word) return 'Command';
  const words = word.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words[0].toUpperCase() + words.slice(1);
}

function conditionName(supplier) {
  const s = supplier.trim();
  const ref = /::\s*(\w+)$/.exec(s)?.[1];
  if (ref) return ref;
  const call = /\.\s*(\w+)\s*\(\s*\)\s*$/.exec(s)?.[1];
  if (call) return call;
  return null;
}

/**
 * Read a RobotContainer.java. Returns { config, recognized, problems } where problems is a list of
 * { text, code } for everything that was skipped.
 */
export function importJava(source) {
  const src = stripComments(String(source || ''));
  const cfg = blankConfig();
  cfg.controllers = [];
  const problems = [];
  const consts = {};
  for (const m of src.matchAll(/\b([A-Za-z_]\w*)\s*=\s*(\d+)\s*;/g)) consts[m[1]] = Number(m[2]);

  for (const m of src.matchAll(/\b(Command(?:Xbox|PS4|PS5)Controller)\s+(\w+)\s*=\s*new\s+Command(?:Xbox|PS4|PS5)Controller\s*\(\s*([^)]*?)\s*\)/g)) {
    let port = Number(m[3]);
    if (!Number.isInteger(port)) port = consts[m[3].split('.').pop()] ?? cfg.controllers.length;
    const name = m[2].replace(/^m_/, '').replace(/Controller$|Joystick$/i, '') || m[2];
    cfg.controllers.push({ id: m[2], name: name[0].toUpperCase() + name.slice(1), var: m[2], port, type: CLS[m[1]] });
  }
  for (const m of src.matchAll(/\b(CommandGenericHID|CommandJoystick)\s+(\w+)\s*=/g)) {
    problems.push({ text: `${m[1]} "${m[2]}" is not supported yet (Xbox, PS4 and PS5 only); its bindings are skipped.`, code: m[0] });
  }
  if (!cfg.controllers.length) {
    cfg.controllers = blankConfig().controllers;
    problems.push({ text: 'No CommandXboxController / CommandPS4Controller / CommandPS5Controller fields found; using a driver on port 0 and an operator on port 1.', code: '' });
  }
  const ctrlByVar = Object.fromEntries(cfg.controllers.map((c) => [c.var, c]));

  const skipTypes = new Set(['Trigger', 'SendableChooser', ...Object.keys(CLS), 'CommandGenericHID', 'CommandJoystick']);
  for (const m of src.matchAll(/\b([A-Z]\w*)\s+(\w+)\s*=\s*new\s+\1\s*\(/g)) {
    if (skipTypes.has(m[1]) || cfg.subsystems.some((s) => s.var === m[2])) continue;
    const name = m[1].replace(/Subsystem$/, '') || m[1];
    cfg.subsystems.push({ id: m[2], name, var: m[2] });
  }

  let body = src;
  const head = /void\s+configureBindings\s*\(\s*\)\s*\{/.exec(src);
  if (head) {
    const open = head.index + head[0].length - 1;
    const end = closeOf(src, open);
    body = src.slice(open + 1, end < 0 ? src.length : end - 1);
  } else {
    problems.push({ text: 'No configureBindings() method found; reading binding statements from the whole file.', code: '' });
    body = src.replace(/[{}]/g, ';');
  }

  const conds = {}; // var -> condition id
  const modes = {}; // var -> mode id
  const aliases = {}; // var -> { ctrl, input, threshold, mode, conds, debounce }
  const cmdByExpr = {};
  let recognized = 0;
  const norm = (e) => e.replace(/\s+/g, ' ').trim();

  const addCondition = (supplier, name) => {
    const existing = cfg.conditions.find((q) => norm(q.supplier) === norm(supplier));
    if (existing) return existing.id;
    let base = camel(name || conditionName(supplier) || 'condition' + (cfg.conditions.length + 1));
    let n = base, k = 2;
    while (cfg.conditions.some((q) => q.name === n)) n = base + k++;
    const id = uid('q');
    cfg.conditions.push({ id, name: n, supplier: supplier.trim() });
    return id;
  };
  const addCommand = (expr) => {
    const key = norm(expr);
    if (cmdByExpr[key]) return cmdByExpr[key];
    const id = uid('k');
    const reqs = cfg.subsystems.filter((s) => new RegExp(`\\b${s.var}\\b`).test(expr)).map((s) => s.id);
    cfg.commands.push({ id, name: commandName(expr), expr: key, reqs });
    cmdByExpr[key] = id;
    return id;
  };
  const modeFrom = (supplier) => /^\(\s*\)\s*->\s*(?:this\s*\.\s*)?(\w+)\s*==\s*(\w+)\s*\.\s*(\w+)$/.exec(supplier.trim());
  const addMode = (m) => {
    cfg.modes.field = m[1];
    cfg.modes.enumName = m[2];
    let mode = cfg.modes.list.find((x) => x.const === m[3]);
    if (!mode) {
      const nm = m[3].toLowerCase().replace(/_/g, ' ');
      mode = { id: uid('m'), name: nm[0].toUpperCase() + nm.slice(1), const: m[3] };
      cfg.modes.list.push(mode);
    }
    return mode.id;
  };

  /** A plain input trigger from an and()/or() argument, or null. */
  const inputRef = (text) => {
    const ch = parseChain(text);
    if (!ch || ch.primary.kind !== 'id') return null;
    const a = aliases[ch.primary.name];
    if (a && !ch.calls.length && !a.conds.length && !a.mode && !a.debounce && a.threshold == null) return `in:${a.ctrl}:${a.input}`;
    const c = ctrlByVar[ch.primary.name];
    if (c && ch.calls.length === 1) {
      const inp = mapInput(c.type, ch.calls[0]);
      if (inp && inp.threshold == null) return `in:${c.id}:${inp.input}`;
    }
    return null;
  };

  /** Read a chain into a base state; returns { state, rest } or a string error. */
  const readBase = (ch) => {
    const p = ch.primary;
    if (p.kind === 'new') {
      const mm = modeFrom(p.arg);
      if (mm) return 'a mode Trigger used on its own';
      return { state: { ctrl: 'state', input: addCondition(p.arg), threshold: null, mode: null, conds: [], debounce: null }, rest: ch.calls };
    }
    if (ctrlByVar[p.name]) {
      const c = ctrlByVar[p.name];
      if (!ch.calls.length) return 'a controller without an input';
      const inp = mapInput(c.type, ch.calls[0]);
      if (!inp) return `${p.name}.${ch.calls[0].name}(${ch.calls[0].args}) is not an input Linkage knows`;
      return { state: { ctrl: c.id, input: inp.input, threshold: inp.threshold, mode: null, conds: [], debounce: null }, rest: ch.calls.slice(1) };
    }
    if (aliases[p.name]) return { state: structuredClone(aliases[p.name]), rest: ch.calls };
    if (conds[p.name]) return { state: { ctrl: 'state', input: conds[p.name], threshold: null, mode: null, conds: [], debounce: null }, rest: ch.calls };
    return `"${p.name}" is not a controller or a Trigger declared in configureBindings()`;
  };

  /** Apply calls; emits bindings. Returns error string or { state, count }. */
  const apply = (state, calls) => {
    let count = 0;
    for (const call of calls) {
      if (call.name === 'and' || call.name === 'or') {
        let arg = call.args.trim();
        let neg = false;
        if (/\.\s*negate\s*\(\s*\)$/.test(arg)) {
          neg = true;
          arg = arg.replace(/\.\s*negate\s*\(\s*\)$/, '').trim();
        }
        if (modes[arg] && call.name === 'and' && !neg && !state.mode) {
          state.mode = modes[arg];
          continue;
        }
        const mm = modeFrom(arg);
        if (mm && call.name === 'and' && !neg && !state.mode) {
          state.mode = addMode(mm);
          continue;
        }
        let ref = conds[arg] ? `cond:${conds[arg]}` : inputRef(arg);
        if (!ref) {
          if (/^[\w.]+$/.test(arg) && !arg.includes('.')) return `"${arg}" in ${call.name}() is not a Trigger declared in configureBindings()`;
          ref = `cond:${addCondition(arg)}`;
        }
        state.conds.push({ op: call.name, neg, ref });
      } else if (call.name === 'debounce') {
        const v = Number(splitTop(call.args, ',')[0]);
        if (!isFinite(v)) return `debounce(${call.args}) has a time Linkage can't read`;
        if (splitTop(call.args, ',').length > 1) return 'debounce with a DebounceType is not supported yet';
        state.debounce = v;
      } else if (BIND.includes(call.name)) {
        if (!call.args) return `${call.name}() has no command`;
        cfg.bindings.push({ id: uid('b'), ctrl: state.ctrl, input: state.input, type: call.name, cmd: addCommand(call.args), mode: state.mode, conds: structuredClone(state.conds), debounce: state.debounce, threshold: state.threshold });
        count++;
      } else return `.${call.name}() is not supported`;
    }
    return { state, count };
  };

  for (const raw of splitTop(body, ';')) {
    const stmt = raw.trim();
    if (!stmt) continue;
    const short = stmt.replace(/\s+/g, ' ').slice(0, 160);
    const decl = /^(?:final\s+)?Trigger\s+(\w+)\s*=\s*([\s\S]+)$/.exec(stmt);
    if (decl) {
      const [, name, rhs] = decl;
      const ch = parseChain(rhs);
      if (ch && ch.primary.kind === 'new' && !ch.calls.length) {
        const mm = modeFrom(ch.primary.arg);
        if (mm) modes[name] = addMode(mm);
        else conds[name] = addCondition(ch.primary.arg, name);
        recognized++;
        continue;
      }
      const base = ch && readBase(ch);
      if (!ch || typeof base === 'string') {
        problems.push({ text: `Couldn't read Trigger ${name}${base ? ': ' + base : ''}.`, code: short });
        continue;
      }
      const r = apply(base.state, base.rest);
      if (typeof r === 'string') problems.push({ text: `Couldn't read Trigger ${name}: ${r}.`, code: short });
      else {
        aliases[name] = r.state;
        recognized++;
      }
      continue;
    }
    if (!BIND.some((b) => stmt.includes('.' + b))) {
      if (/setDefaultCommand/.test(stmt)) problems.push({ text: 'Default commands are not bindings; left out.', code: short });
      else problems.push({ text: 'Not a binding; left out.', code: short });
      continue;
    }
    const ch = parseChain(stmt);
    if (!ch) {
      problems.push({ text: 'Couldn\'t read this statement as a Trigger chain.', code: short });
      continue;
    }
    const base = readBase(ch);
    if (typeof base === 'string') {
      problems.push({ text: `Couldn't read this binding: ${base}.`, code: short });
      continue;
    }
    const before = cfg.bindings.length;
    const r = apply(base.state, base.rest);
    if (typeof r === 'string') {
      cfg.bindings.length = before;
      problems.push({ text: `Couldn't read this binding: ${r}.`, code: short });
    } else recognized += r.count;
  }
  return { config: cfg, recognized, problems };
}
