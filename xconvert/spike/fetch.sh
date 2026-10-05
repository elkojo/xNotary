#!/usr/bin/env bash
# Fetches everything the xConvert spike runs on, pinned, into ./vendor and ./public.
# Nothing here is committed: the binaries are far over what belongs in git.
set -euo pipefail
cd "$(dirname "$0")"

PANDOC=3.12
WASI_SHIM=0.4.2
PANDOC_WASM_JS=1.1.0
TYPST_ASSETS=v0.15.0

rm -rf vendor public/vendor
mkdir -p vendor/npm public/vendor/fonts

curl -sSfL -o vendor/pandoc.zip \
  "https://github.com/jgm/pandoc/releases/download/$PANDOC/pandoc-$PANDOC.wasm.zip"
unzip -q -o vendor/pandoc.zip -d vendor

npm_get() { # name version dir
  local tarball
  tarball=$(curl -sSf "https://registry.npmjs.org/$1/$2" | python3 -c 'import sys,json;print(json.load(sys.stdin)["dist"]["tarball"])')
  mkdir -p "vendor/npm/$3" && curl -sSfL "$tarball" | tar xz -C "vendor/npm/$3"
}
npm_get pandoc-wasm "$PANDOC_WASM_JS" pandoc-wasm
npm_get @bjorn3/browser_wasi_shim "$WASI_SHIM" wasi-shim

# pandoc.wasm goes out gzipped: 58 MiB is over Cloudflare Pages' 25 MiB file limit, and the
# browser inflates it with DecompressionStream. (Typst is ours: ../typst-pdf, via build.sh.)
gzip -9 -c vendor/pandoc-wasm/pandoc.wasm > public/vendor/pandoc.wasm.gz

# Typst's own default faces, self-hosted rather than fetched from its CDN.
for f in LibertinusSerif-Regular.otf LibertinusSerif-Italic.otf LibertinusSerif-Bold.otf \
         LibertinusSerif-BoldItalic.otf DejaVuSansMono.ttf DejaVuSansMono-Bold.ttf \
         NewCMMath-Regular.otf; do
  curl -sSfL -o "public/vendor/fonts/$f" \
    "https://raw.githubusercontent.com/typst/typst-assets/$TYPST_ASSETS/files/fonts/$f"
done

ls -l public/vendor public/vendor/fonts | awk 'NF>5 {print $5, $9}'
