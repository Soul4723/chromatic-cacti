// Runs before `npm start`: on the first run, fetch the game's one library (Three.js).
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(resolve(root, 'node_modules/three/build/three.module.js'))) {
  console.log('First run: getting the game ready. This takes a minute and only happens once...');
  const args = ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'];
  const npm = process.env.npm_execpath;
  const result = npm
    ? spawnSync(process.execPath, [npm, ...args], { cwd: root, stdio: 'inherit' })
    : spawnSync('npm', args, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error('\nCould not download the game files. Check your internet connection and run `npm start` again.');
    process.exit(1);
  }
}
