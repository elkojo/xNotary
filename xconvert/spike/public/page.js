// Page side of the spike: hands a fixture to the worker and returns what it reports.
const violations = [];
document.addEventListener('securitypolicyviolation', (e) => violations.push(`${e.violatedDirective} ${e.blockedURI}`));

const worker = new Worker('worker.js', { type: 'module' });

window.convert = async (url, from, to) => {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const name = url.split('/').pop();
  const started = performance.now();
  const reply = await new Promise((resolve) => {
    worker.onmessage = ({ data }) => resolve(data);
    worker.onerror = (e) => resolve({ ok: false, error: `worker error: ${e.message}` });
    worker.postMessage({ name, bytes, from, to }, [bytes.buffer]);
  });
  reply.totalMs = Math.round(performance.now() - started);
  reply.pageViolations = violations.slice();
  if (reply.result) {
    window.lastResult = reply.result;
    reply.resultBytes = reply.result.byteLength;
    delete reply.result;
  }
  document.getElementById('log').textContent += `${to}: ${JSON.stringify(reply).slice(0, 400)}\n`;
  return reply;
};
