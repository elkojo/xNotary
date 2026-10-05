#!/usr/bin/env bash
# Builds the Typst → PDF/A wrapper for the browser and checks the one property the
# design rests on: the module imports nothing, so it can reach nothing but its inputs.
set -euo pipefail
cd "$(dirname "$0")"
# rustup's toolchain (with the wasm32 target) if installed per user, else whatever is on PATH.
[ -x "$HOME/.cargo/bin/cargo" ] && export PATH="$HOME/.cargo/bin:$PATH"
cargo build --release --locked --target wasm32-unknown-unknown
WASM=target/wasm32-unknown-unknown/release/xconvert_typst_pdf.wasm
node -e '
const m = new WebAssembly.Module(require("fs").readFileSync(process.argv[1]));
const imports = WebAssembly.Module.imports(m);
if (imports.length) { console.error("typst-pdf must import nothing, but imports:", imports); process.exit(1); }
console.log("typst-pdf: no imports;", (require("fs").statSync(process.argv[1]).size / 1048576).toFixed(1), "MiB");
' "$WASM"
