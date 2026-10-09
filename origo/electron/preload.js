const { contextBridge, ipcRenderer } = require('electron');

// Narrow, explicit surface exposed to the renderer.
contextBridge.exposeInMainWorld('origo', {
  openFile: () => ipcRenderer.invoke('file:open'),
  openPath: (payload) => ipcRenderer.invoke('file:openPath', payload),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  saveFileAs: (payload) => ipcRenderer.invoke('file:saveAs', payload),
  chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  listWorkspace: (payload) => ipcRenderer.invoke('workspace:list', payload),
  assemble: (payload) => ipcRenderer.invoke('assembler:run', payload),
  runProgram: (payload) => ipcRenderer.invoke('emulator:run', payload),
  stepProgram: (payload) => ipcRenderer.invoke('emulator:step', payload),
  confirmDiscard: () => ipcRenderer.invoke('dialog:confirmDiscard'),
  setDirty: (flag) => ipcRenderer.send('state:dirty', flag === true),
  onMenu: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('menu', handler);
    return () => ipcRenderer.removeListener('menu', handler);
  },
});
