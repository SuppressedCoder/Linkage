// Linkage UI. State lives in `cfg` (the shareable configuration) and `ui` (this viewer's view).
// Every change goes through commit(), which keeps undo history and autosaves.
import {
  BINDING_TYPES, CONTROLLER_TYPES, INPUTS, exampleConfig, blankConfig, normalizeConfig, inputLabel,
  takesThreshold, inputMethod, DEFAULT_THRESHOLD, uid, camel,
} from './core/model.js';
import { generateJava, context, bindingStatement, conditionVar, index } from './core/codegen.js';
import { check, where } from './core/checks.js';
import { cheatSheet, cheatMarkdown, cheatHtml } from './core/cheatsheet.js';
import { importJava } from './core/importer.js';
import { padSvg } from './ui/pad.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s) => document.querySelector(s);
const KEY = 'linkage.config.v1';
const TABS = ['bindings', 'robot', 'code', 'checks', 'cheatsheet', 'share'];

let cfg;
try {
  const saved = localStorage.getItem(KEY);
  cfg = saved ? normalizeConfig(JSON.parse(saved)) : exampleConfig();
} catch {
  cfg = exampleConfig();
}
const ui = { tab: 'bindings', sel: { ctrl: 'operator', input: 'south' }, view: 'all', newCmd: null, importResult: null, importText: '', toast: '' };
const undo = [];
const redo = [];

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* storage is optional */ }
}
function commit(fn) {
  undo.push(JSON.stringify(cfg));
  if (undo.length > 100) undo.shift();
  redo.length = 0;
  fn(cfg);
  save();
  render();
}
function restore(from, to) {
  if (!from.length) return;
  to.push(JSON.stringify(cfg));
  cfg = normalizeConfig(JSON.parse(from.pop()));
  save();
  render();
}
function toast(msg) {
  ui.toast = msg;
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 2600);
}

const ctrlOf = (id) => cfg.controllers.find((c) => c.id === id);
const cmdOf = (id) => cfg.commands.find((k) => k.id === id);
const modeName = (id) => cfg.modes.list.find((m) => m.id === id)?.name;
const visible = (b) => ui.view === 'all' || !b.mode || b.mode === ui.view;
const selKey = () => `${ui.sel.ctrl}:${ui.sel.input}`;

// ---------- Bindings view ----------

function marksFor(c) {
  const m = new Map();
  for (const b of cfg.bindings) {
    if (b.ctrl !== c.id) continue;
    if (visible(b)) m.set(b.input, 'bound');
    else if (!m.has(b.input)) m.set(b.input, 'other');
  }
  return m;
}

function legend(c) {
  const rows = INPUTS.map((d) => {
    const bs = cfg.bindings.filter((b) => b.ctrl === c.id && b.input === d.id && visible(b));
    if (!bs.length) return '';
    const sel = ui.sel.ctrl === c.id && ui.sel.input === d.id;
    return `<li><button class="lg${sel ? ' on' : ''}" data-act="sel" data-ctrl="${esc(c.id)}" data-in="${d.id}"><b>${esc(inputLabel(c.type, d.id))}</b><span>${bs
      .map((b) => `${esc(BINDING_TYPES.find((t) => t.id === b.type).verb)} ${esc(cmdOf(b.cmd)?.name || 'no command')}${condHint(b)}${b.mode && ui.view === 'all' ? ` <em>${esc(modeName(b.mode) || '')}</em>` : ''}`)
      .join('<br>')}</span></button></li>`;
  }).join('');
  return rows ? `<ul class="legend">${rows}</ul>` : '<p class="muted">Nothing bound yet. Click a button on the picture.</p>';
}

function condHint(b) {
  const n = b.conds.length + (b.debounce > 0 ? 1 : 0);
  return n ? ` <em>+${n} ${n === 1 ? 'condition' : 'conditions'}</em>` : '';
}

function padCard(c) {
  const sel = ui.sel.ctrl === c.id ? ui.sel.input : null;
  return `<section class="card pad-card" style="--team:var(--${c.id === 'driver' ? 'blue' : c.id === 'operator' ? 'red' : 'blue'})">
    <header class="pad-head"><h2>${esc(c.name)}</h2><span class="muted">port ${c.port} · ${esc(CONTROLLER_TYPES[c.type].name)} · <code>${esc(c.var)}</code></span></header>
    ${padSvg(c, marksFor(c), sel)}
    ${legend(c)}
  </section>`;
}

function stateCard() {
  const items = cfg.conditions.map((q) => {
    const n = cfg.bindings.filter((b) => b.ctrl === 'state' && b.input === q.id && visible(b)).length;
    const sel = ui.sel.ctrl === 'state' && ui.sel.input === q.id;
    return `<button class="chip${sel ? ' on' : ''}${n ? ' bound' : ''}" data-act="sel" data-ctrl="state" data-in="${esc(q.id)}">${esc(q.name)}${n ? ` <small>${n}</small>` : ''}</button>`;
  }).join('');
  return `<section class="card state-card"><header class="pad-head"><h2>Robot state triggers</h2><span class="muted">bind a command to a condition itself, e.g. rumble when a note is picked up</span></header>
    <div class="chips">${items || '<span class="muted">No conditions yet. Add them under Robot.</span>'}</div></section>`;
}

function refOptions(current) {
  const opt = (v, label) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(label)}</option>`;
  let h = `<optgroup label="Robot state">${cfg.conditions.map((q) => opt(`cond:${q.id}`, q.name)).join('')}</optgroup>`;
  for (const c of cfg.controllers) {
    h += `<optgroup label="${esc(c.name)} inputs">${INPUTS.filter((d) => d.kind !== 'axis').map((d) => opt(`in:${c.id}:${d.id}`, `${c.name} ${inputLabel(c.type, d.id)}`)).join('')}</optgroup>`;
  }
  return h;
}

function bindingCard(b, cx, problems) {
  const c = ctrlOf(b.ctrl);
  const cmd = cmdOf(b.cmd);
  const th = b.ctrl !== 'state' && c && takesThreshold(c.type, b.input);
  const mine = problems.filter((p) => p.bindings.includes(b.id));
  const code = bindingStatement(cx, b, '');
  const typeOpts = BINDING_TYPES.map((t) => `<option value="${t.id}"${t.id === b.type ? ' selected' : ''}>${t.id}  (${t.verb.toLowerCase()})</option>`).join('');
  const cmdOpts = `<option value="">Pick a command</option>${cfg.commands.map((k) => `<option value="${esc(k.id)}"${k.id === b.cmd ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}<option value="__new">New command…</option>`;
  const modeOpts = `<option value="">Every mode</option>${cfg.modes.list.map((m) => `<option value="${esc(m.id)}"${m.id === b.mode ? ' selected' : ''}>${esc(m.name)} mode</option>`).join('')}`;
  const conds = b.conds.map((q, i) => `<div class="cond">
      <select id="op-${b.id}-${i}" data-b="${b.id}" data-ci="${i}" data-k="op" aria-label="Combine"><option value="and"${q.op === 'and' ? ' selected' : ''}>and</option><option value="or"${q.op === 'or' ? ' selected' : ''}>or</option></select>
      <label class="neg"><input type="checkbox" id="neg-${b.id}-${i}" data-b="${b.id}" data-ci="${i}" data-k="neg"${q.neg ? ' checked' : ''}> not</label>
      <select id="ref-${b.id}-${i}" data-b="${b.id}" data-ci="${i}" data-k="ref" aria-label="Condition">${refOptions(q.ref)}</select>
      <button class="icon" data-act="delCond" data-b="${b.id}" data-ci="${i}" aria-label="Remove condition" title="Remove condition">×</button>
    </div>`).join('');
  const newCmd = ui.newCmd === b.id && cmd ? `<div class="newcmd">
      <label>Name<input id="nc-name-${b.id}" data-tbl="commands" data-id="${esc(cmd.id)}" data-k="name" value="${esc(cmd.name)}"></label>
      <label>Java expression<input id="nc-expr-${b.id}" class="mono" data-tbl="commands" data-id="${esc(cmd.id)}" data-k="expr" value="${esc(cmd.expr)}" placeholder="intake.runIntake()"></label>
      <div class="reqs"><span class="muted">Requires</span>${reqBoxes(cmd)}</div></div>` : '';
  return `<article class="binding${mine.some((p) => p.level !== 'info') ? ' warned' : ''}">
    <div class="row">
      <label>When<select id="type-${b.id}" data-b="${b.id}" data-k="type">${typeOpts}</select></label>
      <label>Mode<select id="mode-${b.id}" data-b="${b.id}" data-k="mode">${modeOpts}</select></label>
      <button class="icon del" data-act="delBinding" data-b="${b.id}" aria-label="Delete binding" title="Delete binding">×</button>
    </div>
    <label>Command<select id="cmd-${b.id}" data-b="${b.id}" data-k="cmd">${cmdOpts}</select></label>
    ${newCmd}
    <div class="row">
      ${th ? `<label>Threshold<input id="th-${b.id}" type="number" step="0.05" min="0" max="1" data-b="${b.id}" data-k="threshold" value="${b.threshold ?? ''}" placeholder="${DEFAULT_THRESHOLD}"></label>` : ''}
      <label>Debounce (s)<input id="db-${b.id}" type="number" step="0.05" min="0" data-b="${b.id}" data-k="debounce" value="${b.debounce ?? ''}" placeholder="none"></label>
    </div>
    <div class="conds"><span class="lbl">Conditions</span>${conds || '<span class="muted">Always, when the input fires.</span>'}
      <button class="ghost" data-act="addCond" data-b="${b.id}">+ Condition</button></div>
    ${code ? `<pre class="line"><code>${esc(code)}</code></pre>` : '<p class="muted">Pick a command to see the code.</p>'}
    ${mine.map((p) => `<p class="warn ${p.level}">${esc(p.text)}</p>`).join('')}
  </article>`;
}

function reqBoxes(cmd) {
  return cfg.subsystems.map((s) => `<label class="req"><input type="checkbox" id="req-${esc(cmd.id)}-${esc(s.id)}" data-req="${esc(s.id)}" data-cmd="${esc(cmd.id)}"${cmd.reqs.includes(s.id) ? ' checked' : ''}> ${esc(s.name)}</label>`).join('') || '<span class="muted">no subsystems</span>';
}

function editor(problems) {
  const { ctrl, input } = ui.sel;
  const c = ctrlOf(ctrl);
  const isState = ctrl === 'state';
  const q = isState && cfg.conditions.find((x) => x.id === input);
  if (!c && !q) return `<aside class="editor card"><h2>Pick an input</h2><p class="muted">Click any button, trigger, bumper, stick or D-pad direction on a controller.</p></aside>`;
  const cx = context(cfg);
  const title = isState ? `Robot state: ${q.name}` : `${c.name} ${inputLabel(c.type, input)}`;
  const base = isState ? `new Trigger(${q.supplier})  // ${conditionVar(q)}` : `${c.var}.${inputMethod(c.type, input, takesThreshold(c.type, input) ? DEFAULT_THRESHOLD : null)}`;
  const list = cfg.bindings.filter((b) => b.ctrl === ctrl && b.input === input);
  return `<aside class="editor card" style="--team:var(--${ctrl === 'operator' ? 'red' : 'blue'})">
    <header><h2>${esc(title)}</h2><code class="muted">${esc(base)}</code></header>
    ${list.map((b) => bindingCard(b, cx, problems)).join('') || '<p class="muted">No bindings on this input yet.</p>'}
    <button class="primary" data-act="addBinding">+ Add binding</button>
  </aside>`;
}

function viewBindings(problems) {
  const chips = [['all', 'All modes'], ...cfg.modes.list.map((m) => [m.id, `${m.name} mode`])]
    .map(([id, n]) => `<button class="chip${ui.view === id ? ' on' : ''}" data-act="view" data-mode="${esc(id)}">${esc(n)}</button>`).join('');
  const warnN = problems.filter((p) => p.level !== 'info').length;
  return `<div class="toolbar"><div class="chips" role="group" aria-label="Show bindings for">${chips}</div>
      ${warnN ? `<a class="warnlink" href="#checks">${warnN} ${warnN === 1 ? 'warning' : 'warnings'}</a>` : '<span class="ok">No warnings</span>'}</div>
    <div class="bind-grid"><div class="pads">${cfg.controllers.map(padCard).join('')}${stateCard()}</div>${editor(problems)}</div>`;
}

// ---------- Robot view ----------

function viewRobot() {
  const used = (id) => cfg.bindings.filter((b) => b.cmd === id).length;
  const inp = (tbl, row, k, ph = '', cls = '') => `<input id="${tbl}-${esc(row.id)}-${k}" class="${cls}" data-tbl="${tbl}" data-id="${esc(row.id)}" data-k="${k}" value="${esc(row[k])}" placeholder="${esc(ph)}" aria-label="${k}">`;
  const del = (tbl, id) => `<button class="icon" data-act="delRow" data-tbl="${tbl}" data-id="${esc(id)}" aria-label="Delete" title="Delete">×</button>`;
  return `<div class="robot">
  <section class="card"><header class="sec"><h2>Commands</h2><button class="ghost" data-act="addRow" data-tbl="commands">+ Command</button></header>
    <p class="muted">The Java expression is pasted as-is into the binding. Requirements drive the subsystem-conflict check.</p>
    <div class="scroll"><table class="stack cmds"><thead><tr><th>Name</th><th>Java expression</th><th>Requires</th><th>Used</th><th></th></tr></thead><tbody>
    ${cfg.commands.map((k) => `<tr><td>${inp('commands', k, 'name')}</td><td>${inp('commands', k, 'expr', 'new ScoreAmp(arm, shooter)', 'mono')}</td><td class="reqs">${reqBoxes(k)}</td><td class="num">${used(k.id) || '<span class="muted">0</span>'}</td><td>${del('commands', k.id)}</td></tr>`).join('')}
    </tbody></table></div></section>
  <div class="robot-side">
  <section class="card"><header class="sec"><h2>Robot-state conditions</h2><button class="ghost" data-act="addRow" data-tbl="conditions">+ Condition</button></header>
    <p class="muted">Each becomes <code>Trigger name = new Trigger(supplier);</code></p>
    <table class="stack"><thead><tr><th>Name</th><th>BooleanSupplier</th><th></th></tr></thead><tbody>
    ${cfg.conditions.map((q) => `<tr><td>${inp('conditions', q, 'name')}</td><td>${inp('conditions', q, 'supplier', 'intake::hasNote', 'mono')}</td><td>${del('conditions', q.id)}</td></tr>`).join('')}
    </tbody></table></section>
  <section class="card"><header class="sec"><h2>Modes</h2><button class="ghost" data-act="addRow" data-tbl="modes">+ Mode</button></header>
    <p class="muted">Generated as an enum field; bind a command such as <code>Commands.runOnce(() -&gt; ${esc(cfg.modes.field)} = ${esc(cfg.modes.enumName)}.SCORING)</code> to switch.</p>
    <div class="row"><label>Enum<input id="modes-enum" data-modes="enumName" value="${esc(cfg.modes.enumName)}"></label><label>Field<input id="modes-field" data-modes="field" value="${esc(cfg.modes.field)}"></label></div>
    <table class="stack"><thead><tr><th>Name</th><th>Enum constant</th><th></th></tr></thead><tbody>
    ${cfg.modes.list.map((m) => `<tr><td>${inp('modes', m, 'name')}</td><td>${inp('modes', m, 'const', 'SCORING', 'mono')}</td><td>${del('modes', m.id)}</td></tr>`).join('')}
    </tbody></table></section>
  <section class="card"><header class="sec"><h2>Subsystems</h2><button class="ghost" data-act="addRow" data-tbl="subsystems">+ Subsystem</button></header>
    <table class="stack"><thead><tr><th>Name</th><th>Field</th><th></th></tr></thead><tbody>
    ${cfg.subsystems.map((s) => `<tr><td>${inp('subsystems', s, 'name')}</td><td>${inp('subsystems', s, 'var', 'intake', 'mono')}</td><td>${del('subsystems', s.id)}</td></tr>`).join('')}
    </tbody></table></section>
  <section class="card"><header class="sec"><h2>Controllers</h2></header>
    <table class="stack"><thead><tr><th>Name</th><th>Field</th><th>Port</th><th>Type</th></tr></thead><tbody>
    ${cfg.controllers.map((c) => `<tr><td>${inp('controllers', c, 'name')}</td><td>${inp('controllers', c, 'var', '', 'mono')}</td><td><input id="controllers-${esc(c.id)}-port" type="number" min="0" max="5" data-tbl="controllers" data-id="${esc(c.id)}" data-k="port" value="${c.port}" aria-label="port"></td>
      <td><select id="controllers-${esc(c.id)}-type" data-tbl="controllers" data-id="${esc(c.id)}" data-k="type" aria-label="type">${Object.entries(CONTROLLER_TYPES).map(([k, t]) => `<option value="${k}"${k === c.type ? ' selected' : ''}>${t.name}</option>`).join('')}</select></td></tr>`).join('')}
    </tbody></table></section>
  </div></div>`;
}

// ---------- Code, checks, cheat sheet, share ----------

function viewCode(problems) {
  const java = generateJava(cfg);
  const warnN = problems.filter((p) => p.level !== 'info').length;
  return `<section class="card code-card"><header class="sec"><h2>RobotContainer.java</h2>
    <div class="btns">${warnN ? `<a class="warnlink" href="#checks">${warnN} ${warnN === 1 ? 'warning' : 'warnings'}</a>` : ''}<button class="primary" data-act="copyCode">Copy code</button></div></header>
    <p class="muted">Imports and fields go at the top of the class; <code>configureBindings()</code> replaces yours. Java for WPILib command-based (<code>edu.wpi.first.wpilibj2.command</code>).</p>
    <pre class="code"><code id="java">${esc(java)}</code></pre></section>`;
}

function viewChecks(problems) {
  const byId = Object.fromEntries(cfg.bindings.map((b) => [b.id, b]));
  const ix = index(cfg);
  const goto = (p) => {
    const b = byId[p.bindings[0]];
    return b ? `<button class="ghost" data-act="goto" data-ctrl="${esc(b.ctrl)}" data-in="${esc(b.input)}">Open ${esc(where(ix, b))}</button>` : '';
  };
  const names = { error: 'Broken', warn: 'Warnings', info: 'Notes' };
  const groups = ['error', 'warn', 'info'].map((lv) => {
    const list = problems.filter((p) => p.level === lv);
    if (!list.length) return '';
    return `<h3>${names[lv]} <span class="muted">${list.length}</span></h3><ul class="checks">${list.map((p) => `<li class="${lv}"><p>${esc(p.text)}</p>${goto(p)}</li>`).join('')}</ul>`;
  }).join('');
  return `<section class="card"><header class="sec"><h2>Checks</h2></header>
    <p class="muted">Same input bound twice with overlapping conditions, held commands that fight over a subsystem, and anything unused or broken. Bindings in different modes, or with opposite conditions, never overlap; two D-pad directions can't be held at once.</p>
    ${groups || '<p class="ok">Nothing to report.</p>'}</section>`;
}

function viewCheat() {
  const sheets = cheatSheet(cfg).filter((s) => s.rows.length);
  const cell = (c) => c.map((e) => `<div class="act"><b>${esc(e.verb)}</b> ${esc(e.action)}${e.when ? ` <i>${esc(e.when)}</i>` : ''}</div>`).join('') || '<span class="muted">-</span>';
  return `<div class="toolbar no-print"><p class="muted">What every input does, per mode. Every-mode bindings repeat in each column.</p>
    <div class="btns"><button class="ghost" data-act="copyCheat">Copy as Markdown</button><button class="ghost" data-act="saveCheat">Save printable page</button><button class="primary" data-act="print">Print</button></div></div>
    <div class="cheat">${sheets.map((s) => `<section class="card sheet" style="--team:var(--${s.id === 'operator' ? 'red' : 'blue'})">
      <h2>${esc(s.title)}</h2>
      ${s.controller ? padSvg(s.controller, marksFor(s.controller), null) : ''}
      <div class="scroll"><table><thead><tr><th>Input</th>${s.modes.map((m) => `<th>${esc(m)}</th>`).join('')}</tr></thead>
      <tbody>${s.rows.map((r) => `<tr><td class="inp">${esc(r.label)}</td>${r.cells.map((c) => `<td>${cell(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    </section>`).join('') || '<p class="muted">No bindings yet.</p>'}</div>`;
}

function viewShare() {
  const r = ui.importResult;
  return `<div class="share">
  <section class="card"><header class="sec"><h2>Save and share as JSON</h2></header>
    <p class="muted">The whole configuration: controllers, subsystems, commands, conditions, modes and bindings. This page also keeps your work in this browser between visits.</p>
    <div class="btns"><button class="primary" data-act="copyJson">Copy JSON</button><button class="ghost" data-act="saveJson">Save .json file</button>
      <label class="ghost file">Open .json file<input type="file" id="jsonFile" accept=".json,application/json"></label></div>
    <label for="jsonText" class="lbl">Or paste JSON and load it</label>
    <textarea id="jsonText" class="mono" rows="6" placeholder='{"version":1, ...}'></textarea>
    <div class="btns"><button class="ghost" data-act="loadJson">Load pasted JSON</button></div>
    <h3>Start over</h3>
    <div class="btns"><button class="ghost" data-act="reset">Load the example robot</button><button class="ghost" data-act="clearBindings">Clear bindings only</button><button class="ghost danger" data-act="clearAll">Clear everything</button></div>
    <p class="muted">All of these can be undone (Ctrl+Z or Undo at the top).</p>
  </section>
  <section class="card"><header class="sec"><h2>Import RobotContainer.java</h2></header>
    <p class="muted">Paste your file. Linkage reads controller fields, <code>new Trigger(...)</code> conditions, mode triggers and every binding chain in <code>configureBindings()</code>, and lists anything it couldn't read. Importing replaces the current configuration.</p>
    <textarea id="javaText" class="mono" rows="12" placeholder="public class RobotContainer { ... }">${esc(ui.importText)}</textarea>
    <div class="btns"><button class="primary" data-act="import">Import bindings</button><label class="ghost file">Open .java file<input type="file" id="javaFile" accept=".java,text/x-java,text/plain"></label></div>
    ${r ? `<div class="import-result"><p><b>${r.recognized}</b> statements recognized, <b>${r.bindings}</b> bindings imported${r.problems.length ? `, <b>${r.problems.length}</b> left out:` : '.'}</p>
      ${r.problems.length ? `<ul class="checks">${r.problems.map((p) => `<li class="warn"><p>${esc(p.text)}</p>${p.code ? `<code>${esc(p.code)}</code>` : ''}</li>`).join('')}</ul>` : ''}</div>` : ''}
  </section></div>`;
}

// ---------- Shell ----------

function render() {
  const problems = check(cfg);
  const warnN = problems.filter((p) => p.level !== 'info').length;
  for (const t of TABS) {
    const a = document.querySelector(`[data-tab="${t}"]`);
    a.classList.toggle('on', ui.tab === t);
    a.setAttribute('aria-current', ui.tab === t ? 'page' : 'false');
  }
  $('#checkCount').textContent = warnN ? String(warnN) : '';
  $('#undoBtn').disabled = !undo.length;
  $('#redoBtn').disabled = !redo.length;
  const views = { bindings: viewBindings, robot: viewRobot, code: viewCode, checks: viewChecks, cheatsheet: viewCheat, share: viewShare };
  const active = document.activeElement?.id;
  $('#main').innerHTML = views[ui.tab](problems);
  if (active && document.getElementById(active)) document.getElementById(active).focus();
}

function route() {
  const h = location.hash.slice(1);
  ui.tab = TABS.includes(h) ? h : 'bindings';
  render();
}

async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`);
  } catch {
    toast('Copy was blocked here; select the text and copy it by hand');
  }
}

let downloads = null;
window.claude?.use?.('downloads').then((d) => (downloads = d)).catch(() => {});
async function saveFile(filename, data, type) {
  try {
    if (downloads) {
      await downloads.save({ filename, data });
      return toast(`Saved ${filename}`);
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch {
    toast('Saving files is not allowed here; use Copy instead');
  }
}

function loadConfig(text) {
  try {
    const raw = JSON.parse(text);
    commit(() => (cfg = normalizeConfig(raw)));
    pickFirst();
    toast('Configuration loaded');
  } catch {
    toast('That is not valid JSON');
  }
}

function pickFirst() {
  const b = cfg.bindings[0];
  ui.sel = b ? { ctrl: b.ctrl, input: b.input } : { ctrl: cfg.controllers[0]?.id, input: 'south' };
  render();
}

const actions = {
  sel: (d) => { ui.sel = { ctrl: d.ctrl, input: d.in }; ui.newCmd = null; render(); },
  goto: (d) => { ui.sel = { ctrl: d.ctrl, input: d.in }; location.hash = 'bindings'; },
  view: (d) => { ui.view = d.mode; render(); },
  addBinding: () => commit((c) => {
    const { ctrl, input } = ui.sel;
    c.bindings.push({ id: uid('b'), ctrl, input, type: ctrl === 'state' ? 'onTrue' : 'onTrue', cmd: '', mode: ui.view === 'all' ? null : ui.view, conds: [], debounce: null, threshold: null });
  }),
  delBinding: (d) => commit((c) => (c.bindings = c.bindings.filter((b) => b.id !== d.b))),
  addCond: (d) => commit((c) => {
    const b = c.bindings.find((x) => x.id === d.b);
    const ref = c.conditions[0] ? `cond:${c.conditions[0].id}` : `in:${c.controllers[0].id}:lb`;
    b.conds.push({ op: 'and', neg: false, ref });
  }),
  delCond: (d) => commit((c) => c.bindings.find((x) => x.id === d.b).conds.splice(Number(d.ci), 1)),
  addRow: (d) => commit((c) => {
    const n = (list, base) => { let i = list.length + 1; while (list.some((x) => x.name === `${base} ${i}`)) i++; return `${base} ${i}`; };
    if (d.tbl === 'commands') c.commands.push({ id: uid('k'), name: n(c.commands, 'Command'), expr: '', reqs: [] });
    if (d.tbl === 'conditions') c.conditions.push({ id: uid('q'), name: camel(n(c.conditions, 'condition')), supplier: '' });
    if (d.tbl === 'subsystems') c.subsystems.push({ id: uid('s'), name: n(c.subsystems, 'Subsystem'), var: '' });
    if (d.tbl === 'modes') { const nm = n(c.modes.list, 'Mode'); c.modes.list.push({ id: uid('m'), name: nm, const: nm.toUpperCase().replace(/\W+/g, '_') }); }
  }),
  delRow: (d) => commit((c) => {
    if (d.tbl === 'modes') {
      c.modes.list = c.modes.list.filter((x) => x.id !== d.id);
      for (const b of c.bindings) if (b.mode === d.id) b.mode = null;
      if (ui.view === d.id) ui.view = 'all';
      return;
    }
    c[d.tbl] = c[d.tbl].filter((x) => x.id !== d.id);
    if (d.tbl === 'subsystems') for (const k of c.commands) k.reqs = k.reqs.filter((r) => r !== d.id);
    if (d.tbl === 'conditions') {
      c.bindings = c.bindings.filter((b) => !(b.ctrl === 'state' && b.input === d.id));
      for (const b of c.bindings) b.conds = b.conds.filter((q) => q.ref !== `cond:${d.id}`);
    }
  }),
  copyCode: () => copy(generateJava(cfg), 'Code'),
  copyCheat: () => copy(cheatMarkdown(cfg), 'Cheat sheet'),
  saveCheat: () => saveFile('controls-cheat-sheet.html', cheatHtml(cfg), 'text/html'),
  print: () => { try { window.print(); } catch { toast('Printing is blocked here; use Save printable page'); } },
  copyJson: () => copy(JSON.stringify(cfg, null, 2), 'JSON'),
  saveJson: () => saveFile('linkage-bindings.json', JSON.stringify(cfg, null, 2), 'application/json'),
  loadJson: () => loadConfig($('#jsonText').value),
  reset: () => { commit(() => (cfg = exampleConfig())); pickFirst(); },
  clearBindings: () => commit((c) => (c.bindings = [])),
  clearAll: () => { commit(() => (cfg = blankConfig())); pickFirst(); },
  import: () => {
    const text = $('#javaText').value;
    ui.importText = text;
    if (!text.trim()) return toast('Paste RobotContainer.java first');
    const r = importJava(text);
    ui.importResult = { recognized: r.recognized, bindings: r.config.bindings.length, problems: r.problems };
    commit(() => (cfg = normalizeConfig(r.config)));
    toast(`Imported ${r.config.bindings.length} bindings`);
  },
  undo: () => restore(undo, redo),
  redo: () => restore(redo, undo),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  e.preventDefault();
  actions[el.dataset.act]?.(el.dataset);
});
document.addEventListener('keydown', (e) => {
  const el = e.target.closest?.('g[data-act]');
  if (el && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    actions[el.dataset.act]?.(el.dataset);
    return;
  }
  const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
  if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    actions[e.shiftKey ? 'redo' : 'undo']();
  }
});

const numOrNull = (v) => (v === '' || !isFinite(Number(v)) ? null : Number(v));
document.addEventListener('change', (e) => {
  const t = e.target;
  const d = t.dataset;
  if (t.id === 'jsonFile' || t.id === 'javaFile') {
    const f = t.files?.[0];
    if (!f) return;
    f.text().then((text) => {
      if (t.id === 'jsonFile') loadConfig(text);
      else { ui.importText = text; render(); toast('File loaded; press Import bindings'); }
    });
    return;
  }
  if (d.req) {
    return commit((c) => {
      const k = c.commands.find((x) => x.id === d.cmd);
      k.reqs = t.checked ? [...new Set([...k.reqs, d.req])] : k.reqs.filter((r) => r !== d.req);
    });
  }
  if (d.modes) return commit((c) => (c.modes[d.modes] = t.value.trim() || (d.modes === 'field' ? 'mode' : 'Mode')));
  if (d.tbl) {
    return commit((c) => {
      const row = d.tbl === 'modes' ? c.modes.list.find((x) => x.id === d.id) : c[d.tbl].find((x) => x.id === d.id);
      if (!row) return;
      row[d.k] = d.k === 'port' ? Math.max(0, Math.round(Number(t.value) || 0)) : t.value;
    });
  }
  if (d.b && d.ci != null) {
    return commit((c) => {
      const q = c.bindings.find((x) => x.id === d.b).conds[Number(d.ci)];
      q[d.k] = d.k === 'neg' ? t.checked : t.value;
    });
  }
  if (d.b) {
    if (d.k === 'cmd' && t.value === '__new') {
      return commit((c) => {
        const k = { id: uid('k'), name: 'New command', expr: '', reqs: [] };
        c.commands.push(k);
        c.bindings.find((x) => x.id === d.b).cmd = k.id;
        ui.newCmd = d.b;
      });
    }
    return commit((c) => {
      const b = c.bindings.find((x) => x.id === d.b);
      if (d.k === 'threshold' || d.k === 'debounce') b[d.k] = numOrNull(t.value);
      else if (d.k === 'mode') b.mode = t.value || null;
      else b[d.k] = t.value;
    });
  }
});

window.addEventListener('hashchange', route);
window.addEventListener('beforeprint', () => { if (ui.tab !== 'cheatsheet') location.hash = 'cheatsheet'; });
route();
