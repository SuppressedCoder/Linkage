// Write a configuration back into an existing RobotContainer.java: replace configureBindings(),
// add missing imports, controller fields and the mode enum. Everything else in the file is kept.
import { ctype } from './model.js';
import { imports, fieldBlocks, methodLines } from './codegen.js';
import { stripComments, findConfigureBindings, controllerFields } from './importer.js';

/** The file's indent unit, from its first indented line: two spaces, four spaces or a tab. */
function indentUnit(src) {
  const m = /\n([ \t]+)\S/.exec(src);
  if (!m) return '  ';
  if (m[1].startsWith('\t')) return '\t';
  return m[1].length >= 4 ? '    ' : '  ';
}

/** Re-indent generated two-space lines to the file's unit, at `depth` levels. */
function reindent(lines, unit, depth) {
  return lines.map((l) => {
    if (!l.trim()) return '';
    const lead = l.length - l.trimStart().length;
    return unit.repeat(depth + Math.floor(lead / 2)) + ' '.repeat(lead % 2) + l.trimStart();
  });
}

/**
 * New text for RobotContainer.java with this configuration applied.
 * Returns { text, notes }: notes say what changed and anything left for the person to do.
 */
export function applyToContainer(original, cfg) {
  let text = original;
  const notes = [];
  const unit = indentUnit(text);
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const src = () => stripComments(text);

  // 1. configureBindings()
  const method = reindent(methodLines(cfg), unit, 1);
  const m = findConfigureBindings(src());
  if (m) {
    const lineStart = text.lastIndexOf('\n', m.sigStart) + 1;
    const sig = /^(.*?)void\s+configureBindings/s.exec(text.slice(m.sigStart))[1];
    method[0] = method[0].replace(/^(\s*)private /, `$1${sig}`);
    const comments = (text.slice(m.open, m.close).match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) || []).filter((c) => !method.some((l) => l.includes(c.trim())));
    text = text.slice(0, lineStart) + method.join(nl) + text.slice(m.close);
    notes.push('Replaced configureBindings().');
    if (comments.length) notes.push(`${comments.length} comment${comments.length === 1 ? '' : 's'} between statements in configureBindings() will be removed (comments inside kept statements stay).`);
  } else {
    const end = src().lastIndexOf('}');
    if (end < 0) throw new Error('This file has no class body.');
    text = text.slice(0, end) + nl + method.join(nl) + nl + text.slice(end);
    notes.push('Added configureBindings() at the end of the class. Call it from the RobotContainer constructor.');
  }

  // 2. fields, inserted after the class's opening brace (controllers) in one block
  const s2 = src();
  const cls = /\bclass\s+\w+[^{]*\{/.exec(s2);
  const existing = controllerFields(s2);
  const add = [];
  for (const f of fieldBlocks(cfg)) {
    if (f.ctrl) {
      const c = f.ctrl;
      const have = existing.find((e) => e.var === c.var);
      if (!have) {
        add.push(...f.lines);
        notes.push(`Added the ${c.var} controller field (port ${c.port}).`);
        continue;
      }
      const wantCls = ctype(c.type).cls;
      const portIsNumber = /^\d+$/.test(have.portText);
      if (have.cls !== wantCls || (portIsNumber && Number(have.portText) !== c.port)) {
        const re = new RegExp(`\\b${have.cls}(\\s+${c.var}\\s*=\\s*new\\s+)${have.cls}\\s*\\(\\s*${have.portText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\)`);
        const port = portIsNumber ? String(c.port) : have.portText;
        text = text.replace(re, `${wantCls}$1${wantCls}(${port})`);
        notes.push(`Changed the ${c.var} field to ${wantCls}(${port}).`);
      } else if (!portIsNumber && have.port != null && have.port !== c.port) {
        notes.push(`${c.var} uses ${have.portText} (= ${have.port}); Linkage has port ${c.port}. Change the constant if you meant to.`);
      }
    } else if (f.key === 'modes') {
      if (!new RegExp(`\\benum\\s+${cfg.modes.enumName}\\b`).test(s2)) {
        add.push(...f.lines);
        notes.push(`Added the ${cfg.modes.enumName} enum and the ${cfg.modes.field} field.`);
      } else {
        const body = new RegExp(`\\benum\\s+${cfg.modes.enumName}\\s*\\{([^}]*)\\}`).exec(s2)?.[1] || '';
        const missing = cfg.modes.list.map((x) => x.const).filter((k) => !new RegExp(`\\b${k}\\b`).test(body));
        if (missing.length) notes.push(`Your ${cfg.modes.enumName} enum is missing ${missing.join(', ')}; add ${missing.length === 1 ? 'it' : 'them'} by hand.`);
        if (!new RegExp(`\\b${cfg.modes.enumName}\\s+${cfg.modes.field}\\b`).test(s2)) notes.push(`No ${cfg.modes.enumName} ${cfg.modes.field} field found; add one by hand.`);
      }
    }
  }
  if (add.length && cls) {
    const at = cls.index + cls[0].length;
    const block = reindent(add, unit, 1).join(nl);
    text = text.slice(0, at) + nl + block + nl + text.slice(at);
  }

  // 3. imports
  const s3 = src();
  const need = imports(cfg).filter((i) => {
    const pkg = i.slice(0, i.lastIndexOf('.'));
    const outer = i.split('.').slice(0, -1).join('.');
    return !new RegExp(`^\\s*import\\s+(${i.replace(/\./g, '\\.')}|${pkg.replace(/\./g, '\\.')}\\.\\*|${outer.replace(/\./g, '\\.')}\\.\\*)\\s*;`, 'm').test(s3);
  });
  if (need.length) {
    const imps = [...s3.matchAll(/^[ \t]*import\s+[\w.*]+\s*;[^\r\n]*(?=\r?$)/gm)];
    const pkg = /^[ \t]*package\s+[\w.]+\s*;[^\r\n]*(?=\r?$)/m.exec(s3);
    const lines = need.map((i) => `import ${i};`).join(nl);
    if (imps.length) {
      const last = imps[imps.length - 1];
      const at = last.index + last[0].length;
      text = text.slice(0, at) + nl + lines + text.slice(at);
    } else if (pkg) {
      const at = pkg.index + pkg[0].length;
      text = text.slice(0, at) + nl + nl + lines + text.slice(at);
    } else text = lines + nl + nl + text;
    notes.push(`Added ${need.length} import${need.length === 1 ? '' : 's'}.`);
  }
  return { text, notes };
}

/** Line diff (LCS). Returns [{ op: ' ' | '+' | '-', line }]. */
export function lineDiff(a, b) {
  const A = a.split(/\r?\n/), B = b.split(/\r?\n/);
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let post = 0;
  while (post < A.length - pre && post < B.length - pre && A[A.length - 1 - post] === B[B.length - 1 - post]) post++;
  const a2 = A.slice(pre, A.length - post), b2 = B.slice(pre, B.length - post);
  const n = a2.length, m = b2.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a2[i] === b2[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = A.slice(0, pre).map((line) => ({ op: ' ', line }));
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a2[i] === b2[j]) { out.push({ op: ' ', line: a2[i] }); i++; j++; }
    else if (i < n && (j === m || dp[i + 1][j] >= dp[i][j + 1])) out.push({ op: '-', line: a2[i++] });
    else out.push({ op: '+', line: b2[j++] });
  }
  out.push(...A.slice(A.length - post).map((line) => ({ op: ' ', line })));
  return out;
}

/** Only the changed lines with `ctx` lines of context; gaps become { op: '…' }. */
export function diffHunks(diff, ctx = 3) {
  const keep = new Uint8Array(diff.length);
  diff.forEach((d, i) => {
    if (d.op !== ' ') for (let k = Math.max(0, i - ctx); k <= Math.min(diff.length - 1, i + ctx); k++) keep[k] = 1;
  });
  const out = [];
  let lineA = 0, lineB = 0;
  diff.forEach((d, i) => {
    if (d.op !== '+') lineA++;
    if (d.op !== '-') lineB++;
    if (keep[i]) out.push({ ...d, a: d.op === '+' ? null : lineA, b: d.op === '-' ? null : lineB });
    else if (!out.length || out[out.length - 1].op !== '…') out.push({ op: '…' });
  });
  return out;
}
