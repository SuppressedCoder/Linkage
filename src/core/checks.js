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

/** All problems, most serious first. Each: { level: 'error'|'warn'|'info', text, bindings: [ids] }. */
export function check(cfg) {
  const ix = index(cfg);
  const out = [];
  const bs = cfg.bindings;
  for (const b of bs) {
    if (!ix.cmd[b.cmd]) out.push({ level: 'error', text: `${where(ix, b)} has no command picked.`, bindings: [b.id] });
    else if (!ix.cmd[b.cmd].expr.trim()) out.push({ level: 'error', text: `Command "${ix.cmd[b.cmd].name}" has no Java expression, so ${where(ix, b)} is left out of the code.`, bindings: [b.id] });
    if (b.ctrl !== 'state' && !ix.ctrl[b.ctrl]) out.push({ level: 'error', text: 'A binding points at a controller that no longer exists.', bindings: [b.id] });
    if (b.ctrl === 'state' && !ix.cond[b.input]) out.push({ level: 'error', text: 'A robot-state binding points at a condition that no longer exists.', bindings: [b.id] });
    for (const q of b.conds) {
      const r = parseRef(q.ref);
      if ((r.kind === 'cond' && !ix.cond[r.id]) || (r.kind === 'in' && !ix.ctrl[r.ctrl]) || r.kind === 'none') {
        out.push({ level: 'error', text: `${where(ix, b)} has a condition that points at nothing; it is skipped in the code.`, bindings: [b.id] });
      }
    }
    if (b.mode && !ix.mode[b.mode]) out.push({ level: 'error', text: `${where(ix, b)} uses a mode that no longer exists.`, bindings: [b.id] });
  }
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j];
      if (exclusive(a, b)) continue;
      const ta = bindingType(a.type), tb = bindingType(b.type);
      const sameInput = a.ctrl === b.ctrl && a.input === b.input;
      if (sameInput) {
        if (ta.edge !== tb.edge) continue;
        out.push({
          level: 'warn',
          text: `${where(ix, a)} is bound twice with overlapping conditions: "${ix.cmd[a.cmd]?.name ?? '?'}" (${a.type}) and "${ix.cmd[b.cmd]?.name ?? '?'}" (${b.type}) both start on the same ${ta.edge === 'rise' ? 'press' : 'release'}. Give them different modes or opposite conditions.`,
          bindings: [a.id, b.id],
        });
        continue;
      }
      if (physicallyExclusive(a, b)) continue;
      if (!ta.held && !tb.held) continue;
      const ka = ix.cmd[a.cmd], kb = ix.cmd[b.cmd];
      if (!ka || !kb) continue;
      const shared = ka.reqs.filter((r) => kb.reqs.includes(r));
      if (!shared.length) continue;
      const subs = shared.map((r) => ix.sub[r]?.name ?? r).join(' and ');
      out.push({
        level: 'warn',
        text: `${where(ix, a)} ("${ka.name}") and ${where(ix, b)} ("${kb.name}") can be active at once and both require ${subs}. Whichever starts second cancels the first, and a whileTrue command does not restart when the other ends.`,
        bindings: [a.id, b.id],
      });
    }
  }
  const usedCmd = new Set(bs.map((b) => b.cmd));
  for (const k of cfg.commands) if (!usedCmd.has(k.id)) out.push({ level: 'info', text: `Command "${k.name}" is not bound to anything.`, bindings: [] });
  const usedCond = new Set(bs.flatMap((b) => [...b.conds.map((q) => parseRef(q.ref)).filter((r) => r.kind === 'cond').map((r) => r.id), ...(b.ctrl === 'state' ? [b.input] : [])]));
  for (const q of cfg.conditions) if (!usedCond.has(q.id)) out.push({ level: 'info', text: `Condition "${q.name}" is not used by any binding.`, bindings: [] });
  for (const k of cfg.commands) {
    for (const r of k.reqs) if (!ix.sub[r]) out.push({ level: 'error', text: `Command "${k.name}" requires a subsystem that no longer exists.`, bindings: [] });
  }
  const rank = { error: 0, warn: 1, info: 2 };
  return out.sort((x, y) => rank[x.level] - rank[y.level]);
}
