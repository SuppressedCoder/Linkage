// The page's only way out of its sandbox. Each call is checked again in main.js.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('linkage', {
  desktop: true,
  saveFile: (filename, data) => ipcRenderer.invoke('file:save', String(filename), String(data)),
  print: () => ipcRenderer.invoke('app:print'),
  onMenu: (fn) => ipcRenderer.on('menu', (_e, action) => fn(String(action))),
});
