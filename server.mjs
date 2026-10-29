import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const root = resolve(process.env.ROOT || fileURLToPath(new URL('.', import.meta.url)));
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'],
]);
const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed'); return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
  catch { response.writeHead(400).end('Bad request'); return; }
  if (pathname === '/') pathname = '/index.html';
  const target = resolve(root, `.${pathname}`);
  if (!target.startsWith(root + sep) && target !== resolve(root, 'index.html')) {
    response.writeHead(403).end('Forbidden'); return;
  }
  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error('Not a file');
    const body = request.method === 'HEAD' ? null : await readFile(target);
    response.writeHead(200, { 'Content-Type': mime.get(extname(target)) || 'application/octet-stream', 'Content-Length': info.size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => {
  console.log('Chromatic Cacti is running:');
  if (host === '0.0.0.0' || host === '::') {
    console.log(`  Local:   http://127.0.0.1:${port}`);
    for (const list of Object.values(networkInterfaces()))
      for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  Network: http://${a.address}:${port}`);
  } else console.log(`  http://${host}:${port}`);
});
