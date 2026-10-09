const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { runProcess, exists, sha256, exeName, C89_FLAGS } = require('./proc');

const RUN_TIMEOUT_MS = 10000;
const MAX_LISTING_BYTES = 200 * 1024;

let cachedAssembler = null;
let artifact = null; // { path, revision, sourceName }

function projectRoot() {
  return path.resolve(__dirname, '..', '..');
}

function artifactDir() {
  return path.join(app.getPath('temp'), 'origo-run');
}

function artifactPath() {
  return path.join(artifactDir(), 'current.o');
}

async function buildAssembler() {
  const root = projectRoot();
  const source = path.join(root, 'asm.c');
  if (!(await exists(source))) {
    return { error: `Assembler not found and asm.c is missing at ${source}.` };
  }
  const outDir = path.join(app.getPath('temp'), 'origo-build');
  await fs.mkdir(outDir, { recursive: true });
  const out = path.join(outDir, process.platform === 'win32' ? 'asm.exe' : 'asm');
  const compiler = process.env.CC || (process.platform === 'win32' ? 'gcc' : 'cc');
  const result = await runProcess(compiler, [...C89_FLAGS, source, '-o', out], {
    cwd: root,
    timeoutMs: 60000,
  });
  if (result.error) {
    return { error: `Could not build the assembler with '${compiler}': ${result.error}` };
  }
  if (result.timedOut) {
    return { error: `Building the assembler with '${compiler}' timed out.` };
  }
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout || '').trim().split('\n').slice(-3).join('\n');
    return { error: `Could not build the assembler (compiler exit ${result.code}).${detail ? `\n${detail}` : ''}` };
  }
  return { path: out, built: true };
}

async function resolveAssembler() {
  if (cachedAssembler) return cachedAssembler;

  const override = process.env.ORIGO_ASM_PATH;
  if (override) {
    if (await exists(override)) {
      cachedAssembler = { path: override, built: false };
      return cachedAssembler;
    }
    return { error: `ORIGO_ASM_PATH is set but not found: ${override}` };
  }

  const name = exeName('asm');

  // Packaged app: the binary is shipped in resources/bin (outside app.asar).
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, 'bin', name);
    if (await exists(bundled)) {
      cachedAssembler = { path: bundled, built: false };
      return cachedAssembler;
    }
    return { error: `The bundled assembler was not found at ${bundled}. The installation may be incomplete.` };
  }

  // Development: use the repository-root binary, else build from asm.c.
  const root = projectRoot();
  for (const candidate of [path.join(root, name), path.join(root, 'asm'), path.join(root, 'asm.exe')]) {
    if (await exists(candidate)) {
      cachedAssembler = { path: candidate, built: false };
      return cachedAssembler;
    }
  }

  const built = await buildAssembler();
  if (!built.error) cachedAssembler = built;
  return built;
}

// Only the base name of a user-selected file is used, and only to name the
// staged temporary source. The user's path is never written to or trusted.
function safeBaseName(filePath) {
  const fallback = 'program';
  if (typeof filePath !== 'string' || filePath.length === 0) return fallback;
  let base = path.basename(filePath).replace(/\.[^.]*$/, '');
  base = base.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40);
  return base.length > 0 ? base : fallback;
}

function clearArtifact() {
  artifact = null;
  return fs.rm(artifactPath(), { force: true }).catch(() => { /* ignore */ });
}

function disposeArtifacts() {
  artifact = null;
  try {
    fsSync.rmSync(artifactDir(), { recursive: true, force: true });
  } catch { /* best effort */ }
}

function getArtifact() {
  return artifact ? { ...artifact } : null;
}

async function assemble({ source, filePath }) {
  const resolved = await resolveAssembler();
  if (resolved.error) {
    await clearArtifact();
    return { ok: false, appError: resolved.error };
  }
  const exe = resolved.path;

  const workspace = await fs.mkdtemp(path.join(app.getPath('temp'), 'origo-asm-'));
  const base = safeBaseName(filePath);
  const sourcePath = path.join(workspace, `${base}.asm`);
  const objectPath = path.join(workspace, `${base}.o`);
  const listingPath = path.join(workspace, `${base}.lst`);

  try {
    await fs.writeFile(sourcePath, source, 'utf8');
    const result = await runProcess(exe, [sourcePath], { cwd: workspace, timeoutMs: RUN_TIMEOUT_MS });

    if (result.error) {
      await clearArtifact();
      return { ok: false, appError: `Could not run the assembler: ${result.error}`, assembler: exe };
    }

    let object = null;
    try {
      const stat = await fs.stat(objectPath);
      object = {
        name: path.basename(objectPath),
        size: stat.size,
        words: stat.size % 4 === 0 ? stat.size / 4 : null,
      };
    } catch { /* object not produced */ }

    let listing = null;
    try {
      const text = await fs.readFile(listingPath, 'utf8');
      listing = {
        name: path.basename(listingPath),
        length: text.length,
        truncated: text.length > MAX_LISTING_BYTES,
        content: text.slice(0, MAX_LISTING_BYTES),
      };
    } catch { /* listing not produced */ }

    const success = result.code === 0 && !result.timedOut;
    let runnable = false;
    let retentionError = null;

    if (success && object) {
      try {
        await fs.mkdir(artifactDir(), { recursive: true });
        await fs.copyFile(objectPath, artifactPath());
        artifact = { path: artifactPath(), revision: sha256(source), sourceName: `${base}.asm` };
        runnable = true;
      } catch (error) {
        await clearArtifact();
        retentionError = `Assembly succeeded, but the object file could not be kept for Run: ${error.message}`;
      }
    } else {
      await clearArtifact();
    }

    return {
      ok: success,
      exitCode: typeof result.code === 'number' ? result.code : null,
      signal: result.signal || null,
      timedOut: !!result.timedOut,
      truncated: !!result.truncated,
      stdout: result.stdout,
      stderr: result.stderr,
      assembler: exe,
      builtFromSource: resolved.built === true,
      sourceName: `${base}.asm`,
      object,
      listing,
      runnable,
      retentionError,
    };
  } catch (error) {
    await clearArtifact();
    return { ok: false, appError: `Assembly failed: ${error.message}` };
  } finally {
    try {
      await fs.rm(workspace, { recursive: true, force: true });
    } catch { /* best-effort cleanup */ }
  }
}

module.exports = { assemble, getArtifact, clearArtifact, disposeArtifacts, projectRoot };
