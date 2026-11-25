// Drives the real Electron app with Playwright. Checks the one-screen layout (controller picture,
// bindings, conflicts), editing a binding, the panels (code, cheat sheet, save & import, setup),
// pasting a RobotContainer.java in, and that the page has no way to write files on its own.
// Screenshots go to smoke/.
import { _electron as electron } from 'playwright';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const userData = join(mkdtempSync(join(tmpdir(), 'linkage-ui-')), 'data');
const container = readFileSync(join(root, 'test/fixtures/RobotContainer.java'), 'utf8');
mkdirSync(join(root, 'smoke'), { recursive: true });

let failed = 0;
const ok = (cond, what) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failed++;
};

const app = await electron.launch({
  args: [root, ...(process.env.CI ? ['--no-sandbox'] : [])],
  env: { ...process.env, LINKAGE_USER_DATA: userData },
});
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.setViewportSize({ width: 1400, height: 900 });
await page.waitForSelector('.desk .pad');

// One screen: no tabs, the picture and the editor side by side, conflicts listed.
ok((await page.$$('.tabs, [data-tab]')).length === 0, 'there are no tabs');
ok((await page.$$('.desk .pad')).length === 1, 'one controller picture on the screen');
const box = async (s) => (await page.$(s)).boundingBox();
const [pad, side] = [await box('.pad-card'), await box('.side')];
ok(side.x > pad.x + pad.width - 1 && Math.abs(side.y - pad.y) < 4, 'controller and bindings sit side by side');
ok(/Conflicts/.test(await page.textContent('.conflicts')) && (await page.$$('.conflicts .checks li')).length >= 1, 'conflicts are listed next to the editor');
ok(await page.evaluate(() => !window.linkage.writeFile && !window.linkage.openProject), 'the page has no way to open a project or write files');

// Switch controller, pick an input, bind a command.
await page.click('[data-act=ctrl][data-ctrl=operator]');
ok((await page.$$('g[data-ctrl="operator"]')).length > 0 && (await page.$$('g[data-ctrl="driver"]')).length === 0, 'the switch shows the operator controller');
await page.click('g[data-ctrl="operator"][data-in="lsUp"]');
ok(/Operator/.test(await page.textContent('.editor h2')), 'clicking the picture opens that input');
await page.click('[data-act=addBinding]');
const cmdValue = await page.$eval('select[data-k=cmd] option:nth-child(2)', (o) => o.value);
await page.selectOption('select[data-k=cmd]', cmdValue);
ok(/^operator\.\w+\(.*\)\.onTrue\(/.test(await page.textContent('.editor pre.line')), 'the new binding shows its code');
ok(await page.isVisible('g[data-ctrl="operator"][data-in="lsUp"].bound'), 'the bound input lights up');
ok((await page.$$('.legend .lg')).length > 0 && /Bound on Operator/.test(await page.textContent('.pad-card')), 'the bound inputs are listed under the picture');
await page.click('[data-act=addBinding]');
ok((await page.$$('.binding')).length === 2 && (await page.$$('.binding.open')).length === 1, 'a new binding opens and the other collapses');
await page.click('.binding:not(.open) [data-act=toggle]');
ok((await page.$$('.binding.open')).length === 2, 'clicking a collapsed binding opens it');
await page.click('[data-act=toggleAll]');
ok((await page.$$('.binding.open')).length === 0 && (await page.$$('.binding .bhead')).length === 2, 'collapse all leaves one line per binding');
await page.click('.binding:last-child [data-act=toggle]');
await page.click('.binding.open [data-act=delBinding]');
ok((await page.$$('.binding')).length === 1, 'a binding is deleted from inside it');
await page.click('g[data-ctrl="operator"][data-in="rsDown"]');
ok(/does nothing yet/.test(await page.textContent('.editor .empty')) && (await page.$$('.editor .empty [data-act=addBinding]')).length === 1, 'an unbound input says so and offers to add a binding');
await page.click('[data-act=ctrl][data-ctrl=driver]');
await page.click('g[data-ctrl="driver"][data-in="rt"] text', { force: true });
await page.click('[data-act=addBinding]');
ok(/has no command/.test(await page.textContent('.g-error')) && !/has no command/.test(await page.textContent('.g-warn')), 'an unfinished binding is listed under Not finished, not under Conflicts');
await page.click('.g-error [data-act=fix][data-field=cmd]');
ok(await page.evaluate(() => /^cmd-/.test(document.activeElement.id)), "Pick a command jumps to that binding's command menu");
ok(await page.$$eval('.g-warn .fixes button', (bs) => bs.length > 0 && bs.every((b) => /^Open /.test(b.textContent))), 'conflict buttons say what they open');
await page.click('.binding.open [data-act=delBinding]');
await page.click('[data-act=sel][data-ctrl=state]');
ok(/Robot state/.test(await page.textContent('.editor h2')), 'other triggers can be picked too');
await page.screenshot({ path: join(root, 'smoke/ui-main.png') });

// Panels.
await page.click('[data-panel=code]');
ok(/private void configureBindings\(\)/.test(await page.textContent('#java')), 'code panel shows configureBindings()');
await page.keyboard.press('Escape');
ok((await page.$$('.modal')).length === 0, 'Escape closes a panel');

await page.click('[data-panel=share]');
await page.fill('#javaText', container);
await page.click('[data-act=import]');
await page.waitForSelector('.import-result');
ok(/bindings imported/.test(await page.textContent('.import-result')), 'pasting RobotContainer.java imports its bindings');
await page.screenshot({ path: join(root, 'smoke/ui-import.png') });
await page.click('[data-act=closePanel]');
await page.click('[data-panel=code]');
const java = await page.textContent('#java');
ok(/setDefaultCommand/.test(java) && /if \(Robot\.isSimulation\(\)\)/.test(java), 'statements Linkage cannot read are kept in the copied code');
await page.click('[data-act=closePanel]');

await page.click('[data-panel=setup]');
ok((await page.$$('.panel-setup table')).length >= 4, 'setup panel lists commands, triggers, modes, subsystems and controllers');
// Each controller type has its own drawing, and every trigger sits behind its bumper.
const shapes = {};
for (const type of ['ps4', 'ps5', 'xbox']) {
  await page.selectOption('#controllers-driver-type', type);
  await page.click('[data-act=closePanel]');
  await page.click('[data-act=ctrl][data-ctrl=driver]');
  shapes[type] = await page.getAttribute('.pad .body', 'd');
  const t = await (await page.$('g[data-in=lt]')).boundingBox();
  const bm = await (await page.$('g[data-in=lb]')).boundingBox();
  ok(t.y < bm.y && t.y + t.height > bm.y + 4, `${type}: the left trigger tucks behind the bumper`);
  await page.click('[data-panel=setup]');
}
ok(new Set(Object.values(shapes)).size === 3, 'Xbox, PS4 and PS5 have different outlines');
await page.click('[data-act=closePanel]');

await page.click('[data-panel=cheat]');
await page.waitForSelector('.sheet');
ok((await page.$$('.sheet')).length >= 2, 'cheat sheet panel works');
const tb = await page.textContent('.titleblock');
ok(/Driver station controls/.test(tb) && /Ports/.test(tb), 'cheat sheet has a title block');
await page.screenshot({ path: join(root, 'smoke/ui-cheatsheet.png') });

const fonts = await page.evaluate(async () => {
  const faces = [...(await document.fonts.load('600 20px "IBM Plex Sans"')), ...(await document.fonts.load('500 14px "IBM Plex Mono"'))];
  return faces.filter((f) => f.status === 'loaded').map((f) => f.family);
});
ok(fonts.some((f) => /^IBM Plex Sans$/.test(f)) && fonts.some((f) => /Plex Mono/.test(f)), `bundled fonts load offline (${fonts.join(', ')})`);
ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await app.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
