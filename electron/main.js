// Linkage desktop app: Electron main process.
// The page is the same static app as the web version, served from the app folder over the
// app:// scheme. It runs sandboxed with context isolation; the only way it reaches the disk is
// the small API in preload.cjs, and every handler here checks what it is given.
import { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } from 'electron';
import { readFile, writeFile, readdir, stat, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve, sep, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const SKIP_DIRS = new Set(['.git', '.gradle', 'build', 'bin', 'out', 'node_modules', '.vscode', '.idea', '.wpilib', 'vendordeps', '.linkage']);
const MAX_FILES = 3000;
const MAX_BYTES = 1024 * 1024;
// Everything comes from the app itself: no network, no inline scripts.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
const settingsPath = () => join(app.getPath('userData'), 'settings.json');

// Tests run with their own data folder and a project to open at launch.
if (process.env.LINKAGE_USER_DATA) app.setPath('userData', process.env.LINKAGE_USER_DATA);

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

/** The project the window has open: its root and the files read at the last scan, with their text. */
let project = null;
let win = null;

async function loadSettings() {
  try {
    return JSON.parse(await readFile(settingsPath(), 'utf8'));
  } catch {
    return {};
  }
}
async function saveSettings(patch) {
  const s = { ...(await loadSettings()), ...patch };
  await mkdir(dirname(settingsPath()), { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(s, null, 2));
}

/** All .java files under root (prefers src/ when it exists), skipping build output. */
async function findJava(root) {
  const base = existsSync(join(root, 'src')) ? join(root, 'src') : root;
  const out = [];
  const walk = async (dir) => {
    if (out.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) await walk(p);
      } else if (e.isFile() && e.name.endsWith('.java')) out.push(p);
      if (out.length >= MAX_FILES) return;
    }
  };
  await walk(base);
  return out;
}

async function scan(root) {
  const paths = await findJava(root);
  const files = [];
  const skipped = [];
  for (const p of paths) {
    const rel = relative(root, p).split(sep).join('/');
    const st = await stat(p);
    if (st.size > MAX_BYTES) {
      skipped.push(rel);
      continue;
    }
    files.push({ path: rel, text: await readFile(p, 'utf8') });
  }
  project = { root, files: new Map(files.map((f) => [f.path, f.text])) };
  await saveSettings({ lastProject: root });
  const isRobot = existsSync(join(root, 'build.gradle')) || existsSync(join(root, '.wpilib'));
  return { root, name: root.split(sep).pop(), files, skipped, truncated: paths.length >= MAX_FILES, isRobot };
}

ipcMain.handle('project:open', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Open a robot project folder', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  return scan(r.filePaths[0]);
});
ipcMain.handle('project:rescan', async () => (project ? scan(project.root) : null));
ipcMain.handle('project:last', async () => {
  if (process.env.LINKAGE_OPEN) return scan(resolve(process.env.LINKAGE_OPEN));
  const { lastProject } = await loadSettings();
  return lastProject && existsSync(lastProject) ? scan(lastProject) : null;
});
ipcMain.handle('project:close', async () => {
  project = null;
  await saveSettings({ lastProject: null });
  return true;
});

/**
 * Write one .java file of the open project. Only a file that was read at the last scan, only if it
 * still holds what was read (so edits made in VS Code since are never overwritten), and a backup
 * of the old text goes to the app's data folder first.
 */
ipcMain.handle('project:write', async (_e, rel, text) => {
  if (!project) throw new Error('No project is open.');
  if (typeof rel !== 'string' || typeof text !== 'string' || !rel.endsWith('.java')) throw new Error('Linkage only writes .java files.');
  if (!project.files.has(rel)) throw new Error(`${rel} was not part of the last scan.`);
  const abs = resolve(project.root, rel);
  if (!abs.startsWith(resolve(project.root) + sep)) throw new Error('That path is outside the project.');
  const now = await readFile(abs, 'utf8');
  if (now !== project.files.get(rel)) throw new Error(`${rel.split('/').pop()} changed on disk since the last scan. Rescan, check it, and try again.`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = join(app.getPath('userData'), 'backups', stamp, rel.split('/').join(sep));
  await mkdir(dirname(backup), { recursive: true });
  await copyFile(abs, backup);
  await writeFile(abs, text, 'utf8');
  project.files.set(rel, text);
  return { backup };
});

ipcMain.handle('file:save', async (_e, filename, data) => {
  if (typeof filename !== 'string' || typeof data !== 'string') throw new Error('Bad file.');
  const r = await dialog.showSaveDialog(win, { defaultPath: filename.replace(/[\\/]/g, '_') });
  if (r.canceled || !r.filePath) return null;
  await writeFile(r.filePath, data, 'utf8');
  return r.filePath;
});
ipcMain.handle('file:reveal', async (_e, what) => {
  if (what === 'backups') return shell.openPath(join(app.getPath('userData'), 'backups'));
  return null;
});
ipcMain.handle('app:print', async () => {
  win?.webContents.print({ printBackground: true });
  return true;
});

function menu() {
  const send = (action) => () => win?.webContents.send('menu', action);
  const tpl = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open robot project…', accelerator: 'CmdOrCtrl+O', click: send('openProject') },
        { label: 'Rescan project', accelerator: 'F5', click: send('rescan') },
        { type: 'separator' },
        { label: 'Print cheat sheet…', accelerator: 'CmdOrCtrl+P', click: send('print') },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }])],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 720,
    minHeight: 500,
    title: 'Linkage',
    backgroundColor: '#121418',
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  // Links open in the browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://linkage/')) e.preventDefault();
  });
  win.loadURL('app://linkage/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const url = new URL(req.url);
    const file = resolve(appRoot, '.' + decodeURIComponent(url.pathname));
    const allowed = ['index.html', 'styles.css', 'src', 'assets'].some((p) => file === join(appRoot, p) || file.startsWith(join(appRoot, p) + sep));
    if (url.host !== 'linkage' || !allowed) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString()).then((res) => {
      const headers = new Headers(res.headers);
      headers.set('Content-Security-Policy', CSP);
      return new Response(res.body, { status: res.status, headers });
    });
  });
  menu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
