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

# LibreOffice compiled to WebAssembly, for "Keep the layout" (Word/ODT → PDF/A on a computer).
# A prebuilt package: LibreOffice's libreoffice-24-8 branch with the publisher's patches, built
# with Emscripten 3.1.51 (github.com/matbeedotcom/libreoffice-document-converter, tag v2.7.2).
# scripts/patch-libreoffice.mjs then removes its need for 'unsafe-eval' and makes it load in
# parts. Its licences: LibreOffice's own (license.xml, NOTICE), and MPL-2.0 for the package.
LO_PKG=2.7.2
LO_PKG_SHA256=14d670936fe220ee49becbfd40bf233ceabb94981fa9987fccde345449ee2c3a
LO_LICENCE_TAG=libreoffice-24.8.7.2
LO_LICENCE_XML_SHA256=d55f85e7f9563ed9b727a0041dbd839d475ebd8f3241686dd41d4d1ab6a29666
LO_NOTICE_SHA256=710268df71b1ace277778e12d308aed448bc592f0bd808a3117fa83bf2a43001
SPDX_LICENCES=v3.29.0
MPL_SHA256=66a3107d5ad6a058aab753eaac2047ccb2ed0e39465dd0fe5844da3e300d5172

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
cp ../typst-pdf/target/THIRD-PARTY.txt "$OUT/licences/typst-pdf-THIRD-PARTY.txt"

# split FILE NAME — gzip FILE into $OUT/libreoffice/NAME.gz.NN parts of at most 20 MiB, and
# write NAME.parts.json listing them with their total size (the worker shows progress from it).
split_parts() {
  local file=$1 name=$2 dir=$OUT/libreoffice
  rm -f "$dir/$name".gz.*
  gzip -9 -n -c "$file" | split -b 20M -d -a 2 - "$dir/$name.gz."
  ( cd "$dir" && node -e '
    const fs = require("fs"); const name = process.argv[1];
    const parts = fs.readdirSync(".").filter((f) => f.startsWith(name + ".gz.")).sort();
    const bytes = parts.reduce((n, f) => n + fs.statSync(f).size, 0);
    fs.writeFileSync(name + ".parts.json", JSON.stringify({ parts, bytes }) + "\n");' "$name" )
}

fetch "https://registry.npmjs.org/@matbee/libreoffice-converter/-/libreoffice-converter-$LO_PKG.tgz" "libreoffice-converter-$LO_PKG.tgz" "$LO_PKG_SHA256"
rm -rf "$CACHE/libreoffice" && mkdir -p "$CACHE/libreoffice" "$OUT/libreoffice"
tar -xzf "$CACHE/libreoffice-converter-$LO_PKG.tgz" -C "$CACHE/libreoffice"
node scripts/patch-libreoffice.mjs "$CACHE/libreoffice/package" "$OUT/libreoffice"
cp "$CACHE/libreoffice/package/wasm/soffice.worker.js" "$OUT/libreoffice/soffice.worker.js"
split_parts "$CACHE/libreoffice/package/wasm/soffice.wasm" soffice.wasm
split_parts "$CACHE/libreoffice/package/wasm/soffice.data" soffice.data
fetch "https://raw.githubusercontent.com/LibreOffice/core/$LO_LICENCE_TAG/readlicense_oo/license/license.xml" libreoffice-license.xml "$LO_LICENCE_XML_SHA256"
fetch "https://raw.githubusercontent.com/LibreOffice/core/$LO_LICENCE_TAG/readlicense_oo/license/NOTICE" libreoffice-NOTICE "$LO_NOTICE_SHA256"
fetch "https://raw.githubusercontent.com/spdx/license-list-data/$SPDX_LICENCES/text/MPL-2.0.txt" MPL-2.0.txt "$MPL_SHA256"
cp "$CACHE/libreoffice-license.xml" "$OUT/licences/libreoffice-license.xml"
cp "$CACHE/libreoffice-NOTICE" "$OUT/licences/libreoffice-NOTICE.txt"
cp "$CACHE/MPL-2.0.txt" "$OUT/licences/MPL-2.0.txt"

find "$OUT" -type f -printf '%s\t%P\n' | sort -k2
