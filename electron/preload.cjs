// The page's only way out of its sandbox. Each call is checked again in main.js.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('linkage', {
  desktop: true,
  openProject: () => ipcRenderer.invoke('project:open'),
  rescan: () => ipcRenderer.invoke('project:rescan'),
  lastProject: () => ipcRenderer.invoke('project:last'),
  closeProject: () => ipcRenderer.invoke('project:close'),
  writeFile: (path, text) => ipcRenderer.invoke('project:write', String(path), String(text)),
  saveFile: (filename, data) => ipcRenderer.invoke('file:save', String(filename), String(data)),
  showBackups: () => ipcRenderer.invoke('file:reveal', 'backups'),
  print: () => ipcRenderer.invoke('app:print'),
  onMenu: (fn) => ipcRenderer.on('menu', (_e, action) => fn(String(action))),
});
