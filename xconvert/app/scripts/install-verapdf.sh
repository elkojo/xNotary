#!/usr/bin/env bash
# Installs veraPDF, the reference PDF/A validator, into .vendor-cache/verapdf, where
# scripts/e2e.mjs finds it. xConvert calls its PDFs archival only because they pass it.
# Needs Java 11 or later. Pinned by SHA-256 like everything else vendor.sh fetches.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=1.30.2
ZIP_SHA256=6cc6341cb1af644044054b81f00a6590a7918abb18f762243de115258bcad838
CACHE=.vendor-cache
TARGET=$PWD/$CACHE/verapdf
ZIP=$CACHE/verapdf-greenfield-$VERSION-installer.zip

[ -x "$TARGET/verapdf" ] && { "$TARGET/verapdf" --version | head -1; exit 0; }
mkdir -p "$CACHE"
[ -f "$ZIP" ] || curl -sSfL --retry 3 -o "$ZIP" "https://software.verapdf.org/rel/${VERSION%.*}/verapdf-greenfield-$VERSION-installer.zip"
echo "$ZIP_SHA256  $ZIP" | sha256sum --check --quiet || { echo "install-verapdf: installer does not match its pinned SHA-256" >&2; rm -f "$ZIP"; exit 1; }

rm -rf "$CACHE/verapdf-installer" && unzip -q "$ZIP" -d "$CACHE/verapdf-installer"
cat > "$CACHE/verapdf-auto.xml" <<XML
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<AutomatedInstallation langpack="eng">
  <com.izforge.izpack.panels.htmlhello.HTMLHelloPanel id="welcome"/>
  <com.izforge.izpack.panels.target.TargetPanel id="install_dir"><installpath>$TARGET</installpath></com.izforge.izpack.panels.target.TargetPanel>
  <com.izforge.izpack.panels.packs.PacksPanel id="sdk_pack_select">
    <pack index="0" name="veraPDF GUI" selected="true"/>
    <pack index="1" name="veraPDF Batch files" selected="true"/>
    <pack index="2" name="veraPDF Validation model" selected="false"/>
    <pack index="3" name="veraPDF Documentation" selected="false"/>
    <pack index="4" name="veraPDF Sample Plugins" selected="false"/>
  </com.izforge.izpack.panels.packs.PacksPanel>
  <com.izforge.izpack.panels.install.InstallPanel id="install"/>
  <com.izforge.izpack.panels.finish.FinishPanel id="finish"/>
</AutomatedInstallation>
XML
java -jar "$(find "$CACHE/verapdf-installer" -name '*installer*.jar' | head -1)" "$CACHE/verapdf-auto.xml" > /dev/null 2>&1
"$TARGET/verapdf" --version | head -1
