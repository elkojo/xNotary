// Drives headless Chrome over CDP to run the CORS probe page in a real browser.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2];
const profile = mkdtempSync(join(tmpdir(), 'xnotary-cdp-'));
const chrome = spawn('/usr/bin/google-chrome', [
  '--headless=new', '--remote-debugging-port=9333', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3000);

const targets = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = targets.find((t) => t.type === 'page');
const ws = new (await import('ws')).WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.once('open', r));

let id = 0;
const pending = new Map();
const logs = [];
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') {
    logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
  if (m.method === 'Log.entryAdded') logs.push(`[log:${m.params.entry.level}] ${m.params.entry.text}`);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.navigate', { url });
await sleep(45000);

const res = await send('Runtime.evaluate', { expression: "document.getElementById('out').textContent", returnByValue: true });
console.log('===== PAGE OUTPUT =====');
console.log(res.result?.result?.value ?? '(no output)');
console.log('===== CONSOLE/NETWORK LOG =====');
console.log(logs.join('\n'));
ws.close(); chrome.kill(); process.exit(0);
