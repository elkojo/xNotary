/**
 * End-to-end check of /situations/ and the front page in a real browser (headless Chrome over CDP).
 *
 * Walks the Czech route to its outcome, opens "Why this route?", changes an answer from there and
 * checks the result follows (R4). Types phrases into the "I want to…" box on the front page and
 * on /situations/, and checks each lands on the expected first question (R1). Throughout, it
 * records every request the pages make: typing must send nothing, so any request after the page
 * has loaded fails the run.
 *
 * Usage: node scripts/e2e-situations.mjs [baseUrl]   (default http://localhost:5180/)
 * Needs the front page served: `npm run dev:hub -- --port 5180`, or `vite preview` of a build.
 * Not part of `npm test`: it needs Chrome at /usr/bin/google-chrome.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';

const baseUrl = new URL(process.argv[2] ?? 'http://localhost:5180/');
const shots = process.env.SHOTS; // a directory, to save a screenshot of each stage
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9335;

const profile = mkdtempSync(join(tmpdir(), 'xnotary-chrome-'));
const chrome = spawn(
  '/usr/bin/google-chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1100,1400',
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
  let targets = [];
  for (let i = 0; i < 30 && !targets.length; i++) {
    await sleep(300);
    targets = await fetch(`http://127.0.0.1:${port}/json/list`)
      .then((r) => r.json())
      .catch(() => []);
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));

  let id = 0;
  const pending = new Map();
  const errors = [];
  /** Every request since the last `settle()`, by URL. */
  let requests = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? 'exception');
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`evaluate: ${r.exceptionDetails.exception?.description}`);
    return r.result.value;
  };
  const text = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? null`);
  /** Clicks the first element matching `selector` whose text includes `label`. */
  const click = async (selector, label) => {
    const ok = await evaluate(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.innerText.includes(${JSON.stringify(label)}));
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!ok) throw new Error(`no ${selector} with "${label}"`);
    await sleep(150);
  };
  const open = async (path) => {
    await send('Page.navigate', { url: new URL(path, baseUrl).href });
    await sleep(1500);
    requests = [];
  };
  const shot = async (name) => {
    if (!shots) return;
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(join(shots, `${name}.png`), Buffer.from(data, 'base64'));
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  // --- R4: Why this route? ---------------------------------------------------------------
  await open('situations/?lang=en#official');
  await click('button.answer', 'Czechia');
  await click('button.answer', 'An officially verified signature');
  await click('button.answer', 'Yes');
  check('the Czech route ends at its outcome', (await text('.panel-title')) === 'You may not need a notary at all');
  await evaluate(`document.querySelector('details.situation-why').open = true`);
  const why = await text('details.situation-why');
  check('"Why this route?" lists the answers in order', /Czechia[\s\S]*An officially verified signature[\s\S]*Yes/.test(why), why);
  check('"Why this route?" gives the deciding sentence', /§ 6\(2\) of Act 12\/2020 Coll\./.test(why));
  await shot('why-this-route');
  // Change the certificate answer: back to that question, then the other answer.
  await evaluate(`[...document.querySelectorAll('details.situation-why li')].find((li) => li.innerText.includes('qualified certificate')).querySelector('button').click()`);
  await sleep(150);
  check('"Change an answer" goes back to that question', /qualified certificate/.test(await text('.panel-title')));
  await click('button.answer', 'No, or I am not sure');
  check('a changed answer changes the result', (await text('.panel-title')) === 'First, get a qualified certificate');

  await open('situations/?lang=en#sign-nocert');
  await evaluate(`document.querySelector('details.situation-why').open = true`);
  check('a step opened directly invents no answers', /opened this step directly/.test(await text('details.situation-why')));

  // --- R1: the "I want to…" box -----------------------------------------------------------
  const typeInto = async (phrase) => {
    await evaluate(`(() => {
      const input = document.querySelector('input[name="intent"]');
      input.focus();
      input.value = ${JSON.stringify(phrase)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(200);
  };
  const intake = [
    // [where, phrase, the first suggestion's question]
    ['/?lang=en', 'power of attorney for the land registry', 'What will the power of attorney be used for?'],
    ['/?lang=cs', 'plna moc pro katastr', 'K čemu bude plná moc sloužit?'],
    ['situations/?lang=cs', 'úředně ověřený podpis', 'Kde bude dokument použit?'],
    ['situations/?lang=en', 'I need to prove my file existed', 'Make a new proof, or check one you have?'],
  ];
  const sentWhileTyping = [];
  for (const [where, phrase, expected] of intake) {
    await open(where);
    await typeInto(phrase);
    sentWhileTyping.push(...requests);
    await shot(`intake-${phrase.replace(/\W+/g, '-')}`);
    const first = await evaluate(`document.querySelector('.intake-suggestions a, .intake-suggestions button')?.innerText ?? null`);
    check(`"${phrase}" is matched`, Boolean(first), first ?? 'no suggestion');
    await evaluate(`document.querySelector('.intake-suggestions a, .intake-suggestions button').click()`);
    await sleep(1500);
    check(`"${phrase}" lands on "${expected}"`, (await text('.panel-title')) === expected, await text('.panel-title'));
  }

  await open('/?lang=en');
  await typeInto('zxqv nonsense words');
  sentWhileTyping.push(...requests);
  const none = await text('.intake-none');
  check('a phrase with no match falls back to the cards', Boolean(none) && (await evaluate(`document.querySelectorAll('.situation-card').length`)) > 0, none ?? '');

  // Typing must send nothing at all — not even to this site.
  check('typing in the box sends nothing', sentWhileTyping.length === 0, sentWhileTyping.join(', '));
  check('no script errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('the run completed', false, e.message);
} finally {
  chrome.kill();
}

if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log('\nall passed');
