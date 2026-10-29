import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'index.html');
const cssPath = resolve(root, 'styles.css');
const appPath = resolve(root, 'src/app.js');
const outputPath = resolve(root, 'dist/index.html');

const [html, css, threeLicense] = await Promise.all([
  readFile(sourcePath, 'utf8'),
  readFile(cssPath, 'utf8'),
  readFile(resolve(root, 'node_modules/three/LICENSE'), 'utf8'),
]);
const bundle = await build({
  entryPoints: [appPath],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  legalComments: 'none',
  banner: { js: `/* Bundled Three.js license:\n${threeLicense.trim()}\n*/` },
});
if (bundle.outputFiles.length !== 1) throw new Error('Expected one bundled JavaScript output.');

const cssAnchor = '<link rel="stylesheet" href="/styles.css">';
const scriptAnchor = '<script type="module" src="/src/app.js"></script>';
if (html.split(cssAnchor).length !== 2) throw new Error(`Expected exactly one source CSS anchor: ${cssAnchor}`);
if (html.split(scriptAnchor).length !== 2) throw new Error(`Expected exactly one source app anchor: ${scriptAnchor}`);

const safeScript = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const standalone = html.replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace(cssAnchor, `<style>\n${css}\n</style>`)
  .replace(scriptAnchor, `<script>\n${safeScript}\n</script>`);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, standalone);
console.log(`Built ${outputPath.slice(root.length + 1)} (${Buffer.byteLength(standalone)} bytes)`);
