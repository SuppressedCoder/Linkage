// Linkage desktop app: Electron main process.
// The page is the same static app as the web version, served from the app folder over the
// app:// scheme. It runs sandboxed with context isolation. It never reads or writes your robot
// project: you paste RobotContainer.java in and copy the code out. The only files it writes are
// the ones you pick in a Save dialog (the JSON setup or the printable cheat sheet).
import { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, net, protocol, shell } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join, resolve, sep, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
// Everything comes from the app itself: no network, no inline scripts.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

// Tests run with their own data folder.
if (process.env.LINKAGE_USER_DATA) app.setPath('userData', process.env.LINKAGE_USER_DATA);

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let win = null;

ipcMain.handle('file:save', async (_e, filename, data) => {
  if (typeof filename !== 'string' || typeof data !== 'string') throw new Error('Bad file.');
  const r = await dialog.showSaveDialog(win, { defaultPath: filename.replace(/[\\/]/g, '_') });
  if (r.canceled || !r.filePath) return null;
  await writeFile(r.filePath, data, 'utf8');
  return r.filePath;
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
        { label: 'Import RobotContainer.java…', accelerator: 'CmdOrCtrl+O', click: send('openShare') },
        { label: 'Copy code', accelerator: 'CmdOrCtrl+Shift+C', click: send('copyCode') },
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
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0e2744' : '#f4f1e8',
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
