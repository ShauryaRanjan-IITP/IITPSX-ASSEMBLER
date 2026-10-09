// electron-builder afterPack hook.
//
// The normal executable-editing path (signAndEditExecutable: true) downloads
// the `winCodeSign` vendor archive, which cannot be extracted on machines
// without the symlink privilege (it contains darwin .dylib symlinks). This hook
// applies the Origo icon and version metadata to the packaged executable with
// the vendored rcedit tool instead, so the icon is embedded deterministically.
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const appInfo = context.packager.appInfo;
  const exe = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);
  const icon = path.join(__dirname, 'icon.ico');
  const tool = path.join(__dirname, 'tools', process.arch === 'ia32' ? 'rcedit-ia32.exe' : 'rcedit-x64.exe');

  if (!fs.existsSync(exe) || !fs.existsSync(icon) || !fs.existsSync(tool)) {
    console.warn('[after-pack] skipped (missing exe/icon/rcedit)');
    return;
  }

  const version = appInfo.version || '0.1.0';
  const productName = appInfo.productName || 'Origo';
  execFileSync(tool, [
    exe,
    '--set-icon', icon,
    '--set-version-string', 'ProductName', productName,
    '--set-version-string', 'FileDescription', productName,
    '--set-version-string', 'CompanyName', 'Origo',
    '--set-file-version', version,
    '--set-product-version', version,
  ], { stdio: 'inherit' });
  console.log(`[after-pack] applied icon and metadata to ${path.basename(exe)}`);
}

module.exports = afterPack;
module.exports.default = afterPack;
