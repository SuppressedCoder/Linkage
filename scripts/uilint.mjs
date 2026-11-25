// UI cleanliness checks. Drives the real Electron app through every screen state and panel, in light
// and dark, at desktop and phone width, and fails on anything that breaks the style brief in
// styles.css:
//   - the page scrolls sideways, text overlaps other text, or text is cut off without an ellipsis
//     and a tooltip
//   - a button's label doesn't start with a verb (navigation and pickers excepted)
//   - a severity colour doesn't match its level (red = not finished, amber = conflict, grey = note),
//     or a group holds findings of another level
//   - a font other than IBM Plex Sans, Plex Mono outside code and input names, uppercase text,
//     or a corner radius other than 6px / 8px / pill
//   - a click target smaller than 24 by 24 px, or a controller input that can't be clicked anywhere
//   - anything axe-core reports against WCAG 2.2 A and AA (contrast, names, roles)
// Screenshots of every state go to smoke/lint/ so you can look at them.
import { _electron as electron } from 'playwright';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const container = readFileSync(join(root, 'test/fixtures/RobotContainer.java'), 'utf8');
const shots = join(root, 'smoke/lint');
mkdirSync(shots, { recursive: true });

/** Runs in the page. Returns a list of problems, each a short sentence. */
function audit() {
  const out = [];
  const scope = document.querySelector('.modal') || document.body;
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden]');
  };
  const say = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    return `<${el.tagName.toLowerCase()}${cls}> "${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50)}"`;
  };
  /** The part of rect r that is not scrolled or clipped away by an ancestor. */
  const visiblePart = (el, r) => {
    let { left, top, right, bottom } = r;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const c = a.getBoundingClientRect();
      left = Math.max(left, c.left); top = Math.max(top, c.top); right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom);
    }
    return right - left > 1 && bottom - top > 1 ? { left, top, right, bottom } : null;
  };
  const token = (name) => {
    const t = document.createElement('i');
    t.style.color = `var(${name})`;
    scope.appendChild(t);
    const c = getComputedStyle(t).color;
    t.remove();
    return c;
  };

  // The page never scrolls sideways.
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`the page scrolls sideways (${document.documentElement.scrollWidth}px of content in a ${innerWidth}px window)`);

  // No text sits on top of other text.
  const lines = [];
  const walk = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.textContent.trim() && !n.parentElement.closest('svg, script, style, option, select, textarea, .toast') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  for (let n; (n = walk.nextNode());) {
    const el = n.parentElement;
    if (!shown(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      const v = visiblePart(el, r);
      if (v) lines.push({ v, el, n });
    }
  }
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i], b = lines[j];
      if (a.n === b.n) continue;
      const w = Math.min(a.v.right, b.v.right) - Math.max(a.v.left, b.v.left);
      const h = Math.min(a.v.bottom, b.v.bottom) - Math.max(a.v.top, b.v.top);
      if (w > 2 && h > 3) {
        const key = say(a.el) + say(b.el);
        if (!seen.has(key)) { seen.add(key); out.push(`text overlaps: ${say(a.el)} and ${say(b.el)}`); }
      }
    }
  }

  for (const el of scope.querySelectorAll('*')) {
    if (el.closest('svg') || !shown(el)) continue;
    const cs = getComputedStyle(el);
    // Text is never cut off, unless it ends in an ellipsis and the full text is in a tooltip.
    const clips = ['hidden', 'clip'].includes(cs.overflowX);
    if (clips && el.scrollWidth > el.clientWidth + 1 && el.textContent.trim()) {
      if (cs.textOverflow !== 'ellipsis') out.push(`text is cut off: ${say(el)}`);
      else if (!el.title) out.push(`text is cut off with an ellipsis but has no tooltip: ${say(el)}`);
    }
    // Plain type: IBM Plex Sans, Plex Mono only for code and input names, no uppercase.
    const ownText = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
    if (ownText || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName)) {
      const family = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      if (family === 'IBM Plex Mono') {
        if (!el.closest('code, pre, .mono, .lg b, .others .chip, .sheet td.inp, .tb')) out.push(`code font on text that isn't code: ${say(el)}`);
      } else if (family !== 'IBM Plex Sans') out.push(`font "${family}" instead of IBM Plex Sans: ${say(el)}`);
      if (cs.textTransform === 'uppercase') out.push(`uppercase text: ${say(el)}`);
    }
    // Controls: 6px corners (8px for card-like rows, round for pills and dots), and big enough to hit.
    if (el.matches('button, select, textarea, input:not([type=checkbox]):not([type=file]), .file')) {
      const r = el.getBoundingClientRect();
      const rad = parseFloat(cs.borderTopLeftRadius);
      if (![0, 6, 8].includes(rad) && rad < r.height / 2 - 1) out.push(`corner radius ${rad}px (use 6px, 8px or a pill): ${say(el)}`);
      if (r.width < 24 || r.height < 24) out.push(`click target smaller than 24px (${Math.round(r.width)}x${Math.round(r.height)}): ${say(el)}`);
    }
  }

  // Every action button says what it does, starting with a verb. Navigation, pickers and list rows
  // are named by what they show instead.
  const VERBS = /^(Add|Open|Copy|Save|Load|Clear|Import|Print|Pick|Fix|Delete|Remove|Expand|Collapse|Show|Close|Undo|Redo)\b/;
  for (const el of scope.querySelectorAll('button, label.file')) {
    if (!shown(el) || el.matches('.seg, .chip, .lg, .bhead, [data-panel]')) continue;
    const label = (el.getAttribute('aria-label') || el.textContent).trim().replace(/^\+\s*/, '');
    if (!label) out.push(`button with no name: ${say(el)}`);
    else if (!VERBS.test(label)) out.push(`button label doesn't start with a verb: ${say(el)}`);
  }

  // Severity colours match their level, and groups only hold their own level.
  const level = { error: token('--error'), warn: token('--warn'), info: token('--line2') };
  for (const li of scope.querySelectorAll('.checks li')) {
    const lv = ['error', 'warn', 'info'].find((l) => li.classList.contains(l));
    if (!lv) { out.push(`finding with no level: ${say(li)}`); continue; }
    if (getComputedStyle(li).borderLeftColor !== level[lv]) out.push(`${lv} finding has the wrong colour: ${say(li)}`);
    const g = li.closest('.group');
    const gl = g && ['error', 'warn', 'info'].find((l) => g.classList.contains(`g-${l}`));
    if (g && gl !== lv) out.push(`${lv} finding inside the ${gl} group: ${say(li)}`);
  }
  for (const c of scope.querySelectorAll('.group .count')) {
    const gl = ['error', 'warn'].find((l) => c.closest(`.g-${l}`));
    if (gl && getComputedStyle(c).color !== level[gl]) out.push(`${gl} count has the wrong colour: ${say(c)}`);
  }
  for (const f of scope.querySelectorAll('.flag')) {
    const lv = ['error', 'warn'].find((l) => f.classList.contains(l));
    if (!lv || getComputedStyle(f).backgroundColor !== level[lv]) out.push(`warning mark has no level or the wrong colour: ${say(f)}`);
  }

  // Every input on the controller picture can be clicked somewhere.
  const pad = scope.querySelector('.desk .pad');
  if (pad && !document.querySelector('.modal')) {
    pad.scrollIntoView({ block: 'center' });
    for (const g of pad.querySelectorAll('g.in')) {
      const r = g.getBoundingClientRect();
      let hits = 0;
      for (let x = 1; x < 10; x++) {
        for (let y = 1; y < 10; y++) {
          const el = document.elementFromPoint(r.left + (r.width * x) / 10, r.top + (r.height * y) / 10);
          if (el?.closest('g.in') === g) hits++;
        }
      }
      if (hits < 3) out.push(`controller input ${g.dataset.in} is almost entirely covered (${hits} of 81 points reach it)`);
    }
    scrollTo(0, 0);
  }
  return out;
}

const app = await electron.launch({
  args: [root, ...(process.env.CI ? ['--no-sandbox'] : [])],
  env: { ...process.env, LINKAGE_USER_DATA: join(mkdtempSync(join(tmpdir(), 'linkage-lint-')), 'data') },
});
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.waitForSelector('.desk .pad');
await page.evaluate(axeSource);

// Picture inputs are selected the way a click would; whether they can really be clicked is checked above.
const pick = (ctrl, input) => page.evaluate(([c, i]) => document.querySelector(`g[data-ctrl="${c}"][data-in="${i}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true })), [ctrl, input]);
const panel = async (name) => { await page.click(`[data-panel=${name}]`); await page.waitForSelector('.modal'); };
const close = () => page.click('[data-act=closePanel]');
const fresh = async () => { await page.evaluate(() => { localStorage.clear(); location.reload(); }); await page.waitForSelector('.desk .pad'); await page.evaluate(axeSource); };

// The checks must catch a page that breaks them, or a clean run means nothing.
{
  const caught = await page.evaluate((src) => {
    const audit = new Function(`return (${src})()`);
    const bad = document.createElement('div');
    bad.innerHTML = `<p style="position:relative;height:40px"><span style="position:absolute;left:0;top:0">Overlapping words</span><span style="position:absolute;left:4px;top:2px">Overlapping words</span></p>
      <button class="ghost">Command</button><p style="text-transform:uppercase">Shouting</p>
      <div style="width:60px;overflow:hidden;white-space:nowrap">A long line that does not fit</div>
      <ul class="checks"><li class="error" style="border-left-color:orange">Wrong colour</li></ul>
      <button style="width:14px;height:14px;padding:0;min-height:0" aria-label="Delete">x</button>`;
    document.body.prepend(bad);
    const found = audit();
    bad.remove();
    return found;
  }, audit.toString());
  const expect = [/text overlaps/, /doesn't start with a verb/, /uppercase/, /text is cut off/, /error finding has the wrong colour/, /click target smaller/];
  const missed = expect.filter((re) => !caught.some((c) => re.test(c)));
  console.log(`${missed.length ? 'FAIL' : 'ok  '} the checks catch a page built to break them${missed.length ? `; missed ${missed.join(', ')}` : ''}`);
  if (missed.length) process.exitCode = 1;
}

const STATES = [
  ['main', async () => {}],
  ['operator-collapsed', async () => { await page.click('[data-act=ctrl][data-ctrl=operator]'); await pick('operator', 'south'); }],
  ['unfinished', async () => { await page.click('[data-act=ctrl][data-ctrl=driver]'); await pick('driver', 'rt'); await page.click('[data-act=addBinding]'); }],
  ['empty-input', async () => pick('driver', 'west')],
  ['robot-state', async () => page.click('[data-act=sel][data-ctrl=state]')],
  ['panel-code', async () => panel('code')],
  ['panel-cheat', async () => { await close(); await panel('cheat'); }],
  ['panel-setup', async () => { await close(); await panel('setup'); }],
  ['panel-share', async () => { await close(); await panel('share'); }],
  ['import-result', async () => { await page.fill('#javaText', container); await page.click('[data-act=import]'); await page.waitForSelector('.import-result'); }],
  ['after-import', async () => close()],
  ['blank', async () => { await panel('share'); await page.click('[data-act=clearAll]'); await close(); }],
];

let failed = 0;
for (const [w, h, size] of [[1400, 900, 'desktop'], [390, 844, 'phone']]) {
  await page.setViewportSize({ width: w, height: h });
  await fresh();
  for (const [name, go] of STATES) {
    await go();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(80);
      const found = await page.evaluate(audit);
      const axe = await page.evaluate(async () => {
        const r = await window.axe.run(document.querySelector('.modal') || document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] });
        return r.violations.flatMap((v) => v.nodes.map((n) => `axe ${v.id}: ${v.help} at ${n.target.join(' ')}${n.any[0]?.message ? ` (${n.any[0].message})` : ''}`));
      });
      const all = [...found, ...axe];
      const label = `${size} ${theme} ${name}`;
      console.log(`${all.length ? 'FAIL' : 'ok  '} ${label}`);
      for (const p of all) console.log(`       ${p}`);
      failed += all.length;
      await page.screenshot({ path: join(shots, `${size}-${name}-${theme}.png`) });
    }
  }
}
await page.evaluate(() => delete document.documentElement.dataset.theme);
if (errors.length) { console.log(`FAIL page errors: ${errors.join(' | ')}`); failed++; }
await app.close();
console.log(failed ? `${failed} problem(s) found` : 'the UI is clean');
process.exit(failed || process.exitCode ? 1 : 0);
