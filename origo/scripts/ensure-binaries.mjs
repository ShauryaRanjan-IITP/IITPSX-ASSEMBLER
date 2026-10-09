// Ensures the C assembler and emulator executables exist and stages them for
// packaging. Fails loudly if they cannot be found or built.
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const outDir = path.resolve(import.meta.dirname, '..', 'resources', 'bin');
const ext = process.platform === 'win32' ? '.exe' : '';
const C89_FLAGS = [
  '-std=c89', '-pedantic', '-W', '-Wall', '-Wpointer-arith',
  '-Wwrite-strings', '-Wstrict-prototypes',
];

async function exists(target) {
  try { await fs.access(target); return true; } catch { return false; }
}

await fs.mkdir(outDir, { recursive: true });

for (const tool of ['asm', 'emu']) {
  const source = path.join(repoRoot, `${tool}.c`);
  const prebuilt = path.join(repoRoot, `${tool}${ext}`);
  const out = path.join(outDir, `${tool}${ext}`);

  if (!(await exists(source))) {
    console.error(`ERROR: ${source} not found; cannot produce ${tool}${ext}.`);
    process.exit(1);
  }

  if (await exists(prebuilt)) {
    await fs.copyFile(prebuilt, out);
    console.log(`bundled ${tool}${ext} <- ${prebuilt}`);
    continue;
  }

  const compiler = process.env.CC || (process.platform === 'win32' ? 'gcc' : 'cc');
  console.log(`building ${tool}${ext} from ${tool}.c with ${compiler}…`);
  const result = spawnSync(compiler, [...C89_FLAGS, source, '-o', out], { stdio: 'inherit' });
  if (result.error) {
    console.error(`ERROR: could not run '${compiler}' to build ${tool}.c: ${result.error.message}`);
    console.error(`Install a C compiler or place a prebuilt ${tool}${ext} at ${prebuilt}.`);
    process.exit(1);
  }
  if (result.status !== 0 || !(await exists(out))) {
    console.error(`ERROR: building ${tool}${ext} failed (compiler exit ${result.status}).`);
    process.exit(1);
  }
}

console.log(`binaries staged in ${outDir}`);
