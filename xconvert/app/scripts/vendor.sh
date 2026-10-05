#!/usr/bin/env bash
# Puts the converters, fonts and their licences into public/vendor/, where the build copies
# them from. None of it is committed: pandoc.wasm alone is 58 MiB.
#
# Every download is pinned by SHA-256, so what ships is what was reviewed — a changed file
# upstream fails the build instead of reaching users. Typst is not downloaded at all: it is
# our own wrapper in ../typst-pdf, built from source here.
#
# Both binaries are served gzipped and inflated in the browser (DecompressionStream):
# Cloudflare Pages refuses any single file over 25 MiB, and pandoc.wasm is 58.
# `gzip -n` leaves out the name and time, so the same input gives the same bytes.
set -euo pipefail
cd "$(dirname "$0")/.."

PANDOC=3.12
PANDOC_ZIP_SHA256=f14bc3e7722c8bdd58188707e8d5445ce1ac909eae43373f903b45c2f7390cf9
TYPST_ASSETS=v0.15.0
declare -A FONT_SHA256=(
  [LibertinusSerif-Regular.otf]=fcf06307a77367394fcb0ccb241e59eea70dba3d732be309647611224679c733
  [LibertinusSerif-Italic.otf]=9a393d63d6e05f620d3dc0190dfd35a8ede58c0808cf0fc9de7fcb9c723e4c24
  [LibertinusSerif-Bold.otf]=0264914210ed51b3231ebc92ce529e9f2e166ba9eebf0cd4a579558690a27b64
  [LibertinusSerif-BoldItalic.otf]=47a665259f09f554f5d133d7718cdad43ff462c6a6b2328f38023465e62d57ce
  [DejaVuSansMono.ttf]=b4a6c3e4faab8773f4ff761d56451646409f29abedd68f05d38c2df667d3c582
  [DejaVuSansMono-Bold.ttf]=bce60f1b4421acd9ea51ba6623d7024ecbe6817a953e3654df62a5e6bdf8f769
  [NewCMMath-Regular.otf]=925289812275068dfc9dd06ac44dcd206944ee2f58f9a08186c1fd3539520e05
)
TYPST_ASSETS_NOTICE_SHA256=80ac46fb7d70f1c30bf0c14d3408e6a6f0f9cc9997a00b592aa0d2c8a5243a9d

CACHE=.vendor-cache
OUT=public/vendor
mkdir -p "$CACHE" "$OUT/fonts" "$OUT/licences"

# fetch URL FILE SHA256 — downloads once into the cache, and always checks.
fetch() {
  local url=$1 file=$CACHE/$2 sum=$3
  if [ ! -f "$file" ]; then
    curl -sSfL --retry 3 -o "$file.part" "$url"
    mv "$file.part" "$file"
  fi
  echo "$sum  $file" | sha256sum --check --quiet || { echo "vendor: $2 does not match its pinned SHA-256" >&2; rm -f "$file"; exit 1; }
}

fetch "https://github.com/jgm/pandoc/releases/download/$PANDOC/pandoc-$PANDOC.wasm.zip" "pandoc-$PANDOC.wasm.zip" "$PANDOC_ZIP_SHA256"
rm -rf "$CACHE/pandoc-wasm" && unzip -q "$CACHE/pandoc-$PANDOC.wasm.zip" -d "$CACHE"
gzip -9 -n -c "$CACHE/pandoc-wasm/pandoc.wasm" > "$OUT/pandoc.wasm.gz"
cp "$CACHE/pandoc-wasm/COPYING.md" "$OUT/licences/pandoc-COPYING.md"
cp "$CACHE/pandoc-wasm/COPYRIGHT" "$OUT/licences/pandoc-COPYRIGHT.txt"

for font in "${!FONT_SHA256[@]}"; do
  fetch "https://raw.githubusercontent.com/typst/typst-assets/$TYPST_ASSETS/files/fonts/$font" "$font" "${FONT_SHA256[$font]}"
  cp "$CACHE/$font" "$OUT/fonts/$font"
done
fetch "https://raw.githubusercontent.com/typst/typst-assets/$TYPST_ASSETS/NOTICE" typst-assets-NOTICE "$TYPST_ASSETS_NOTICE_SHA256"
cp "$CACHE/typst-assets-NOTICE" "$OUT/licences/fonts-NOTICE.txt"

../typst-pdf/build.sh
gzip -9 -n -c ../typst-pdf/target/wasm32-unknown-unknown/release/xconvert_typst_pdf.wasm > "$OUT/typst-pdf.wasm.gz"

find "$OUT" -type f -printf '%s\t%P\n' | sort -k2
