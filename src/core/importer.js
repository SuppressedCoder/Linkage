// Import: read an existing RobotContainer.java and rebuild the bindings it can recognize.
// Not a Java parser: it splits configureBindings() into statements and reads Trigger chains.
// Anything it can't read is reported, never silently dropped.
import { CONTROLLER_TYPES, INPUTS, blankConfig, camel, uid } from './model.js';

const BIND = ['onTrue', 'onFalse', 'whileTrue', 'whileFalse', 'toggleOnTrue', 'toggleOnFalse'];
const CLS = { CommandXboxController: 'xbox', CommandPS4Controller: 'ps4', CommandPS5Controller: 'ps5' };
const AXIS_NUM_XBOX = { 0: 'kLeftX', 1: 'kLeftY', 2: 'kLeftTrigger', 3: 'kRightTrigger', 4: 'kRightX', 5: 'kRightY' };

/** Blank out comments with spaces (offsets and line numbers stay valid), keeping string and char literals intact. */
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
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i++;
      }
      out += src[i] ?? '';
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
    const skip = ['Commands', 'runOnce', 'run', 'startEnd', 'runEnd', 'withTimeout', 'until', 'getHID', 'get', 'andThen', 'alongWith'];
    word = calls.find((w) => !skip.includes(w)) || calls[0];
    const ref = /::\s*(\w+)/.exec(e)?.[1];
    if (ref && /^(Commands\.)?(runOnce|run)\b/.test(e)) word = ref;
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
 * Split source into statements: at `;` outside brackets, and (when `braces`) also at `{` and `}`
 * outside parentheses. With `braces` off, a `}` that closes back to depth 0 also ends a statement,
 * so an if-block stays one statement. Each entry: { text, start, end } with offsets into `src`.
 */
export function statements(src, from = 0, to = src.length, braces = false) {
  const out = [];
  let depth = 0, paren = 0, start = from;
  const push = (end, next) => {
    const raw = src.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (text) out.push({ text, start: start + lead, end: start + lead + text.length });
    start = next;
  };
  for (let i = from; i < to; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < to && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      i = j;
    } else if (c === '(' || c === '[') paren++;
    else if (c === ')' || c === ']') paren--;
    else if (c === '{') {
      if (braces && paren === 0) push(i, i + 1);
      else depth++;
    } else if (c === '}') {
      if (braces && paren === 0) push(i, i + 1);
      else if (--depth === 0 && paren === 0 && !braces) push(i + 1, i + 1);
    } else if (c === ';' && paren === 0 && (braces || depth === 0)) push(i, i + 1);
  }
  push(to, to);
  return out;
}

/** Line number (1-based) of an offset. */
export function lineAt(src, offset) {
  let n = 1;
  for (let i = 0; i < offset && i < src.length; i++) if (src[i] === '\n') n++;
  return n;
}

const norm = (e) => e.replace(/\s+/g, ' ').trim();
/** A lambda or method reference is a BooleanSupplier; any other expression is taken to be a Trigger. */
export const conditionKind = (expr) => (/->|::/.test(expr) ? 'supplier' : 'trigger');

/** Controller fields in a source file: [{ cls, var, port, portText, start }]. */
export function controllerFields(src, consts = {}) {
  const out = [];
  for (const m of src.matchAll(/\b(Command(?:Xbox|PS4|PS5)Controller)\s+(\w+)\s*=\s*new\s+Command(?:Xbox|PS4|PS5)Controller\s*\(\s*([^)]*?)\s*\)/g)) {
    let port = Number(m[3]);
    if (m[3] === '' || !Number.isInteger(port)) port = consts[m[3].split('.').pop()] ?? null;
    out.push({ cls: m[1], type: CLS[m[1]], var: m[2], port, portText: m[3], start: m.index });
  }
  return out;
}

/** Integer constants anywhere in the given sources, by simple name. */
export function intConstants(...sources) {
  const consts = {};
  for (const src of sources) for (const m of src.matchAll(/\b([A-Za-z_]\w*)\s*=\s*(\d+)\s*;/g)) consts[m[1]] = Number(m[2]);
  return consts;
}

/**
 * A statement reader used by the RobotContainer importer.
 * It adds conditions, modes, commands and bindings to `cfg` as it reads.
 * opts.ctrlByVar: controller variable -> controller in cfg. opts.reqsFor(expr): subsystem ids, optional.
 */
export function createReader(cfg, opts) {
  const ctrlByVar = opts.ctrlByVar;
  const conds = {}; // trigger variable -> condition id
  const modes = {}; // mode trigger variable -> mode id
  const aliases = {}; // input trigger variable -> base state
  const cmdByExpr = {};
  const reqsFor = opts.reqsFor || ((expr) => cfg.subsystems.filter((s) => s.var && new RegExp(`\\b${s.var}\\b`).test(expr)).map((s) => s.id));

  const addCondition = (expr, name, kind = conditionKind(expr)) => {
    const existing = cfg.conditions.find((q) => norm(q.supplier) === norm(expr) && (q.kind || 'supplier') === kind);
    if (existing) return existing.id;
    const base = camel(name || conditionName(expr) || 'condition' + (cfg.conditions.length + 1));
    let n = base, k = 2;
    while (cfg.conditions.some((q) => q.name === n)) n = base + k++;
    const id = uid('q');
    cfg.conditions.push({ id, name: n, supplier: norm(expr), kind });
    return id;
  };
  const addCommand = (expr) => {
    const key = norm(expr);
    if (cmdByExpr[key]) return cmdByExpr[key];
    const id = uid('k');
    cfg.commands.push({ id, name: commandName(expr), expr: key, reqs: reqsFor(expr) });
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
  const blank = (ctrl, input, threshold = null) => ({ ctrl, input, threshold, mode: null, conds: [], debounce: null });

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

  const CHAIN = new Set(['and', 'or', 'negate', 'debounce', ...BIND]);

  /** Read the start of a chain into a base state: { state, rest } or an error string. */
  const readBase = (ch, text) => {
    const p = ch.primary;
    if (p.kind === 'new') {
      if (modeFrom(p.arg)) return 'a mode Trigger used on its own';
      return { state: blank('state', addCondition(p.arg, null, 'supplier')), rest: ch.calls };
    }
    if (ctrlByVar[p.name]) {
      const c = ctrlByVar[p.name];
      if (!ch.calls.length) return 'a controller without an input';
      const inp = mapInput(c.type, ch.calls[0]);
      if (!inp) return `${p.name}.${ch.calls[0].name}(${ch.calls[0].args}) is not an input Linkage knows`;
      return { state: blank(c.id, inp.input, inp.threshold), rest: ch.calls.slice(1) };
    }
    if (aliases[p.name]) return { state: structuredClone(aliases[p.name]), rest: ch.calls };
    if (conds[p.name]) return { state: blank('state', conds[p.name]), rest: ch.calls };
    // Something else that returns a Trigger, such as intake.hasNote() or elevator.atHeight(1.2).
    const firstChain = ch.calls.findIndex((c) => CHAIN.has(c.name));
    if (firstChain > 0) {
      const head = text.trim().replace(/^this\s*\.\s*/, '');
      const prefix = [p.name, ...ch.calls.slice(0, firstChain).map((c) => `${c.name}(${c.args})`)].join('.');
      if (norm(head).replace(/\s/g, '').startsWith(prefix.replace(/\s/g, ''))) {
        return { state: blank('state', addCondition(prefix, ch.calls[firstChain - 1].name, 'trigger')), rest: ch.calls.slice(firstChain) };
      }
    }
    return `"${p.name}" is not a controller or a Trigger Linkage knows`;
  };

  /** Apply chained calls, adding bindings. Returns { state, ids } or an error string. */
  const apply = (state, calls) => {
    const ids = [];
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
          if (/^\w+$/.test(arg)) return `"${arg}" in ${call.name}() is not a Trigger Linkage knows`;
          ref = `cond:${addCondition(arg)}`;
        }
        state.conds.push({ op: call.name, neg, ref });
      } else if (call.name === 'debounce') {
        const parts = splitTop(call.args, ',');
        const v = Number(parts[0]);
        if (!isFinite(v)) return `debounce(${call.args}) has a time Linkage can't read`;
        if (parts.length > 1) return 'debounce with a DebounceType is not supported yet';
        state.debounce = v;
      } else if (BIND.includes(call.name)) {
        if (!call.args) return `${call.name}() has no command`;
        const id = uid('b');
        cfg.bindings.push({ id, ctrl: state.ctrl, input: state.input, type: call.name, cmd: addCommand(call.args), mode: state.mode, conds: structuredClone(state.conds), debounce: state.debounce, threshold: state.threshold });
        ids.push(id);
      } else return `.${call.name}() is not supported`;
    }
    return { state, ids };
  };

  /**
   * Read one statement (comments already blanked). Returns
   * { kind: 'binding', ids } | { kind: 'trigger', name, condition?, alias? } | { kind: 'problem', text } | { kind: 'other' }.
   */
  const read = (stmt) => {
    const s = stmt.replace(/^(?:@\w+\s+)*(?:(?:public|private|protected|static|final)\s+)*/, '');
    const decl = /^Trigger\s+(\w+)\s*=\s*([\s\S]+)$/.exec(s);
    if (decl) {
      const [, name, rhs] = decl;
      const ch = parseChain(rhs);
      if (ch && ch.primary.kind === 'new' && !ch.calls.length) {
        const mm = modeFrom(ch.primary.arg);
        if (mm) {
          modes[name] = addMode(mm);
          return { kind: 'trigger', name, mode: modes[name] };
        }
        conds[name] = addCondition(ch.primary.arg, name, 'supplier');
        return { kind: 'trigger', name, condition: conds[name] };
      }
      const known = ch && ch.primary.kind === 'id' && (ctrlByVar[ch.primary.name] || aliases[ch.primary.name] || conds[ch.primary.name]);
      if (ch && !known && !ch.calls.some((c) => BIND.includes(c.name))) {
        conds[name] = addCondition(rhs, name, 'trigger');
        return { kind: 'trigger', name, condition: conds[name] };
      }
      const base = ch && readBase(ch, rhs);
      if (!ch || typeof base === 'string') return { kind: 'problem', text: `Couldn't read Trigger ${name}${base ? ': ' + base : ''}.` };
      const before = cfg.bindings.length;
      const r = apply(base.state, base.rest);
      if (typeof r === 'string') {
        cfg.bindings.length = before;
        return { kind: 'problem', text: `Couldn't read Trigger ${name}: ${r}.` };
      }
      aliases[name] = r.state;
      return r.ids.length ? { kind: 'binding', ids: r.ids, alias: name } : { kind: 'trigger', name, alias: true };
    }
    if (!BIND.some((b) => new RegExp(`\\.\\s*${b}\\s*\\(`).test(s))) {
      if (/setDefaultCommand/.test(s)) return { kind: 'problem', text: 'Default commands are not bindings; kept as they are.' };
      return { kind: 'other' };
    }
    const ch = parseChain(s);
    if (!ch) return { kind: 'problem', text: "Couldn't read this statement as a Trigger chain." };
    const base = readBase(ch, s);
    if (typeof base === 'string') return { kind: 'problem', text: `Couldn't read this binding: ${base}.` };
    const before = cfg.bindings.length;
    const r = apply(base.state, base.rest);
    if (typeof r === 'string') {
      cfg.bindings.length = before;
      return { kind: 'problem', text: `Couldn't read this binding: ${r}.` };
    }
    return { kind: 'binding', ids: r.ids };
  };

  return { read, conds, modes, aliases, addCondition };
}

/** Subsystem fields `Type name = new Type(...)` that aren't controllers or Triggers: [{ id, name, var, cls }]. */
export function subsystemFields(src) {
  const skip = new Set(['Trigger', 'SendableChooser', ...Object.keys(CLS), 'CommandGenericHID', 'CommandJoystick', 'String', 'Field2d', 'PowerDistribution']);
  const out = [];
  for (const m of src.matchAll(/\b([A-Z]\w*)\s+(\w+)\s*=\s*new\s+\1\s*\(/g)) {
    if (skip.has(m[1]) || out.some((s) => s.var === m[2])) continue;
    out.push({ id: m[2], name: m[1].replace(/Subsystem$/, '') || m[1], var: m[2], cls: m[1] });
  }
  return out;
}

/** The configureBindings() method: { sigStart, open, close } offsets (close is just past the `}`), or null. */
export function findConfigureBindings(src) {
  const head = /(?:(?:public|private|protected|static|final)\s+)*void\s+configureBindings\s*\(\s*\)\s*\{/.exec(src);
  if (!head) return null;
  const open = head.index + head[0].length - 1;
  const close = closeOf(src, open);
  return close < 0 ? null : { sigStart: head.index, open, close };
}

/**
 * Read a RobotContainer.java. Returns { config, recognized, problems } where problems is a list of
 * { text, code, raw } for everything that was skipped; config.keep holds the raw text of each
 * skipped statement inside configureBindings(), so writing back never loses it.
 */
export function importJava(source) {
  const original = String(source || '');
  const src = stripComments(original);
  const cfg = blankConfig();
  cfg.controllers = [];
  const problems = [];
  const consts = intConstants(src);

  for (const f of controllerFields(src, consts)) {
    const name = f.var.replace(/^m_/, '').replace(/Controller$|Joystick$/i, '') || f.var;
    cfg.controllers.push({ id: f.var, name: name[0].toUpperCase() + name.slice(1), var: f.var, port: f.port ?? cfg.controllers.length, type: f.type });
  }
  for (const m of src.matchAll(/\b(CommandGenericHID|CommandJoystick)\s+(\w+)\s*=/g)) {
    problems.push({ text: `${m[1]} "${m[2]}" is not supported yet (Xbox, PS4 and PS5 only); its bindings are kept as they are.`, code: m[0], raw: '' });
  }
  if (!cfg.controllers.length) {
    cfg.controllers = blankConfig().controllers;
    problems.push({ text: 'No CommandXboxController / CommandPS4Controller / CommandPS5Controller fields found; using a driver on port 0 and an operator on port 1.', code: '', raw: '' });
  }
  cfg.subsystems = subsystemFields(src).map(({ id, name, var: v }) => ({ id, name, var: v }));

  const reader = createReader(cfg, { ctrlByVar: Object.fromEntries(cfg.controllers.map((c) => [c.var, c])) });
  const m = findConfigureBindings(src);
  let list;
  if (m) list = statements(src, m.open + 1, m.close - 1);
  else {
    problems.push({ text: 'No configureBindings() method found; reading binding statements from the whole file.', code: '', raw: '' });
    list = statements(src, 0, src.length, true);
  }
  let recognized = 0;
  for (const st of list) {
    const r = reader.read(st.text);
    const raw = original.slice(st.start, st.end);
    const code = st.text.replace(/\s+/g, ' ').slice(0, 160);
    if (r.kind === 'binding' || r.kind === 'trigger') recognized += r.kind === 'binding' ? Math.max(1, r.ids.length) : 1;
    else if (r.kind === 'problem') {
      problems.push({ text: r.text, code, raw, line: lineAt(src, st.start) });
      if (m) cfg.keep.push(raw);
    } else if (m) {
      problems.push({ text: 'Not a binding; kept as it is.', code, raw, line: lineAt(src, st.start) });
      cfg.keep.push(raw);
    }
  }
  return { config: cfg, recognized, problems };
}
