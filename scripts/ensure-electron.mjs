// Makes sure the Electron binary is present. `npm install` sometimes skips or
// fails Electron's own download step (proxies, --ignore-scripts, interrupted
// installs), and the app then fails to start with "Error: Electron uninstall".
// Runs on postinstall and before start and dist.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let electronDir;
try {
  electronDir = dirname(require.resolve('electron/package.json'));
} catch {
  console.error('[linkage] electron is not installed. Run `npm install` first.');
  process.exit(1);
}

function binaryPresent() {
  const pathTxt = join(electronDir, 'path.txt');
  if (!existsSync(pathTxt)) return false;
  const rel = readFileSync(pathTxt, 'utf8').trim();
  return existsSync(join(electronDir, 'dist', rel));
}

if (binaryPresent()) process.exit(0);

console.log('[linkage] Electron binary missing — downloading it now (this is the step `npm install` skipped)...');
const r = spawnSync(process.execPath, [join(electronDir, 'install.js')], { stdio: 'inherit', cwd: electronDir });
if (r.status !== 0 || !binaryPresent()) {
  console.error(
    '\n[linkage] Electron download failed. Try:\n' +
      '  1. Run it again (flaky network).\n' +
      '  2. Behind a proxy/firewall: set a mirror, then rerun:\n' +
      '       PowerShell: $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"\n' +
      '       bash:       export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/\n' +
      '     then: node node_modules/electron/install.js\n' +
      '  3. Or reinstall just Electron: npm install electron --force\n',
  );
  process.exit(1);
}
console.log('[linkage] Electron is ready.');
