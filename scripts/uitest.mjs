// Drives the real Electron app with Playwright on a copy of the test robot project.
// Checks the project scan, cross-file warnings, editing, the write-back diff, the write itself,
// the backup, and that a file changed on disk is never overwritten. Screenshots go to smoke/.
import { _electron as electron } from 'playwright';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'linkage-ui-'));
const project = join(work, 'robot');
cpSync(join(root, 'test/fixtures/robot'), project, { recursive: true });
writeFileSync(join(project, 'build.gradle'), '// test project\n');
const userData = join(work, 'data');
const containerPath = join(project, 'src/main/java/frc/robot/RobotContainer.java');
mkdirSync(join(root, 'smoke'), { recursive: true });

let failed = 0;
const ok = (cond, what) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failed++;
};

const app = await electron.launch({
  args: [root, ...(process.env.CI ? ['--no-sandbox'] : [])],
  env: { ...process.env, LINKAGE_USER_DATA: userData, LINKAGE_OPEN: project },
});
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.setViewportSize({ width: 1400, height: 900 });
await page.waitForSelector('.proj-head', { timeout: 15000 });

const figs = await page.$$eval('.figs b', (els) => els.map((e) => e.textContent));
ok(figs[0] === '5' && figs[2] === '7', `project figures: ${figs.join(', ')} (5 files, 7 bindings)`);
const checks = await page.textContent('.project');
ok(/bound twice/.test(checks), 'cross-file double binding is reported');
ok(/DriverControls\.java:13/.test(checks), 'findings point at file and line');
ok(/Intake\.java binds 1 trigger itself/.test(checks), 'binding inside a subsystem is flagged');
ok(await page.isVisible('#projbar >> text=Matches the file'), 'project bar says the editor matches the file');
await page.screenshot({ path: join(root, 'smoke/ui-project.png'), fullPage: true });

await page.click('[data-act=pfilter][data-f=outside]');
ok((await page.$$('.project section:last-child tbody tr')).length === 3, 'filter: 3 bindings outside RobotContainer');

await page.click('[data-tab=bindings]');
await page.waitForSelector('.pad');
ok((await page.$$('g.in.ext')).length >= 1, 'inputs bound in other files are marked on the picture');
ok(/in DriverControls\.java:12/.test(await page.textContent('.pads')), 'legend names the other file');

await page.click('g[data-ctrl="operator"][data-in="east"]');
await page.click('[data-act=addBinding]');
const cmdValue = await page.$eval('select[data-k=cmd] option:nth-child(2)', (o) => o.value);
await page.selectOption('select[data-k=cmd]', cmdValue);
ok(await page.isVisible('#projbar >> text=Changes not written'), 'editing marks the file as not written');
await page.screenshot({ path: join(root, 'smoke/ui-bindings.png') });

await page.click('[data-act=writeFile]');
await page.waitForSelector('.modal pre.diff');
const diff = await page.textContent('.modal pre.diff');
ok(/\+ +operator\.b\(\)/.test(diff), 'diff shows the new binding');
await page.screenshot({ path: join(root, 'smoke/ui-diff.png') });
await page.click('[data-act=confirmWrite]');
await page.waitForSelector('#projbar >> text=Matches the file', { timeout: 5000 });
const written = readFileSync(containerPath, 'utf8');
ok(/operator\.b\(\)\.(whileTrue|onTrue)\(/.test(written), 'the file on disk has the new binding');
ok(/setDefaultCommand/.test(written) && /if \(Robot\.isSimulation\(\)\)/.test(written), 'statements Linkage cannot read are kept');
ok(readdirSync(join(userData, 'backups')).length === 1, 'a backup was made');

// A file edited elsewhere after the scan is never overwritten.
await page.click('g[data-ctrl="operator"][data-in="north"]');
await page.click('[data-act=addBinding]');
await page.selectOption('select[data-k=cmd] >> nth=-1', cmdValue);
writeFileSync(containerPath, written + '\n// edited in VS Code\n');
await page.click('[data-act=writeFile]');
await page.click('[data-act=confirmWrite]');
await page.waitForSelector('#toast:not([hidden])');
ok(/changed on disk/.test(await page.textContent('#toast')), 'refuses to overwrite a file changed on disk');
ok(readFileSync(containerPath, 'utf8').endsWith('// edited in VS Code\n'), 'the edited file is untouched');

await page.click('[data-tab=code]');
ok(/private void configureBindings\(\)/.test(await page.textContent('#java')), 'code view works');
await page.click('[data-tab=cheatsheet]');
await page.waitForSelector('.sheet');
ok((await page.$$('.sheet')).length >= 2, 'cheat sheet works');
await page.screenshot({ path: join(root, 'smoke/ui-cheatsheet.png'), fullPage: true });

ok(await page.evaluate(() => document.fonts.check('700 20px "Barlow Condensed"')), 'bundled fonts load offline');
ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await app.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
