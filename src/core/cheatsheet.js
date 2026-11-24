// Driver/operator cheat sheet: what every input does, per mode. Data, Markdown and a printable page.
import { bindingType, inputLabel, INPUTS } from './model.js';
import { index, parseRef } from './codegen.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function condText(ix, b, ctrlId) {
  const parts = [];
  for (const q of b.conds) {
    const r = parseRef(q.ref);
    let name;
    if (r.kind === 'cond') name = ix.cond[r.id]?.name;
    else if (r.kind === 'in') {
      const c = ix.ctrl[r.ctrl];
      if (c) name = (r.ctrl === ctrlId ? '' : c.name + ' ') + inputLabel(c.type, r.input);
    }
    if (!name) continue;
    const isInput = r.kind === 'in';
    const word = q.neg ? (isInput ? 'without' : 'unless') : isInput ? 'with' : 'if';
    parts.push(`${q.op === 'or' ? 'or ' : ''}${word} ${name}`);
  }
  if (b.debounce > 0) parts.push(`after ${b.debounce} s`);
  return parts.join(', ');
}

/** One entry per controller (plus robot state when used): its mode columns and a row per bound input. */
export function cheatSheet(cfg) {
  const ix = index(cfg);
  const sheets = [];
  const entry = (b, ctrlId) => ({
    verb: ctrlId ? bindingType(b.type).verb : STATE_VERB[b.type],
    action: ix.cmd[b.cmd]?.name || '(no command)',
    when: condText(ix, b, ctrlId),
    all: !b.mode,
  });
  for (const c of cfg.controllers) {
    const mine = cfg.bindings.filter((b) => b.ctrl === c.id);
    const modeIds = [...new Set(mine.map((b) => b.mode).filter((m) => m && ix.mode[m]))];
    const modes = modeIds.length ? cfg.modes.list.filter((m) => modeIds.includes(m.id)) : [];
    const cols = modes.length ? modes : [null];
    const rows = [];
    for (const d of INPUTS) {
      const here = mine.filter((b) => b.input === d.id);
      if (!here.length) continue;
      rows.push({
        input: d.id,
        label: inputLabel(c.type, d.id),
        cells: cols.map((m) => here.filter((b) => !b.mode || !m || b.mode === m.id).map((b) => entry(b, c.id))),
      });
    }
    sheets.push({ id: c.id, title: `${c.name} (port ${c.port}, ${c.type === 'xbox' ? 'Xbox' : c.type.toUpperCase()})`, controller: c, modes: cols.map((m) => m?.name ?? 'Action'), rows });
  }
  const state = cfg.bindings.filter((b) => b.ctrl === 'state');
  if (state.length) {
    sheets.push({
      id: 'state', title: 'Automatic (robot state)', controller: null, modes: ['Action'],
      rows: state.map((b) => ({ input: b.input, label: ix.cond[b.input]?.name ?? '?', cells: [[entry(b, null)]] })),
    });
  }
  return sheets;
}

const STATE_VERB = {
  onTrue: 'Becomes true', onFalse: 'Becomes false', whileTrue: 'While true', whileFalse: 'While false',
  toggleOnTrue: 'Toggle when true', toggleOnFalse: 'Toggle when false',
};

const cellText = (cell) => cell.map((e) => `${e.verb}: ${e.action}${e.when ? ` (${e.when})` : ''}`).join('; ') || '-';

/** Plain Markdown tables, for pasting into a team doc or chat. */
export function cheatMarkdown(cfg, robotName = 'Robot') {
  const L = [`# ${robotName} controls`, ''];
  for (const s of cheatSheet(cfg)) {
    if (!s.rows.length) continue;
    L.push(`## ${s.title}`, '', `| Input | ${s.modes.join(' | ')} |`, `|---|${s.modes.map(() => '---').join('|')}|`);
    for (const r of s.rows) L.push(`| ${r.label} | ${r.cells.map(cellText).join(' | ')} |`);
    L.push('');
  }
  return L.join('\n');
}

/** A self-contained printable page (no scripts), one table per controller. */
export function cheatHtml(cfg, robotName = 'Robot') {
  const sheets = cheatSheet(cfg).filter((s) => s.rows.length);
  const cell = (c) => (c.length ? c.map((e) => `<div><b>${esc(e.verb)}</b> ${esc(e.action)}${e.when ? ` <i>${esc(e.when)}</i>` : ''}</div>`).join('') : '<span class="none">-</span>');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(robotName)} controls</title>
<style>body{font:13px/1.4 system-ui,sans-serif;margin:24px;color:#111}h1{font-size:22px;margin:0 0 12px}h2{font-size:16px;margin:18px 0 6px}
table{border-collapse:collapse;width:100%;page-break-inside:avoid}th,td{border:1px solid #999;padding:5px 7px;text-align:left;vertical-align:top}
th{background:#eee}td:first-child{font-weight:700;white-space:nowrap;width:9em}i{color:#555}.none{color:#aaa}
@page{margin:12mm}</style></head><body><h1>${esc(robotName)} controls</h1>
${sheets.map((s) => `<h2>${esc(s.title)}</h2><table><tr><th>Input</th>${s.modes.map((m) => `<th>${esc(m)}</th>`).join('')}</tr>
${s.rows.map((r) => `<tr><td>${esc(r.label)}</td>${r.cells.map((c) => `<td>${cell(c)}</td>`).join('')}</tr>`).join('\n')}</table>`).join('\n')}
</body></html>`;
}
