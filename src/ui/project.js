// The Project view: every Trigger and binding in a robot project, by file, with cross-file checks.
import { bindingRows } from '../core/scanner.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const base = (p) => String(p).split('/').pop();
const loc = (r) => `<span class="loc">${esc(base(r.path))}:${r.line}</span>`;
const ROLE = { container: 'RobotContainer', subsystem: 'Subsystem', other: 'Other class' };

/**
 * @param p project state: { name, root, files, skipped, truncated, isRobot, scan, filter, desktop, dirty, linked }
 */
export function projectView(p) {
  if (!p) return emptyView();
  const s = p.scan;
  const rows = bindingRows(s);
  const outside = new Set(s.files.filter((f) => f.role !== 'container').flatMap((f) => f.bindings));
  const flagged = new Set(s.findings.filter((f) => f.level !== 'info').flatMap((f) => f.refs.map((r) => `${r.path}:${r.line}`)));
  const shown = rows.filter((r) => p.filter === 'outside' ? outside.has(r.id) : p.filter === 'flagged' ? flagged.has(`${r.path}:${r.line}`) : true);
  const withTriggers = s.files.filter((f) => f.triggers.length || f.bindings.length || f.problems.length);
  const nTriggers = s.files.reduce((n, f) => n + f.triggers.length, 0);
  const warn = s.findings.filter((f) => f.level !== 'info').length;
  const chip = (id, label, n) => `<button class="chip${p.filter === id ? ' on' : ''}" data-act="pfilter" data-f="${id}">${esc(label)} <small>${n}</small></button>`;
  return `<div class="project">
  <section class="card proj-head">
    <div><h2>${esc(p.name)}</h2><p class="muted mono">${esc(p.root)}</p>
      ${p.isRobot === false ? '<p class="warn">No build.gradle here; this may not be a robot project.</p>' : ''}
      ${p.truncated ? '<p class="warn">Stopped after 3000 files.</p>' : ''}
      ${p.skipped?.length ? `<p class="warn">Skipped ${p.skipped.length} file(s) over 1 MB.</p>` : ''}</div>
    <div class="figs">
      <div><b>${p.files.length}</b><span>Java files</span></div>
      <div><b>${nTriggers}</b><span>Triggers made</span></div>
      <div><b>${rows.length}</b><span>Bindings</span></div>
      <div><b>${withTriggers.length}</b><span>Files involved</span></div>
      <div class="${warn ? 'hot' : ''}"><b>${warn}</b><span>Warnings</span></div>
    </div>
    <div class="btns">
      ${p.desktop ? '<button class="ghost" data-act="rescan">Rescan</button>' : ''}
      <button class="ghost" data-act="openProject">${p.desktop ? 'Open another project' : 'Choose another folder'}</button>
      ${s.container ? `<button class="primary" data-act="editContainer">Edit ${esc(base(s.container))} bindings</button>` : ''}
      ${p.desktop ? '<button class="ghost" data-act="closeProject">Close project</button>' : ''}
    </div>
    ${!s.container ? '<p class="warn">No RobotContainer (or configureBindings()) found, so Linkage can list triggers but has nowhere to write bindings.</p>' : ''}
  </section>

  <section class="card">
    <header class="sec"><h2>Where triggers live</h2></header>
    <div class="scroll"><table class="stack files"><thead><tr><th>File</th><th>Kind</th><th>Triggers made</th><th>Bindings</th></tr></thead><tbody>
    ${withTriggers.map((f) => `<tr><td><b>${esc(base(f.path))}</b><br><span class="muted mono small">${esc(f.path)}</span></td><td>${ROLE[f.role]}</td>
      <td>${f.triggers.map((t) => `<div class="trig"><code>${esc(t.name || 'new Trigger(…)')}</code> <span class="loc">line ${t.line}</span>${t.expr ? `<br><span class="muted mono small">${esc(t.expr)}</span>` : ''}</div>`).join('') || '<span class="muted">none</span>'}</td>
      <td class="num">${f.bindings.length}${f.role !== 'container' && f.bindings.length ? ' <span class="tag">outside RobotContainer</span>' : ''}${f.problems.length ? ` <span class="tag bad">${f.problems.length} unread</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No Triggers or bindings in this project yet.</td></tr>'}
    </tbody></table></div>
  </section>

  <section class="card">
    <header class="sec"><h2>Checks across files</h2></header>
    ${s.findings.length ? `<ul class="checks">${s.findings.map((f) => `<li class="${f.level}"><p>${esc(f.text)}</p><span class="refs">${f.refs.map(loc).join(' ')}</span></li>`).join('')}</ul>` : '<p class="ok">Nothing to report.</p>'}
  </section>

  <section class="card">
    <header class="sec"><h2>Every binding</h2><div class="chips">${chip('all', 'All', rows.length)}${chip('outside', 'Outside RobotContainer', outside.size)}${chip('flagged', 'With warnings', rows.filter((r) => flagged.has(`${r.path}:${r.line}`)).length)}</div></header>
    <div class="scroll"><table class="stack"><thead><tr><th>Input or trigger</th><th>When</th><th>Command</th><th>Conditions</th><th>Where</th></tr></thead><tbody>
    ${shown.map((r) => `<tr class="${outside.has(r.id) ? 'ext' : ''}"><td><b>${esc(r.input)}</b></td><td><code class="nowrap">${esc(r.type)}</code></td><td><code>${esc(r.command)}</code></td><td>${esc(r.conds) || '<span class="muted">-</span>'}</td><td>${loc(r)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">None.</td></tr>'}
    </tbody></table></div>
  </section>
  </div>`;
}

function emptyView() {
  const desktop = !!window.linkage?.desktop;
  return `<section class="card empty">
    <h2>Open a robot project</h2>
    <p>Linkage reads every <code>.java</code> file in the project, lists every Trigger and binding with its file and line, and checks them together: the same button bound in two files, commands that fight over a subsystem, bindings made outside RobotContainer.</p>
    <p>${desktop ? 'Then edit RobotContainer’s bindings on the controller pictures and write them back, after a preview of every changed line.' : 'In the browser Linkage can only read the folder. Use the desktop app to write changes back.'}</p>
    <div class="btns"><button class="primary" data-act="openProject">Open robot project folder</button></div>
    <p class="muted">Nothing leaves this computer. The editor works without a project too: see Bindings.</p>
  </section>`;
}

/** The write-back preview dialog. */
export function diffDialog(path, hunks, notes) {
  return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlgTitle"><div class="sheet-modal card">
    <header class="sec"><h2 id="dlgTitle">Write ${esc(base(path))}</h2><button class="icon" data-act="closeDialog" aria-label="Close">×</button></header>
    <ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    <pre class="diff">${hunks.map((h) => (h.op === '…' ? '<span class="gap">⋯</span>' : `<span class="${h.op === '+' ? 'add' : h.op === '-' ? 'del' : 'ctx'}"><i>${h.op === '+' ? '' : h.a}</i><i>${h.op === '-' ? '' : h.b}</i>${esc(h.op)} ${esc(h.line)}</span>`)).join('')}</pre>
    <p class="muted">The old file is backed up first. If the file changed on disk since the last scan, nothing is written.</p>
    <div class="btns"><button class="primary" data-act="confirmWrite">Write file</button><button class="ghost" data-act="closeDialog">Cancel</button></div>
  </div></div>`;
}
