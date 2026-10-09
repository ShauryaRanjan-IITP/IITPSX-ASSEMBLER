const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');

const C89_FLAGS = [
  '-std=c89', '-pedantic', '-W', '-Wall', '-Wpointer-arith',
  '-Wwrite-strings', '-Wstrict-prototypes',
];

const MAX_STREAM_BYTES = 256 * 1024;

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

// Runs an executable with an explicit argument array. No shell, no
// interpolation, bounded output, and a hard timeout that kills the child.
function runProcess(exe, args, { cwd, timeoutMs = 10000 } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(exe, args, { cwd, shell: false, windowsHide: true });
    } catch (error) {
      resolve({ error: error.message });
      return;
    }

    let stdout = '';
    let stderr = '';
    let truncated = false;
    let settled = false;
    let timedOut = false;

    const append = (current, chunk) => {
      if (current.length >= MAX_STREAM_BYTES) {
        truncated = true;
        return current;
      }
      const text = chunk.toString();
      const room = MAX_STREAM_BYTES - current.length;
      if (text.length > room) {
        truncated = true;
        return current + text.slice(0, room);
      }
      return current + text;
    };

    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch { /* ignore */ }
    }, timeoutMs);

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ error: error.message });
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut, truncated });
    });
  });
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function exeName(base) {
  return process.platform === 'win32' ? `${base}.exe` : base;
}

module.exports = { runProcess, exists, sha256, exeName, C89_FLAGS, MAX_STREAM_BYTES };
