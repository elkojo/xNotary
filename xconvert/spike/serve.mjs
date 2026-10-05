// Static server for the spike, sending the CSP planned for /xconvert/* in _headers:
// the /xsignature/* policy minus `connect-src https:`, plus 'wasm-unsafe-eval'.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('./', import.meta.url).pathname;
const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; " +
  "frame-ancestors 'none'; base-uri 'self'; form-action 'none'; object-src 'none'";
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.gz': 'application/gzip',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.docx': 'application/octet-stream', '.md': 'text/markdown',
};
const port = Number(process.argv[2] ?? 4180);

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '');
  // Fixtures live beside public/, the rest under it.
  const file = path.startsWith('fixtures/') ? join(ROOT, path) : join(ROOT, 'public', path || 'index.html');
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Content-Security-Policy': CSP,
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Security-Policy': CSP }).end('not found');
  }
}).listen(port, () => console.log(`spike on http://localhost:${port}`));
