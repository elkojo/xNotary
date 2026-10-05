// Writes target/THIRD-PARTY.txt: every crate compiled into the WebAssembly module, with its
// licence and the licence files it ships. From `cargo metadata` for the wasm32 target,
// following normal dependencies only — so build tools and tests are left out, and nothing
// is listed by hand that could drift from what is really linked.
//
// Each distinct licence text is printed once and referred to by number: 280 crates would
// otherwise repeat the Apache-2.0 text 150 times.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const here = new URL('.', import.meta.url).pathname;
const meta = JSON.parse(
  execFileSync('cargo', ['metadata', '--format-version', '1', '--locked', '--filter-platform', 'wasm32-unknown-unknown'], {
    cwd: here,
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'utf8',
  }),
);

const packages = new Map(meta.packages.map((p) => [p.id, p]));
const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
const root = meta.resolve.root;
const linked = new Set();
const stack = [root];
while (stack.length) {
  const id = stack.pop();
  if (linked.has(id)) continue;
  linked.add(id);
  for (const dep of nodes.get(id).deps) {
    if (dep.dep_kinds.some((k) => k.kind === null)) stack.push(dep.pkg);
  }
}
linked.delete(root);

const LICENCE_FILE = /^(LICEN[CS]E|COPYING|NOTICE|UNLICENSE)([-._].*)?$/i;
const texts = new Map(); // hash → { number, text }
const crates = [...linked]
  .map((id) => packages.get(id))
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
  .map((p) => {
    const dir = dirname(p.manifest_path);
    const files = readdirSync(dir).filter((f) => LICENCE_FILE.test(f)).sort();
    if (p.license_file && !files.includes(p.license_file)) files.push(p.license_file);
    const refs = files
      .filter((f) => existsSync(join(dir, f)))
      .map((f) => {
        const text = readFileSync(join(dir, f), 'utf8').trim();
        const hash = createHash('sha256').update(text).digest('hex');
        if (!texts.has(hash)) texts.set(hash, { number: texts.size + 1, text, first: `${p.name} ${f}` });
        return `[${texts.get(hash).number}] ${f}`;
      });
    if (!refs.length) refs.push(fallback(p));
    return { name: p.name, version: p.version, licence: p.license ?? 'see licence file', refs };
  });

/**
 * A crate published without its licence file — Typst's own among them: the text lives in
 * their repositories, not in the packages. Its licence still has to travel with the code,
 * so the canonical SPDX text is supplied (licences/, from SPDX's licence list). Where the
 * crate offers a choice, Apache-2.0 is taken, being the licence Typst itself is under.
 * Anything not covered fails the build instead of shipping without its notice.
 */
function fallback(p) {
  const offered = (p.license ?? '').split(/\s+(?:OR|AND|WITH)\s+|\/|[()]/).map((s) => s.trim()).filter(Boolean);
  const canonical = (id) => readFileSync(join(here, 'licences', `${id}.txt`), 'utf8').trim();
  let id;
  let text;
  if (offered.includes('Apache-2.0')) {
    id = 'Apache-2.0';
    text = canonical(id);
  } else if (offered.includes('0BSD')) {
    id = '0BSD';
    text = canonical(id).replace(/^Copyright \(C\) YEAR by AUTHOR EMAIL/, `Copyright (C) ${p.authors.join(', ')}`);
  } else {
    throw new Error(`${p.name} ${p.version} ships no licence file, and "${p.license}" has no canonical text in licences/`);
  }
  const hash = createHash('sha256').update(text).digest('hex');
  if (!texts.has(hash)) texts.set(hash, { number: texts.size + 1, text, first: `canonical ${id} (SPDX), for crates published without the file` });
  return `[${texts.get(hash).number}] ${id}, canonical text — the crate ships no licence file`;
}

const rule = '-'.repeat(78);
const out = [
  'xConvert — typst-pdf: crates compiled into vendor/typst-pdf.wasm.gz',
  '',
  'Our Typst wrapper (xconvert/typst-pdf, AGPL-3.0-or-later) links the crates below, each under',
  'the licence its authors gave it. Generated at build time from `cargo metadata`.',
  '',
  rule,
  ...crates.map((c) => `${c.name} ${c.version} — ${c.licence}${c.refs.length ? `\n    ${c.refs.join(', ')}` : '\n    (no licence file in the crate)'}`),
  '',
  ...[...texts.values()].flatMap((t) => [rule, `[${t.number}] (first shipped by ${t.first})`, '', t.text, '']),
];
writeFileSync(join(here, 'target', 'THIRD-PARTY.txt'), `${out.join('\n')}\n`);
console.log(`typst-pdf: ${crates.length} crates, ${texts.size} distinct licence texts → target/THIRD-PARTY.txt`);
