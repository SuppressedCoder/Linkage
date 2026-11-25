// Problems in a binding configuration: overlapping bindings on one input, commands that fight
// over a subsystem, unused or missing pieces.
import { bindingType, inputDef, inputLabel } from './model.js';
import { index, parseRef } from './codegen.js';

/** Name of a binding's input for messages: "Operator A", "Robot state hasNote". */
export function where(ix, b) {
  if (b.ctrl === 'state') return `robot state ${ix.cond[b.input]?.name ?? '(missing condition)'}`;
  const c = ix.ctrl[b.ctrl];
  return c ? `${c.name} ${inputLabel(c.type, b.input)}` : '(missing controller)';
}

/**
 * True when two bindings can never be active at the same moment: different modes, or one
 * requires a condition the other requires negated (only judged when neither uses "or").
 */
export function exclusive(a, b) {
  if (a.mode && b.mode && a.mode !== b.mode) return true;
  if (a.conds.some((q) => q.op === 'or') || b.conds.some((q) => q.op === 'or')) return false;
  for (const p of a.conds) for (const q of b.conds) if (p.ref === q.ref && p.neg !== q.neg) return true;
  return false;
}

/** Two inputs that one person can't hold at once: two directions of the same D-pad, or of the same stick axis. */
function physicallyExclusive(a, b) {
  if (a.ctrl !== b.ctrl || a.ctrl === 'state') return false;
  const da = inputDef(a.input), db = inputDef(b.input);
  if (!da || !db) return false;
  if (da.kind === 'pov' && db.kind === 'pov') return true;
  return da.kind === 'axis' && db.kind === 'axis' && da.axis === db.axis && da.sign !== db.sign;
}

/**
 * All problems, most serious first. Each:
 *   level    'error' | 'warn' | 'info'
 *   kind     'unfinished' (left out of the code until fixed) | 'conflict' (two bindings fight) | 'note'
 *   title    one short sentence that names the problem
 *   detail   what it means and how to fix it
 *   text     title and detail together
 *   bindings the binding ids it is about
 *   fix      what the button next to it does: { field } focuses that field of the first binding
 *            ('cmd', 'expr', 'mode', 'ref:<i>'), { open: true } opens the bindings, { panel } opens a panel.
 */
const P = (level, kind, title, detail, bindings, fix = null) => ({ level, kind, title, detail, text: `${title} ${detail}`.trim(), bindings, fix });

export function check(cfg) {
  const ix = index(cfg);
  const out = [];
  const bs = cfg.bindings;
  for (const b of bs) {
    const w = where(ix, b);
    if (!ix.cmd[b.cmd]) out.push(P('error', 'unfinished', `${w} has no command.`, 'It is left out of the code until you pick one.', [b.id], { field: 'cmd', label: 'Pick a command' }));
    else if (!ix.cmd[b.cmd].expr.trim()) out.push(P('error', 'unfinished', `Command "${ix.cmd[b.cmd].name}" has no Java expression.`, `${w} is left out of the code until it has one.`, [b.id], { field: 'expr', label: 'Add the Java' }));
    if (b.ctrl !== 'state' && !ix.ctrl[b.ctrl]) out.push(P('error', 'unfinished', 'A binding is on a controller that no longer exists.', 'It is left out of the code. Add the controller back under Setup, or clear the binding.', [b.id], { panel: 'setup', label: 'Open setup' }));
    if (b.ctrl === 'state' && !ix.cond[b.input]) out.push(P('error', 'unfinished', 'A robot-state binding is on a trigger that no longer exists.', 'It is left out of the code. Add the trigger back under Setup.', [b.id], { panel: 'setup', label: 'Open setup' }));
    b.conds.forEach((q, i) => {
      const r = parseRef(q.ref);
      if ((r.kind === 'cond' && !ix.cond[r.id]) || (r.kind === 'in' && !ix.ctrl[r.ctrl]) || r.kind === 'none') {
        out.push(P('error', 'unfinished', `${w} has a condition that points at nothing.`, 'That condition is skipped in the code until you pick what it checks.', [b.id], { field: `ref:${i}`, label: 'Fix the condition' }));
      }
    });
    if (b.mode && !ix.mode[b.mode]) out.push(P('error', 'unfinished', `${w} uses a mode that no longer exists.`, 'Pick another mode, or Every mode.', [b.id], { field: 'mode', label: 'Pick a mode' }));
  }
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j];
      if (exclusive(a, b)) continue;
      const ta = bindingType(a.type), tb = bindingType(b.type);
      const sameInput = a.ctrl === b.ctrl && a.input === b.input;
      if (sameInput) {
        if (ta.edge !== tb.edge) continue;
        const name = (x) => (ix.cmd[x.cmd] ? `"${ix.cmd[x.cmd].name}"` : 'a binding with no command');
        out.push(P('warn', 'conflict', `${where(ix, a)} is bound twice on the same ${ta.edge === 'rise' ? 'press' : 'release'}.`,
          `${name(a)} (${a.type}) and ${name(b)} (${b.type}) both start together. Put them in different modes or give them opposite conditions.`,
          [a.id, b.id], { open: true, label: `Open ${where(ix, a)}` }));
        continue;
      }
      if (physicallyExclusive(a, b)) continue;
      if (!ta.held && !tb.held) continue;
      const ka = ix.cmd[a.cmd], kb = ix.cmd[b.cmd];
      if (!ka || !kb) continue;
      const shared = ka.reqs.filter((r) => kb.reqs.includes(r));
      if (!shared.length) continue;
      const subs = shared.map((r) => ix.sub[r]?.name ?? r).join(' and ');
      out.push(P('warn', 'conflict', `${where(ix, a)} and ${where(ix, b)} both require ${subs}.`,
        `"${ka.name}" and "${kb.name}" can run at once, so whichever starts second cancels the first. A whileTrue command does not restart when the other ends.`,
        [a.id, b.id], { open: true }));
    }
  }
  const usedCmd = new Set(bs.map((b) => b.cmd));
  for (const k of cfg.commands) if (!usedCmd.has(k.id)) out.push(P('info', 'note', `Command "${k.name}" is not bound to anything.`, '', []));
  const usedCond = new Set(bs.flatMap((b) => [...b.conds.map((q) => parseRef(q.ref)).filter((r) => r.kind === 'cond').map((r) => r.id), ...(b.ctrl === 'state' ? [b.input] : [])]));
  for (const q of cfg.conditions) if (!usedCond.has(q.id)) out.push(P('info', 'note', `Trigger "${q.name}" is not used by any binding.`, '', []));
  for (const k of cfg.commands) {
    for (const r of k.reqs) if (!ix.sub[r]) out.push(P('error', 'unfinished', `Command "${k.name}" requires a subsystem that no longer exists.`, 'Untick it under Setup.', [], { panel: 'setup', label: 'Open setup' }));
  }
  const rank = { error: 0, warn: 1, info: 2 };
  return out.sort((x, y) => rank[x.level] - rank[y.level]);
}
