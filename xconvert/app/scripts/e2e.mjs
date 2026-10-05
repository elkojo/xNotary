// End-to-end: the built site, the real CSP, real pandoc, in headless Chrome.
//
//   npm run build:only            # in ../../app, after `npm run vendor` here
//   node scripts/e2e.mjs          # serves app/dist itself, with dist/_headers applied
//
// pandoc cannot run under Node 18 (it needs WebAssembly exception handling), so this is
// where it is tested. It makes no network request beyond localhost. If veraPDF is on PATH,
// or VERAPDF points at it, every PDF produced is validated as PDF/A-2b.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { WebSocket } from 'ws';

const APP = new URL('..', import.meta.url).pathname;
const DIST = new URL('../../../app/dist/', import.meta.url).pathname;
const CHROME = process.env.CHROME ?? '/usr/bin/google-chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(join(DIST, 'xconvert/vendor/pandoc.wasm.gz'))) {
  console.error('app/dist/xconvert has no converters: run `npm run vendor` here, then `npm run build:only` in app/.');
  process.exit(2);
}

// --- A static server that sends the headers dist/_headers gives each path ----------------
function headerRules() {
  const rules = [];
  let current = null;
  for (const line of readFileSync(join(DIST, '_headers'), 'utf8').split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) rules.push((current = { pattern: line.trim(), set: {}, detach: [] }));
    else if (line.trim().startsWith('!')) current.detach.push(line.trim().slice(1).trim().toLowerCase());
    else {
      const i = line.indexOf(':');
      current.set[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  return rules;
}
const RULES = headerRules();
const matches = (pattern, path) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(path);
function headersFor(path) {
  const out = {};
  for (const rule of RULES.filter((r) => matches(r.pattern, path))) {
    for (const name of rule.detach) delete out[name];
    Object.assign(out, rule.set); // as Cloudflare does: every matching rule, merged
  }
  return out;
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.gz': 'application/gzip', '.svg': 'image/svg+xml', '.otf': 'font/otf', '.ttf': 'font/ttf' };
const server = createServer((req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  let file = join(DIST, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return res.writeHead(404).end();
  const body = readFileSync(file);
  res.writeHead(200, { ...headersFor(path), 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-length': body.length });
  res.end(body);
}).listen(0);
await new Promise((r) => server.once('listening', r));
const BASE = `http://localhost:${server.address().port}/xconvert/`;

// --- Chrome over CDP -----------------------------------------------------------------------
const downloads = mkdtempSync(join(tmpdir(), 'xconvert-e2e-dl-'));
// On CI (GitHub's Ubuntu 24.04 runners), unprivileged user namespaces are restricted and
// Chrome's sandbox cannot start; the page loaded here is our own site, from localhost.
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9337', '--no-first-run',
  ...(process.env.CI ? ['--no-sandbox'] : []),
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'xconvert-e2e-'))}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeErrors = '';
chrome.stderr.on('data', (chunk) => (chromeErrors += chunk));

/** Chrome's DevTools endpoint, once it answers — not after a guessed delay. */
async function devtoolsPage() {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    if (chrome.exitCode !== null) break;
    try {
      const page = (await (await fetch('http://127.0.0.1:9337/json/list')).json()).find((t) => t.type === 'page');
      if (page) return page;
    } catch {
      // not listening yet
    }
    await sleep(250);
  }
  throw new Error(`Chrome did not start (exit ${chrome.exitCode}). Its output:\n${chromeErrors.slice(-2000)}`);
}

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

// veraPDF: VERAPDF if set, else `npm run verapdf:install`'s copy, else one on PATH.
const verapdf = process.env.VERAPDF ?? (existsSync(join(APP, '.vendor-cache/verapdf/verapdf'))
  ? join(APP, '.vendor-cache/verapdf/verapdf')
  : (() => { try { return execFileSync('which', ['verapdf']).toString().trim(); } catch { return null; } })());
// With REQUIRE_VERAPDF=1 (CI), a missing validator fails instead of skipping.
const requireVerapdf = process.env.REQUIRE_VERAPDF === '1';
const hasPdftotext = (() => { try { execFileSync('which', ['pdftotext']); return true; } catch { return false; } })();

try {
  const target = await devtoolsPage();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));
  let id = 0;
  const pending = new Map();
  const problems = [];
  let workers = 0;
  let fileChoosers = 0;
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    // The converter worker is a target of its own: listen to it as closely as to the page.
    if (m.method === 'Target.attachedToTarget') {
      for (const method of ['Runtime.enable', 'Log.enable', 'Network.enable']) {
        ws.send(JSON.stringify({ id: ++id, method, sessionId: m.params.sessionId }));
      }
      workers += 1;
    }
    if (m.method === 'Page.fileChooserOpened') fileChoosers += 1;
    if (m.method === 'Runtime.exceptionThrown') problems.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    if (m.method === 'Log.entryAdded' && /Content Security Policy|Refused to/i.test(m.params.entry.text)) problems.push(`csp: ${m.params.entry.text}`);
    if (m.method === 'Network.requestWillBeSent') {
      const url = new URL(m.params.request.url);
      if (!['localhost', '127.0.0.1'].includes(url.hostname) && !url.protocol.startsWith('blob') && !url.protocol.startsWith('data')) problems.push(`request: ${url.href}`);
    }
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id;
    pending.set(i, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expression, ms = 60000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      // Mid-navigation the document may have no body yet: that is "not yet", not a failure.
      try { if (await ev(expression)) return true; } catch { /* retry */ }
      await sleep(200);
    }
    return false;
  };
  const text = () => ev('document.body.innerText');
  const click = (label) => ev(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)})); if (!b) return false; b.click(); return true; })()`);
  const pick = async (...names) => {
    const { root } = await send('DOM.getDocument');
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '.dropzone input[type=file]' });
    await send('DOM.setFileInputFiles', { nodeId, files: names.map((n) => join(APP, 'fixtures', n)) });
  };
  const nextDownload = async (before) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      const now = readdirSync(downloads).filter((f) => !f.endsWith('.crdownload') && !before.includes(f));
      if (now.length) { await sleep(300); return join(downloads, now[0]); }
      await sleep(200);
    }
    return null;
  };

  await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await send('Page.navigate', { url: BASE });
  check('the page loads', await waitFor(`document.body.innerText.includes('Drop a document here')`, 15000));

  // 0. A real click on the drop zone opens the file chooser. It once opened an ⓘ bubble instead:
  //    a click on a <label> goes to its first control, and the ⓘ button came before the input.
  await send('Page.setInterceptFileChooserDialog', { enabled: true });
  // Up to three real clicks: a slow runner may still be settling the page after load.
  let hit = '';
  for (let attempt = 0; attempt < 3 && !fileChoosers; attempt++) {
    const zone = await ev(`(() => { const z = document.querySelector('.dropzone'); z.scrollIntoView({ block: 'center' });
      const r = z.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2;
      const e = document.elementFromPoint(x, y); return { x, y, hit: e ? e.tagName + '.' + [...e.classList].join('.') : 'nothing' }; })()`);
    hit = zone.hit;
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: zone.x, y: zone.y, button: 'left', clickCount: 1 });
    for (let i = 0; i < 20 && !fileChoosers; i++) await sleep(100);
  }
  check('clicking the drop zone opens the file chooser', fileChoosers > 0, fileChoosers ? '' : `under the pointer: ${hit}`);
  check('…and pins no ⓘ bubble', !(await ev(`!!document.querySelector('.info-mark[aria-expanded=true]')`)));
  await send('Page.setInterceptFileChooserDialog', { enabled: false });

  // 1. DOCX → PDF/A
  await pick('smlouva.docx');
  check('the document is recognised as Word', await waitFor(`document.body.innerText.includes('Word (DOCX)')`, 5000));
  check('PDF/A is the default output', await ev(`!!document.querySelector('.choice.selected') && document.querySelector('.choice.selected').textContent.includes('PDF/A')`));
  await click('Show all formats');
  check('"Show all formats" lists pandoc’s own', await waitFor(`(document.querySelector('.all-formats')?.options.length ?? 0) > 40`, 60000),
    `${await ev(`document.querySelector('.all-formats')?.options.length ?? 0`)} formats`);
  await ev(`(() => { const s = document.querySelector('.all-formats'); s.value = 'pdf'; s.dispatchEvent(new Event('change')); })()`);
  // Both paper sizes are chosen explicitly: the default follows the locale, which differs
  // between this machine and a CI runner, and Letter once failed only on the runner.
  check('the paper size can be chosen', await click('A4'));
  await click('Convert to PDF/A');
  check('DOCX converts to PDF', await waitFor(`document.body.innerText.includes('Converted')`, 90000), (await text()).match(/Details[\s\S]{0,300}/)?.[0] ?? '');
  let before = readdirSync(downloads);
  await click('Save ');
  let file = await nextDownload(before);
  check('the PDF is saved under the document’s name', file?.endsWith('smlouva.pdf'), file ?? 'no download');
  if (file) {
    const pdf = readFileSync(file).toString('latin1');
    check('it is a PDF declaring PDF/A-2b', pdf.startsWith('%PDF-') && pdf.includes('<pdfaid:part>2</pdfaid:part>') && pdf.includes('<pdfaid:conformance>B</pdfaid:conformance>'));
    if (hasPdftotext) {
      check('it is A4', /Page size:\s+595\.\d+ x 841\.\d+/.test(execFileSync('pdfinfo', [file]).toString()));
      check('the Czech text survives', execFileSync('pdftotext', [file, '-']).toString().includes('Řehořem Čížkem'));
    } else {
      console.log('SKIP  text extraction — pdftotext (poppler-utils) is not installed');
    }
    if (verapdf) {
      const out = execFileSync(verapdf, ['--format', 'text', '--flavour', '2b', file]).toString();
      check('veraPDF passes it as PDF/A-2b', out.startsWith('PASS'), out.trim().split('\n')[0]);
    } else if (requireVerapdf) {
      check('veraPDF is available', false, 'run `npm run verapdf:install` (needs Java)');
    } else {
      console.log('SKIP  veraPDF validation — run `npm run verapdf:install` to include it');
    }
  }

  // 2. The same document → ODT, from the result screen
  await click('← Another format');
  await waitFor(`document.body.innerText.includes('Convert to')`, 5000);
  await ev(`[...document.querySelectorAll('.choice')].find((b) => b.textContent.includes('OpenDocument')).click()`);
  await click('Convert to OpenDocument');
  check('DOCX converts to ODT', await waitFor(`document.body.innerText.includes('Converted')`, 30000));
  before = readdirSync(downloads);
  await click('Save ');
  file = await nextDownload(before);
  check('the ODT is an OpenDocument package', !!file && readFileSync(file).toString('latin1').includes('application/vnd.oasis.opendocument.text'), file ?? 'no download');

  // 3. Markdown with the image it refers to → DOCX
  await click('Convert another document');
  await waitFor(`document.body.innerText.includes('Drop a document here')`, 5000);
  await pick('smlouva.md', 'diagram.png');
  check('the image travels with the Markdown', await waitFor(`document.body.innerText.includes('diagram.png')`, 5000));
  await ev(`[...document.querySelectorAll('.choice')].find((b) => b.textContent.includes('Word')).click()`);
  await click('Convert to Word');
  check('Markdown converts to DOCX', await waitFor(`document.body.innerText.includes('Converted')`, 30000));
  check('with no warning about a missing image', !(await text()).includes('Could not fetch resource'));
  before = readdirSync(downloads);
  await click('Save ');
  file = await nextDownload(before);
  check('the image is inside the DOCX', !!file && readFileSync(file).toString('latin1').includes('word/media/'), file ?? 'no download');

  // 4. Plain text is refused, with the reason
  await click('Convert another document');
  await waitFor(`document.body.innerText.includes('Drop a document here')`, 5000);
  writeFileSync(join(APP, 'fixtures', '.e2e-poznamky.txt'), 'poznámky\n');
  await pick('.e2e-poznamky.txt');
  check('plain text is refused, with a way forward', await waitFor(`document.body.innerText.includes('Rename it to .md')`, 5000));

  // 5. A Word drawing (WMF) Typst cannot draw: noted, not fatal
  await pick('vykres-metafile.docx');
  await waitFor(`document.body.innerText.includes('Convert to')`, 5000);
  // The screen keeps the last format chosen (Word, above); choose PDF/A again.
  await ev(`[...document.querySelectorAll('.choice')].find((b) => b.textContent.includes('PDF/A')).click()`);
  await click('Letter');
  await click('Convert to PDF/A');
  check('a document with a WMF drawing still converts to PDF', await waitFor(`document.body.innerText.includes('Converted')`, 60000),
    await ev(`(document.querySelector('details.raw pre')?.textContent ?? document.querySelector('.flow-panel')?.innerText ?? '').slice(0, 600)`));
  check('the reader is told which image was left out, in plain words',
    (await text()).includes('Image not shown in the PDF') && (await text()).includes('WMF') && !(await text()).includes('xconvert-undrawable.lua'));
  before = readdirSync(downloads);
  await click('Save ');
  file = await nextDownload(before);
  if (file && hasPdftotext) {
    const words = execFileSync('pdftotext', [file, '-']).toString();
    check('it is Letter', /Page size:\s+612 x 792/.test(execFileSync('pdfinfo', [file]).toString()));
    check('the PDF says where the image was, and keeps the PNG', words.includes('[Image not shown: WMF') && words.includes('Za obrázkem'));
  }
  if (file && verapdf) {
    const out = execFileSync(verapdf, ['--format', 'text', '--flavour', '2b', file]).toString();
    check('veraPDF passes that PDF too', out.startsWith('PASS'), out.trim().split('\n')[0]);
  }

  // 6. Offline: after a conversion, everything needed is cached; cut the network, reload, convert
  check('a service worker controls the page', await waitFor(`navigator.serviceWorker.controller !== null`, 10000));
  const cached = await ev(`(async () => {
    const out = [];
    for (const key of await caches.keys()) for (const r of await (await caches.open(key)).keys()) out.push(key + ' ' + new URL(r.url).pathname);
    return out;
  })()`);
  check('both converters are in the converter cache', ['vendor/pandoc.wasm.gz', 'vendor/typst-pdf.wasm.gz'].every((f) => cached.some((c) => /\/vendor:[0-9a-f]{16} /.test(c) && c.endsWith(f))),
    cached.filter((c) => c.includes('vendor')).join(', '));
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await send('Page.reload', { ignoreCache: false });
  check('offline, the page still loads', await waitFor(`document.body.innerText.includes('Drop a document here')`, 15000));
  await pick('smlouva.docx');
  await waitFor(`document.body.innerText.includes('Convert to')`, 5000);
  await ev(`[...document.querySelectorAll('.choice')].find((b) => b.textContent.includes('PDF/A')).click()`);
  await click('Convert to PDF/A');
  check('offline, a document still converts to PDF/A', await waitFor(`document.body.innerText.includes('Converted')`, 60000),
    await ev(`(document.querySelector('details.raw pre')?.textContent ?? '').slice(0, 300)`));
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  // 7. Licences: every notice the page links to is really served
  await send('Page.navigate', { url: `${BASE}#/licences` });
  await waitFor(`document.body.innerText.includes('Licences and source')`, 10000);
  const links = await ev(`[...document.querySelectorAll('main a[href]')].map((a) => a.href).filter((h) => h.startsWith(location.origin))`);
  const broken = [];
  for (const href of links) if ((await fetch(href)).status !== 200) broken.push(href);
  check('every licence the page links to is served', links.length >= 6 && broken.length === 0, broken.join(' ') || `${links.length} links`);
  const notices = await (await fetch(`${BASE}THIRD-PARTY.txt`)).text();
  check('THIRD-PARTY.txt names pandoc, Typst and the worker’s own code', ['pandoc 3.12', 'Typst 0.15.1', '@bjorn3/browser_wasi_shim', 'svelte'].every((n) => notices.includes(n)));

  check('the converter worker was watched too', workers > 0);
  check('no CSP violation, exception or outside request', problems.length === 0, problems.join(' | '));
} finally {
  chrome.kill();
  server.close();
  try { execFileSync('rm', ['-f', join(APP, 'fixtures', '.e2e-poznamky.txt')]); } catch {}
}

console.log(failures.length ? `\nxConvert e2e: ${failures.length} FAILED` : '\nxConvert e2e: PASS');
process.exit(failures.length ? 1 : 0);
