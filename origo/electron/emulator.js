const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { runProcess, exists, exeName, C89_FLAGS } = require('./proc');

const RUN_TIMEOUT_MS = 10000;

let cachedEmulator = null;

function projectRoot() {
  return path.resolve(__dirname, '..', '..');
}

async function buildEmulator() {
  const root = projectRoot();
  const source = path.join(root, 'emu.c');
  if (!(await exists(source))) {
    return { error: `Emulator not found and emu.c is missing at ${source}.` };
  }
  const outDir = path.join(app.getPath('temp'), 'origo-build');
  await fs.mkdir(outDir, { recursive: true });
  const out = path.join(outDir, process.platform === 'win32' ? 'emu.exe' : 'emu');
  const compiler = process.env.CC || (process.platform === 'win32' ? 'gcc' : 'cc');
  const result = await runProcess(compiler, [...C89_FLAGS, source, '-o', out], {
    cwd: root,
    timeoutMs: 60000,
  });
  if (result.error) {
    return { error: `Could not build the emulator with '${compiler}': ${result.error}` };
  }
  if (result.timedOut) {
    return { error: `Building the emulator with '${compiler}' timed out.` };
  }
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout || '').trim().split('\n').slice(-3).join('\n');
    return { error: `Could not build the emulator (compiler exit ${result.code}).${detail ? `\n${detail}` : ''}` };
  }
  return { path: out, built: true };
}

async function resolveEmulator() {
  if (cachedEmulator) return cachedEmulator;

  const override = process.env.ORIGO_EMU_PATH;
  if (override) {
    if (await exists(override)) {
      cachedEmulator = { path: override, built: false };
      return cachedEmulator;
    }
    return { error: `ORIGO_EMU_PATH is set but not found: ${override}` };
  }

  const name = exeName('emu');

  // Packaged app: the binary is shipped in resources/bin (outside app.asar).
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, 'bin', name);
    if (await exists(bundled)) {
      cachedEmulator = { path: bundled, built: false };
      return cachedEmulator;
    }
    return { error: `The bundled emulator was not found at ${bundled}. The installation may be incomplete.` };
  }

  // Development: use the repository-root binary, else build from emu.c.
  const root = projectRoot();
  for (const candidate of [path.join(root, name), path.join(root, 'emu'), path.join(root, 'emu.exe')]) {
    if (await exists(candidate)) {
      cachedEmulator = { path: candidate, built: false };
      return cachedEmulator;
    }
  }

  const built = await buildEmulator();
  if (!built.error) cachedEmulator = built;
  return built;
}

// The emulator prints its memory image as "ADDR VALUE" hex rows on HALT (or
// when a step limit is reached). We extract only lines matching that exact,
// documented format; nothing is inferred or fabricated.
function parseMemoryDump(text) {
  const rows = [];
  const pattern = /^([0-9A-Fa-f]{8}) ([0-9A-Fa-f]{8})\s*$/;
  for (const line of String(text).split(/\r?\n/)) {
    const match = pattern.exec(line);
    if (match) {
      rows.push({ address: match[1].toUpperCase(), value: match[2].toUpperCase() });
      if (rows.length >= 10000) break;
    }
  }
  return rows;
}

// The emulator prints "Loaded N words" once per run.
function parseLoadedWords(text) {
  const match = /^Loaded (\d+) words\b/m.exec(String(text));
  return match ? Number(match[1]) : null;
}

// The emulator prints "STATUS HALTED|STEPPED|ERROR" when run with -n.
function parseStatus(text) {
  const match = /^STATUS (HALTED|STEPPED|ERROR)\s*$/m.exec(String(text));
  return match ? match[1] : null;
}

// The emulator prints "REG A=.. B=.. PC=.. SP=.." when invoked with -r.
function parseRegisters(text) {
  const pattern = /^REG A=([0-9A-Fa-f]{8}) B=([0-9A-Fa-f]{8}) PC=([0-9A-Fa-f]{8}) SP=([0-9A-Fa-f]{8})\s*$/m;
  const match = pattern.exec(String(text));
  if (!match) return null;
  return {
    A: match[1].toUpperCase(),
    B: match[2].toUpperCase(),
    PC: match[3].toUpperCase(),
    SP: match[4].toUpperCase(),
  };
}

// Runs the emulator on a managed object file. The caller supplies the object
// path (owned by the assembler module), never the renderer. When `steps` is a
// positive integer the emulator stops after that many instructions
// (single-step); otherwise it runs to completion.
async function runEmulator({ artifactPath, steps = null }) {
  const resolved = await resolveEmulator();
  if (resolved.error) {
    return { ok: false, appError: resolved.error };
  }
  const exe = resolved.path;
  const args = Number.isInteger(steps) && steps > 0
    ? ['-r', '-n', String(steps), artifactPath]
    : ['-r', artifactPath];
  const result = await runProcess(exe, args, {
    cwd: path.dirname(artifactPath),
    timeoutMs: RUN_TIMEOUT_MS,
  });

  if (result.error) {
    return { ok: false, appError: `Could not run the emulator: ${result.error}`, emulator: exe };
  }

  return {
    ok: result.code === 0 && !result.timedOut,
    exitCode: typeof result.code === 'number' ? result.code : null,
    signal: result.signal || null,
    timedOut: !!result.timedOut,
    truncated: !!result.truncated,
    stdout: result.stdout,
    stderr: result.stderr,
    memory: parseMemoryDump(result.stdout),
    registers: parseRegisters(result.stdout),
    loadedWords: parseLoadedWords(result.stdout),
    status: parseStatus(result.stdout),
    emulator: exe,
    builtFromSource: resolved.built === true,
  };
}

module.exports = { runEmulator, resolveEmulator };
