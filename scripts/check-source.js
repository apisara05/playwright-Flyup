import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : file.endsWith('.js') ? [file] : [];
  });
}
for (const file of ['playwright.config.js', ...walk('tests'), ...walk('scripts')]) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('JavaScript syntax checks passed.');
