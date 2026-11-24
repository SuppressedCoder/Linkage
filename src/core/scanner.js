// Project scanner: read every .java file in a robot project and find every Trigger it creates and
// every binding it makes, with file and line, then check them together across files.
import { blankConfig, ctype, inputLabel } from './model.js';
import {
  stripComments, statements, lineAt, controllerFields, intConstants, createReader, subsystemFields, findConfigureBindings,
} from './importer.js';
import { check } from './checks.js';
import { index, parseRef } from './codegen.js';

const BIND_RE = /\.\s*(onTrue|onFalse|whileTrue|whileFalse|toggleOnTrue|toggleOnFalse)\s*\(/;

/** What kind of file this is, from its class declaration. */
function classInfo(src) {
  const m = /\b(?:public\s+)?(?:final\s+)?class\s+(\w+)(?:\s*<[^>]*>)?(?:\s+extends\s+([\w.]+))?/.exec(src);
  return { cls: m?.[1] ?? null, ext: m?.[2] ?? null };
}

/**
 * Scan a project. files: [{ path, text }] with paths relative to the project root, '/' separated.
 * Returns {
 *   files: [{ path, cls, role, triggers, bindings, problems }],   per-file findings with lines
 *   config,                                                        every binding in one configuration (controllers by port)
 *   where: { bindingId: { path, line } },
 *   container: path of RobotContainer or null,
 *   findings: [{ level, text, refs: [{ path, line }] }]           cross-file checks
 * }
 */
export function scanProject(files) {
  const java = files.filter((f) => f.path.endsWith('.java')).map((f) => ({ ...f, src: stripComments(f.text) }));
  // RobotContainer first, so its controller names win
  java.sort((a, b) => Number(/RobotContainer\.java$/.test(b.path)) - Number(/RobotContainer\.java$/.test(a.path)) || a.path.localeCompare(b.path));
  const consts = intConstants(...java.map((f) => f.src));
  const cfg = blankConfig();
  cfg.controllers = [];
  const ctrlByPort = {};
  const varsByFile = {};

  // controllers in every file, merged by port
  for (const f of java) {
    varsByFile[f.path] = {};
    for (const c of controllerFields(f.src, consts)) {
      const port = c.port ?? `?${c.var}`;
      let ctrl = ctrlByPort[port];
      if (!ctrl) {
        const nm = c.var.replace(/^m_/, '').replace(/Controller$|Joystick$/i, '') || c.var;
        ctrl = { id: `port${port}`, name: nm[0].toUpperCase() + nm.slice(1), var: c.var, port: typeof port === 'number' ? port : 0, type: c.type, seen: [] };
        ctrlByPort[port] = ctrl;
        cfg.controllers.push(ctrl);
      }
      ctrl.seen.push({ path: f.path, var: c.var, type: c.type, line: lineAt(f.src, c.start) });
      varsByFile[f.path][c.var] = ctrl;
    }
  }

  const container = java.find((f) => classInfo(f.src).cls === 'RobotContainer') || java.find((f) => findConfigureBindings(f.src));
  // subsystems: fields in RobotContainer, then any class that extends a Subsystem base
  const subsByClass = {};
  if (container) {
    for (const s of subsystemFields(container.src)) {
      cfg.subsystems.push({ id: s.var, name: s.name, var: s.var });
      subsByClass[s.cls] = s.var;
    }
  }
  for (const f of java) {
    const { cls, ext } = classInfo(f.src);
    if (cls && /Subsystem(Base)?$/.test(ext || '') && !subsByClass[cls]) {
      const v = cls[0].toLowerCase() + cls.slice(1);
      cfg.subsystems.push({ id: v, name: cls.replace(/Subsystem$/, '') || cls, var: v });
      subsByClass[cls] = v;
    }
  }

  const out = [];
  const where = {};
  for (const f of java) {
    const { cls, ext } = classInfo(f.src);
    const isSubsystem = /Subsystem(Base)?$/.test(ext || '');
    const role = f === container ? 'container' : isSubsystem ? 'subsystem' : 'other';
    // Commands built inside a subsystem with its own factories (run, runOnce, this.x) require that subsystem.
    const own = isSubsystem ? subsByClass[cls] : null;
    const reqsFor = (expr) => {
      const r = cfg.subsystems.filter((s) => s.var && new RegExp(`\\b${s.var}\\b`).test(expr)).map((s) => s.id);
      if (own && !r.includes(own) && /^(this\s*\.|run\s*\(|runOnce\s*\(|startEnd\s*\(|runEnd\s*\(|defer\s*\(|[a-z]\w*\s*\()/.test(expr.trim())) r.push(own);
      return r;
    };
    // controllers this file can see: its own fields, plus RobotContainer's when they are passed in by the same name
    const ctrlByVar = { ...(container ? varsByFile[container.path] : {}), ...varsByFile[f.path] };
    const reader = createReader(cfg, { ctrlByVar, reqsFor });
    const entry = { path: f.path, cls, role, triggers: [], bindings: [], problems: [] };
    const list = statements(f.src, 0, f.src.length, true);
    let pendingMethod = null;
    for (const st of list) {
      const line = lineAt(f.src, st.start);
      const s = st.text.replace(/^(?:@\w+\s+)*(?:(?:public|private|protected|static|final)\s+)*/, '');
      const header = /^Trigger\s+(\w+)\s*\(([^)]*)\)$/.exec(s);
      if (header) {
        pendingMethod = { name: header[1], params: header[2].trim(), line };
        continue;
      }
      if (pendingMethod && /^return\s+/.test(s)) {
        entry.triggers.push({ kind: 'method', name: `${pendingMethod.name}(${pendingMethod.params})`, expr: s.replace(/^return\s+/, ''), line: pendingMethod.line });
        pendingMethod = null;
        continue;
      }
      pendingMethod = null;
      const hasBind = BIND_RE.test(s);
      const isDecl = /^Trigger\s+\w+\s*=/.test(s);
      if (!hasBind && !isDecl) {
        if (/\bnew\s+Trigger\s*\(/.test(s)) entry.triggers.push({ kind: 'inline', name: null, expr: s.replace(/\s+/g, ' ').slice(0, 140), line });
        continue;
      }
      const r = reader.read(st.text);
      if (r.kind === 'trigger') {
        entry.triggers.push({ kind: r.alias ? 'input' : r.mode ? 'mode' : 'field', name: r.name, expr: s.replace(/^Trigger\s+\w+\s*=\s*/, '').replace(/\s+/g, ' ').slice(0, 140), line });
      } else if (r.kind === 'binding') {
        if (r.alias) entry.triggers.push({ kind: 'input', name: r.alias, expr: '', line });
        for (const id of r.ids) {
          where[id] = { path: f.path, line };
          entry.bindings.push(id);
        }
      } else if (r.kind === 'problem' && hasBind) {
        entry.problems.push({ text: r.text, code: st.text.replace(/\s+/g, ' ').slice(0, 160), line });
      }
    }
    out.push(entry);
  }

  const findings = [];
  const ix = index(cfg);
  for (const p of check(cfg)) {
    if (p.level === 'info' && !p.bindings.length) continue; // unused commands are expected in a scan
    findings.push({ level: p.level, text: p.text, refs: p.bindings.map((id) => where[id]).filter(Boolean) });
  }
  for (const e of out) {
    if (e.role === 'container' || !e.bindings.length) continue;
    findings.push({
      level: 'info',
      text: `${e.path.split('/').pop()} binds ${e.bindings.length} trigger${e.bindings.length === 1 ? '' : 's'} itself. The usual WPILib pattern is for the ${e.role === 'subsystem' ? 'subsystem' : 'class'} to expose a Trigger (for example \`public Trigger hasNote() { return new Trigger(this::hasNote); }\`) and for RobotContainer to bind it, so every binding is in one place.`,
      refs: e.bindings.map((id) => where[id]),
    });
    for (const p of e.problems) findings.push({ level: 'warn', text: `Couldn't read a binding: ${p.text}`, refs: [{ path: e.path, line: p.line }] });
  }
  if (container) {
    const e = out.find((x) => x.path === container.path);
    for (const p of e.problems) findings.push({ level: 'warn', text: `Couldn't read a binding: ${p.text}`, refs: [{ path: e.path, line: p.line }] });
  }
  for (const c of cfg.controllers) {
    const types = new Set(c.seen.map((s) => s.type));
    if (types.size > 1) findings.push({ level: 'warn', text: `Port ${c.port} is created as ${[...types].map((t) => ctype(t).cls).join(' and ')} in different places.`, refs: c.seen });
    const vars = new Set(c.seen.map((s) => s.var));
    if (c.seen.length > 1) findings.push({ level: 'info', text: `Port ${c.port} has ${c.seen.length} controller objects (${[...vars].join(', ')}). One shared object, passed where it is needed, is easier to follow.`, refs: c.seen });
  }
  const rank = { error: 0, warn: 1, info: 2 };
  findings.sort((a, b) => rank[a.level] - rank[b.level]);
  return { files: out, config: cfg, where, container: container?.path ?? null, findings, ix };
}

/** One row per binding for a table: input or trigger, type, command, conditions, file and line. */
export function bindingRows(scan) {
  const { config: cfg, where } = scan;
  const ix = index(cfg);
  return cfg.bindings.map((b) => {
    const c = ix.ctrl[b.ctrl];
    const input = b.ctrl === 'state' ? ix.cond[b.input]?.name ?? '?' : `${c?.name ?? '?'} ${c ? inputLabel(c.type, b.input) : b.input}`;
    const conds = b.conds.map((q) => {
      const r = parseRef(q.ref);
      const n = r.kind === 'cond' ? ix.cond[r.id]?.name : r.kind === 'in' ? `${ix.ctrl[r.ctrl]?.name ?? '?'} ${inputLabel(ix.ctrl[r.ctrl]?.type, r.input)}` : '?';
      return `${q.op}${q.neg ? ' not' : ''} ${n}`;
    });
    if (b.mode) conds.unshift(`${ix.mode[b.mode]?.name ?? '?'} mode`);
    if (b.debounce) conds.push(`debounce ${b.debounce} s`);
    return { id: b.id, input, type: b.type, command: ix.cmd[b.cmd]?.expr ?? '?', conds: conds.join(', '), ...where[b.id] };
  });
}
