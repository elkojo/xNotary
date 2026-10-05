#!/usr/bin/env bash
# Bundles the spike worker and packs our Typst wrapper (build ../typst-pdf first).
set -euo pipefail
cd "$(dirname "$0")"
../../app/node_modules/.bin/esbuild src/worker.js --bundle --format=esm --outfile=public/worker.js \
  --alias:@bjorn3/browser_wasi_shim=./vendor/npm/wasi-shim/package/dist/index.js --log-level=warning
gzip -9 -c ../typst-pdf/target/wasm32-unknown-unknown/release/xconvert_typst_pdf.wasm > public/vendor/typst-pdf.wasm.gz
echo "worker.js and typst-pdf.wasm.gz built; new Function in bundle: $(grep -c 'new Function' public/worker.js || true)"
