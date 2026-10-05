// Drives the spike in headless Chrome over CDP and saves what it produces.
//   node probe.mjs [port] [--throttle]   (serve.mjs must be running on that port)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(new URL('../../app/package.json', import.meta.url));
const { WebSocket } = require('ws');
const port = Number(process.argv[2] ?? 4180);
const throttle = process.argv.includes('--throttle');
const phone = process.argv.includes('--phone');
const OUT = new URL('./fixtures/out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn('/usr/bin/google-chrome', ['--headless=new', '--remote-debugging-port=9336', '--no-first-run',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'xconvert-'))}`, 'about:blank'], { stdio: 'ignore' });

try {
  await sleep(2500);
  const page = (await (await fetch('http://127.0.0.1:9336/json/list')).json()).find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));
  let id = 0; const pending = new Map(); const logs = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') logs.push(`EXCEPTION ${m.params.exceptionDetails.exception?.description}`);
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type))
      logs.push(`${m.params.type} ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`.slice(0, 300));
    if (m.method === 'Log.entryAdded') logs.push(`log ${m.params.entry.level} ${m.params.entry.text}`.slice(0, 300));
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id;
    pending.set(i, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
  // Network conditions are per target, and the worker is its own: apply them there too.
  const workerSetup = [];
  const conditions = phone
    ? { offline: false, latency: 50, downloadThroughput: 20e6 / 8, uploadThroughput: 5e6 / 8 }
    : throttle ? { offline: false, latency: 20, downloadThroughput: 50e6 / 8, uploadThroughput: 10e6 / 8 } : null;
  ws.on('message', async (raw) => {
    const m = JSON.parse(raw);
    if (m.method === 'Target.attachedToTarget') {
      const sid = m.params.sessionId;
      // The worker starts paused (waitForDebuggerOnStart), so it must always be released.
      const steps = conditions ? [['Network.enable', {}], ['Network.setCacheDisabled', { cacheDisabled: true }],
        ['Network.emulateNetworkConditions', conditions]] : [];
      for (const [method, params] of [...steps, ['Runtime.runIfWaitingForDebugger', {}]]) {
        try { await send(method, params, sid); workerSetup.push(`${method} ok`); }
        catch (e) { workerSetup.push(`${method} ${e.message}`); }
      }
    }
  });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description);
    return r.result.value;
  };

  await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  if (throttle) {
    // A typical home connection: 50 Mbit/s down, 20 ms.
    await send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: 50e6 / 8, uploadThroughput: 10e6 / 8 });
  }
  if (phone) {
    // A mid-range phone on 4G: CPU four times slower, 20 Mbit/s down, 50 ms.
    await send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await send('Network.emulateNetworkConditions', { offline: false, latency: 50, downloadThroughput: 20e6 / 8, uploadThroughput: 5e6 / 8 });
  }
  await send('Page.navigate', { url: `http://localhost:${port}/` }); await sleep(1500);

  const runs = [
    ['smlouva.docx', 'docx', 'pdf'],   // cold: loads pandoc and Typst
    ['smlouva.docx', 'docx', 'pdf'],   // warm
    ['smlouva.docx', 'docx', 'odt'],
    ['smlouva.docx', 'docx', 'html'],
    ['smlouva.docx', 'docx', 'markdown'],
    ['smlouva.md', 'markdown', 'docx'],
    ['dlouha.docx', 'docx', 'pdf'],
  ];
  for (const [file, from, to] of runs) {
    const r = await ev(`convert('fixtures/${file}', '${from}', '${to}')`);
    const ext = { markdown: 'md' }[to] ?? to;
    if (r.ok && r.resultBytes) {
      const bytes = await ev(`Array.from(window.lastResult)`);
      writeFileSync(join(OUT, `${file.replace(/\.\w+$/, '')}-from-${from}.${ext}`), Buffer.from(bytes));
    }
    if (r.typstSource) writeFileSync(join(OUT, `${file}.typ`), r.typstSource);
    const { typstSource, ...summary } = r;
    console.log(`\n== ${file} ${from} -> ${to}`);
    console.log(JSON.stringify(summary, null, 1).slice(0, 1500));
  }
  console.log('\nworker setup:', workerSetup.join('; '));
  console.log('\nconsole/log:', logs.length ? `\n  ${logs.join('\n  ')}` : 'none');
} finally {
  chrome.kill();
  process.exit(0); // the CDP socket would otherwise keep node alive
}
