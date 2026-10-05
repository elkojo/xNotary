// xConvert spike: pandoc (and, for PDF, Typst) in a Web Worker, under the real CSP.
// Measures what step 1 needs to know; not production code.
import { createPandocInstance } from '../vendor/npm/pandoc-wasm/package/src/core.js';

const FONTS = [
  'LibertinusSerif-Regular.otf', 'LibertinusSerif-Italic.otf', 'LibertinusSerif-Bold.otf',
  'LibertinusSerif-BoldItalic.otf', 'DejaVuSansMono.ttf', 'DejaVuSansMono-Bold.ttf',
  'NewCMMath-Regular.otf',
];

// Every WebAssembly memory created, so its size can be reported.
const memories = {};
const instantiate = WebAssembly.instantiate.bind(WebAssembly);
let naming = '';
WebAssembly.instantiate = async (...args) => {
  const result = await instantiate(...args);
  const instance = result.instance ?? result;
  if (naming && instance.exports?.memory) memories[naming] = instance.exports.memory;
  return result;
};
const mib = (n) => Math.round((n / 1048576) * 10) / 10;
const memoryReport = () => Object.fromEntries(Object.entries(memories).map(([k, m]) => [k, mib(m.buffer.byteLength)]));

const violations = [];
self.addEventListener('securitypolicyviolation', (e) => violations.push(`${e.violatedDirective} ${e.blockedURI}`));

/** Fetches a gzipped binary from our own origin and inflates it in the browser. */
async function inflate(url) {
  const response = await fetch(url);
  const compressed = Number(response.headers.get('content-length'));
  const bytes = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return { bytes, compressed };
}

let pandoc = null;
let typst = null;
const timings = {};

async function loadPandoc() {
  if (pandoc) return;
  let t = performance.now();
  const { bytes, compressed } = await inflate('vendor/pandoc.wasm.gz');
  timings.pandocDownloadMs = Math.round(performance.now() - t);
  timings.pandocCompressedMiB = mib(compressed);
  timings.pandocMiB = mib(bytes.byteLength);
  t = performance.now();
  naming = 'pandoc';
  pandoc = await createPandocInstance(bytes);
  naming = '';
  timings.pandocStartMs = Math.round(performance.now() - t);
}

/** Our own Typst wrapper (../typst-pdf): no imports, plain exports over linear memory. */
async function loadTypst() {
  if (typst) return;
  let t = performance.now();
  const { bytes, compressed } = await inflate('vendor/typst-pdf.wasm.gz');
  const fonts = await Promise.all(FONTS.map(async (f) => new Uint8Array(await (await fetch(`vendor/fonts/${f}`)).arrayBuffer())));
  timings.typstDownloadMs = Math.round(performance.now() - t);
  timings.typstCompressedMiB = mib(compressed);
  timings.typstMiB = mib(bytes.byteLength);
  timings.fontsMiB = mib(fonts.reduce((n, f) => n + f.byteLength, 0));
  t = performance.now();
  naming = 'typst';
  const { instance } = await WebAssembly.instantiate(bytes, {});
  naming = '';
  const x = instance.exports;
  const withBytes = (data, fn) => {
    const ptr = x.xc_alloc(data.byteLength);
    new Uint8Array(x.memory.buffer, ptr, data.byteLength).set(data);
    try { return fn(ptr, data.byteLength); } finally { x.xc_free(ptr, data.byteLength); }
  };
  const output = () => new Uint8Array(x.memory.buffer, x.xc_output_ptr(), x.xc_output_len()).slice();
  const faces = fonts.map((f) => withBytes(f, (p, n) => x.xc_add_font(p, n)));
  timings.fontFaces = faces.reduce((a, b) => a + b, 0);
  typst = {
    reset: () => x.xc_reset_files(),
    addFile: (path, data) => withBytes(new TextEncoder().encode(path), (pp, pn) => withBytes(data, (dp, dn) => x.xc_add_file(pp, pn, dp, dn))),
    compile(source, standard) {
      const d = new Date();
      const status = withBytes(new TextEncoder().encode(source), (p, n) =>
        x.xc_compile(p, n, standard, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
      return status === 0 ? { pdf: output() } : { error: new TextDecoder().decode(output()) };
    },
  };
  timings.typstStartMs = Math.round(performance.now() - t);
}

async function convert({ name, bytes, from, to, standard }) {
  await loadPandoc();
  const input = new Blob([bytes]);
  const t = performance.now();

  if (to !== 'pdf') {
    const binary = ['docx', 'odt', 'epub', 'pptx'].includes(to);
    const out = binary ? `out.${to}` : undefined;
    const r = await pandoc.convert(
      { from, to, standalone: true, 'input-files': [name], ...(out ? { 'output-file': out } : {}) },
      null,
      { [name]: input },
    );
    const result = out ? new Uint8Array(await r.files[out].arrayBuffer()) : new TextEncoder().encode(r.stdout);
    return { result, ms: Math.round(performance.now() - t), warnings: r.warnings, stderr: r.stderr };
  }

  // PDF: pandoc writes Typst markup plus the document's images, Typst typesets it.
  const r = await pandoc.convert(
    { from, to: 'typst', standalone: true, 'input-files': [name], 'extract-media': 'media', variables: { papersize: 'a4', lang: 'cs' } },
    null,
    { [name]: input },
  );
  const pandocMs = Math.round(performance.now() - t);
  await loadTypst();
  const t2 = performance.now();
  typst.reset();
  for (const [path, blob] of Object.entries(r.mediaFiles)) {
    typst.addFile(`/${path}`, new Uint8Array(await blob.arrayBuffer()));
  }
  const compiled = typst.compile(r.stdout, standard ?? 1);
  const pdf = compiled.pdf;
  return {
    result: pdf instanceof Uint8Array ? pdf : null,
    diagnostics: compiled.error,
    typstSource: r.stdout,
    media: Object.keys(r.mediaFiles),
    pandocMs,
    typstMs: Math.round(performance.now() - t2),
    warnings: r.warnings,
    stderr: r.stderr,
  };
}

self.onmessage = async ({ data }) => {
  try {
    const out = await convert(data);
    self.postMessage({ ok: true, ...out, timings, memory: memoryReport(), violations });
  } catch (e) {
    self.postMessage({ ok: false, error: String(e?.stack ?? e), timings, memory: memoryReport(), violations });
  }
};
