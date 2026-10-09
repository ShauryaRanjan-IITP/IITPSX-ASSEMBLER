const { dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { assemble, getArtifact } = require('./assembler');
const { runEmulator } = require('./emulator');
const { sha256 } = require('./proc');

const MAX_SOURCE_CHARS = 2000000;

// Registers the narrowly scoped file/dialog/assemble/run IPC used by the
// renderer. Returns a small handle so the main process can query document state.
function registerIpc({ getWindow }) {
  let documentDirty = false;
  let assemblyInFlight = false;
  let emulatorInFlight = false;
  let workspaceRoot = null;

  const busy = () => assemblyInFlight || emulatorInFlight;

  // True when `target` resolves (through symlinks) to a path inside the
  // chosen workspace root.
  async function insideWorkspace(target) {
    if (!workspaceRoot) return false;
    try {
      const realRoot = await fs.realpath(workspaceRoot);
      const realTarget = await fs.realpath(target);
      const rel = path.relative(realRoot, realTarget);
      return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    } catch {
      return false;
    }
  }

  ipcMain.handle('file:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getWindow(), {
      title: 'Open assembly file',
      properties: ['openFile'],
      filters: [
        { name: 'IITPSx assembly', extensions: ['asm'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (canceled || filePaths.length === 0) return { canceled: true };
    const filePath = filePaths[0];
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return { canceled: false, filePath, fileName: path.basename(filePath), content };
    } catch (error) {
      return { canceled: false, error: `Could not read the file: ${error.message}` };
    }
  });

  ipcMain.handle('file:save', async (_event, payload) => {
    if (!payload || typeof payload.filePath !== 'string' || typeof payload.content !== 'string') {
      return { error: 'Invalid save request.' };
    }
    if (!path.isAbsolute(payload.filePath)) {
      return { error: 'Invalid file path.' };
    }
    try {
      await fs.writeFile(payload.filePath, payload.content, 'utf8');
      return { saved: true, filePath: payload.filePath, fileName: path.basename(payload.filePath) };
    } catch (error) {
      return { error: `Could not save the file: ${error.message}` };
    }
  });

  ipcMain.handle('file:saveAs', async (_event, payload) => {
    if (!payload || typeof payload.content !== 'string') {
      return { error: 'Invalid save request.' };
    }
    const suggested = typeof payload.suggestedName === 'string' ? payload.suggestedName : 'untitled.asm';
    const { canceled, filePath } = await dialog.showSaveDialog(getWindow(), {
      title: 'Save assembly file',
      defaultPath: suggested,
      filters: [
        { name: 'IITPSx assembly', extensions: ['asm'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (canceled || !filePath) return { canceled: true };
    try {
      await fs.writeFile(filePath, payload.content, 'utf8');
      return { saved: true, filePath, fileName: path.basename(filePath) };
    } catch (error) {
      return { error: `Could not save the file: ${error.message}` };
    }
  });

  ipcMain.handle('dialog:confirmDiscard', async () => {
    const { response } = await dialog.showMessageBox(getWindow(), {
      type: 'warning',
      buttons: ['Discard changes', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved changes',
      message: 'This file has unsaved changes.',
      detail: 'Discard them and continue?',
    });
    return response === 0;
  });

  ipcMain.on('state:dirty', (_event, value) => {
    documentDirty = value === true;
  });

  ipcMain.handle('workspace:choose', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getWindow(), {
      title: 'Open folder',
      properties: ['openDirectory'],
    });
    if (canceled || filePaths.length === 0) return { canceled: true };
    workspaceRoot = filePaths[0];
    return { canceled: false, rootPath: workspaceRoot, name: path.basename(workspaceRoot) || workspaceRoot };
  });

  ipcMain.handle('workspace:list', async (_event, payload) => {
    if (!payload || typeof payload.dir !== 'string') return { error: 'Invalid directory request.' };
    if (!(await insideWorkspace(payload.dir))) return { error: 'Path is outside the workspace folder.' };
    try {
      const dirents = await fs.readdir(path.resolve(payload.dir), { withFileTypes: true });
      const entries = dirents
        .filter((d) => !d.name.startsWith('.'))
        .map((d) => ({ name: d.name, path: path.join(path.resolve(payload.dir), d.name), isDirectory: d.isDirectory() }))
        .sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1))
        .slice(0, 1000);
      return { entries };
    } catch (error) {
      return { error: `Could not read the folder: ${error.message}` };
    }
  });

  ipcMain.handle('file:openPath', async (_event, payload) => {
    if (!payload || typeof payload.filePath !== 'string') return { error: 'Invalid file request.' };
    if (!(await insideWorkspace(payload.filePath))) return { error: 'Path is outside the workspace folder.' };
    try {
      const resolved = path.resolve(payload.filePath);
      const content = await fs.readFile(resolved, 'utf8');
      return { filePath: resolved, fileName: path.basename(resolved), content };
    } catch (error) {
      return { error: `Could not read the file: ${error.message}` };
    }
  });

  ipcMain.handle('assembler:run', async (_event, payload) => {
    if (!payload || typeof payload.source !== 'string') {
      return { ok: false, appError: 'Invalid assembly request.' };
    }
    if (payload.source.length > MAX_SOURCE_CHARS) {
      return { ok: false, appError: `Source is too large to assemble (limit ${MAX_SOURCE_CHARS} characters).` };
    }
    if (payload.filePath != null && typeof payload.filePath !== 'string') {
      return { ok: false, appError: 'Invalid file path in request.' };
    }
    if (busy()) {
      return { ok: false, appError: 'Another operation is already in progress.' };
    }
    assemblyInFlight = true;
    try {
      return await assemble({ source: payload.source, filePath: payload.filePath });
    } finally {
      assemblyInFlight = false;
    }
  });

  ipcMain.handle('emulator:run', async (_event, payload) => {
    if (!payload || typeof payload.source !== 'string') {
      return { ok: false, appError: 'Invalid run request.' };
    }
    if (payload.source.length > MAX_SOURCE_CHARS) {
      return { ok: false, appError: 'Source is too large to run.' };
    }
    if (busy()) {
      return { ok: false, appError: 'Another operation is already in progress.' };
    }

    const current = getArtifact();
    if (!current) {
      return { ok: false, appError: 'No current successful assembly. Assemble the source before running.' };
    }
    if (sha256(payload.source) !== current.revision) {
      return { ok: false, appError: 'The source has changed since the last successful assembly. Assemble again before running.' };
    }

    emulatorInFlight = true;
    try {
      return await runEmulator({ artifactPath: current.path });
    } finally {
      emulatorInFlight = false;
    }
  });

  ipcMain.handle('emulator:step', async (_event, payload) => {
    if (!payload || typeof payload.source !== 'string') {
      return { ok: false, appError: 'Invalid step request.' };
    }
    if (payload.source.length > MAX_SOURCE_CHARS) {
      return { ok: false, appError: 'Source is too large to step.' };
    }
    if (busy()) {
      return { ok: false, appError: 'Another operation is already in progress.' };
    }
    const steps = Number.isInteger(payload.steps) && payload.steps > 0 ? payload.steps : 1;

    const current = getArtifact();
    if (!current) {
      return { ok: false, appError: 'No current successful assembly. Assemble the source before stepping.' };
    }
    if (sha256(payload.source) !== current.revision) {
      return { ok: false, appError: 'The source has changed since the last successful assembly. Assemble again before stepping.' };
    }

    emulatorInFlight = true;
    try {
      return await runEmulator({ artifactPath: current.path, steps });
    } finally {
      emulatorInFlight = false;
    }
  });

  return { isDirty: () => documentDirty };
}

module.exports = { registerIpc };
