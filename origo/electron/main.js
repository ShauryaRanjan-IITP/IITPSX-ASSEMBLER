const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('node:path');
const { registerIpc } = require('./ipc');
const { disposeArtifacts } = require('./assembler');

const DEV_URL = process.env.ORIGO_DEV_URL;

let mainWindow = null;
let ipc = null;

function createWindow() {
  const windowIcon = app.isPackaged ? undefined : path.join(__dirname, '..', 'build', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#0b0b0d',
    title: 'Origo',
    icon: windowIcon,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (DEV_URL) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('close', (event) => {
    if (!ipc || !ipc.isDirty()) return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Discard changes and quit', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved changes',
      message: 'This file has unsaved changes.',
      detail: 'Quit anyway and discard them?',
    });
    if (choice !== 0) event.preventDefault();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function sendToRenderer(action) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu', action);
  }
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New File', accelerator: 'CmdOrCtrl+N', click: () => sendToRenderer('menu:new') },
        { label: 'Open File…', accelerator: 'CmdOrCtrl+O', click: () => sendToRenderer('menu:open') },
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+K', click: () => sendToRenderer('menu:openFolder') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendToRenderer('menu:save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendToRenderer('menu:saveAs') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => sendToRenderer('menu:undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Y', click: () => sendToRenderer('menu:redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Theme', accelerator: 'CmdOrCtrl+Alt+T', click: () => sendToRenderer('menu:toggleTheme') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Run',
      submenu: [
        { label: 'Assemble', accelerator: 'CmdOrCtrl+B', click: () => sendToRenderer('menu:assemble') },
        { label: 'Run', accelerator: 'F5', click: () => sendToRenderer('menu:run') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Origo',
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'About Origo',
            message: 'Origo',
            detail: 'IITPSx assembly workspace.\nEdit, assemble, and run IITPSx programs.',
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  ipc = registerIpc({ getWindow: () => mainWindow });
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  disposeArtifacts();
});
