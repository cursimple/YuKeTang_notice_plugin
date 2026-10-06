#!/usr/bin/env bash
# Rebuild checksums and release assets into dist/; usage: scripts/pack.sh.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/plugin-packages/yuketang-notice"
out="$root/dist"

version="$(node -p "require('$src/manifest.json').version")"
zip_name="yuketang-notice-v${version}.zip"

# Checksums must cover every file except checksums.json and optional signature.json.
node - "$src" <<'NODE'
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const src = process.argv[2];
const files = {};
const walk = (dir) => {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { walk(full); continue; }
    const rel = path.relative(src, full).split(path.sep).join("/");
    if (rel === "checksums.json" || rel === "signature.json" || name === ".DS_Store") continue;
    files[rel] = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
  }
};
walk(src);
fs.writeFileSync(path.join(src, "checksums.json"), JSON.stringify({ algorithm: "SHA-256", files }, null, 2) + "\n");
console.log(`checksums.json: ${Object.keys(files).length} files`);
NODE

mkdir -p "$out"
rm -f "$out/$zip_name"
(cd "$src" && zip -qrX "$out/$zip_name" . -x '*.DS_Store')
printf '{\n  "filename": "%s",\n  "version": "v%s"\n}\n' "$zip_name" "$version" > "$out/manifest.json"
echo "packed: dist/$zip_name"
