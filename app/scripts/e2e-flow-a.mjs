/**
 * End-to-end check of Flow A in a real browser (headless Chrome over CDP).
 *
 * Drives the actual UI: picks a file, creates Certificate 1, then re-verifies
 * that file against the stored proof on the Verify screen. Asserts the digest
 * the app computed matches an independently computed SHA-256.
 *
 * Usage: node scripts/e2e-flow-a.mjs [baseUrl]
 * Hits live OpenTimestamps calendars, so it is not part of `npm test`.
 */
import { spawn } from 'node:child_process';
import { createHash, webcrypto } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const baseUrl = process.argv[2] ?? 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A unique document, so every run exercises a genuine calendar round-trip.
const docPath = join(mkdtempSync(join(tmpdir(), 'xnotary-e2e-')), 'contract.txt');
const docBody = `xNotary end-to-end test\nnonce: ${crypto.randomUUID()}\n`;
writeFileSync(docPath, docBody);
const expectedDigest = createHash('sha256').update(docBody).digest('hex');

const profile = mkdtempSync(join(tmpdir(), 'xnotary-chrome-'));
const chrome = spawn(
  '/usr/bin/google-chrome',
  [
    '--headless=new',
    '--remote-debugging-port=9334',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

try {
  await sleep(3000);
  const targets = await (await fetch('http://127.0.0.1:9334/json/list')).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));

  let id = 0;
  const pending = new Map();
  const consoleErrors = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(m.params.exceptionDetails.exception?.description ?? 'exception');
    }
  });
  // Resolves to the CDP `result` payload, or throws on a protocol error.
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed');
    }
    return r.result?.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('DOM.enable');
  await send('Page.navigate', { url: baseUrl });
  await sleep(4000);

  // --- Flow A: notarize -----------------------------------------------------
  const { root } = await send('DOM.getDocument', { depth: -1 });
  const { nodeId: input } = await send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '.dropzone input[type=file]',
  });
  check('file input is present', Boolean(input));
  await send('DOM.setFileInputFiles', { nodeId: input, files: [docPath] });

  // Notify Svelte, which listens for `change` on the input.
  await evaluate(
    `document.querySelector('.dropzone input[type=file]')
       .dispatchEvent(new Event('change', { bubbles: true }))`,
  );
  await sleep(500);
  check(
    'app shows the chosen file',
    (await evaluate(`document.body.innerText.includes('contract.txt')`)) === true,
  );

  await evaluate(
    `[...document.querySelectorAll('button')]
       .find((b) => b.textContent.includes('Create Certificate 1')).click()`,
  );

  // Hashing is instant here; the calendar round-trip is the slow part.
  let text = '';
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    text = await evaluate('document.body.innerText');
    if (/Certificate 1 created|Could not create/.test(text)) break;
  }

  check('Certificate 1 was created', /Certificate 1 created/.test(text), text.slice(0, 200));
  check(
    'the app computed the same SHA-256 as the reference implementation',
    text.replace(/\s/g, '').includes(expectedDigest),
    expectedDigest,
  );
  check(
    'a timestamp status is reported',
    /Pending anchor|Confirmed on Bitcoin/.test(text),
    (text.match(/Pending anchor|Confirmed on Bitcoin/) ?? [])[0],
  );
  check('save buttons are offered', /Save Certificate 1 \(PDF\)/.test(text));

  // --- Library persistence --------------------------------------------------
  const stored = await evaluate(`(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('xnotary', 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const all = await new Promise((res, rej) => {
      const r = db.transaction('certificates').objectStore('certificates').getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return all.map((r) => ({
      id: r.id, fileName: r.fileName, ots: r.ots.length, pdf: r.pdf.length, kind: r.status.kind,
    }));
  })()`);

  check('certificate is stored in the local library', stored.length === 1, JSON.stringify(stored));
  check('stored record is keyed by the document digest', stored[0]?.id === expectedDigest);
  check('a .ots proof was stored', (stored[0]?.ots ?? 0) > 100, `${stored[0]?.ots} bytes`);
  check('a certificate PDF was stored', (stored[0]?.pdf ?? 0) > 2000, `${stored[0]?.pdf} bytes`);

  // --- Verify screen --------------------------------------------------------
  // Write the stored .ots out so it can be fed back through the real UI.
  const otsBytes = await evaluate(`(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('xnotary', 1); r.onsuccess = () => res(r.result); });
    const rec = await new Promise((res) => {
      const r = db.transaction('certificates').objectStore('certificates').getAll();
      r.onsuccess = () => res(r.result[0]);
    });
    return [...rec.ots];
  })()`);
  const otsPath = `${docPath}.ots`;
  writeFileSync(otsPath, Buffer.from(otsBytes));

  await evaluate(
    `[...document.querySelectorAll('nav.tabs button')]
       .find((b) => b.textContent.includes('Verify integrity')).click()`,
  );
  await sleep(700);

  const doc2 = await send('DOM.getDocument', { depth: -1 });
  const { nodeIds } = await send('DOM.querySelectorAll', {
    nodeId: doc2.root.nodeId,
    selector: '.dropzone input[type=file]',
  });
  check('verify screen offers two drop zones', nodeIds.length === 2, `${nodeIds.length}`);

  await send('DOM.setFileInputFiles', { nodeId: nodeIds[0], files: [docPath] });
  await send('DOM.setFileInputFiles', { nodeId: nodeIds[1], files: [otsPath] });
  await evaluate(
    `document.querySelectorAll('.dropzone input[type=file]')
       .forEach((i) => i.dispatchEvent(new Event('change', { bubbles: true })))`,
  );
  await sleep(600);
  await evaluate(
    `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Verify').click()`,
  );

  let verifyText = '';
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    verifyText = await evaluate('document.body.innerText');
    if (/Verified|Does not match|Matches, timestamp still pending|Matches, anchor not checked/.test(verifyText)) break;
  }
  check(
    'verifying the original document against its proof succeeds',
    /Verified|Matches, timestamp still pending|Matches, anchor not checked/.test(verifyText),
    (verifyText.match(/Verified|Does not match|Matches[^\n]*/) ?? [])[0],
  );
  check('verify screen does not report a mismatch', !/Does not match/.test(verifyText));

  // Tamper: a different document must be rejected.
  const tamperedPath = `${docPath}.tampered.txt`;
  writeFileSync(tamperedPath, `${docBody}tampered\n`);
  const doc3 = await send('DOM.getDocument', { depth: -1 });
  const q3 = await send('DOM.querySelectorAll', {
    nodeId: doc3.root.nodeId,
    selector: '.dropzone input[type=file]',
  });
  await send('DOM.setFileInputFiles', { nodeId: q3.nodeIds[0], files: [tamperedPath] });
  await evaluate(
    `document.querySelectorAll('.dropzone input[type=file]')[0]
       .dispatchEvent(new Event('change', { bubbles: true }))`,
  );
  await sleep(400);
  await evaluate(
    `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Verify').click()`,
  );
  let tamperText = '';
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    tamperText = await evaluate('document.body.innerText');
    if (/Does not match|Verified|Matches/.test(tamperText)) break;
  }
  check('a modified document is rejected', /Does not match/.test(tamperText));

  check('no uncaught exceptions', consoleErrors.length === 0, consoleErrors.join(' | '));
  ws.close();
} finally {
  chrome.kill();
}

console.log(`\n${failures.length === 0 ? 'FLOW A: PASS' : `FLOW A: FAIL (${failures.join(', ')})`}`);
process.exit(failures.length === 0 ? 0 : 1);
