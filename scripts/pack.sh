#!/usr/bin/env bash
# 打包组件：重算 checksums.json → 打 zip → 写 Release 用的 manifest.json（{filename, version}）
# 用法：scripts/pack.sh            产物在 dist/
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/plugin-packages/yuketang-notice"
out="$root/dist"

version="$(node -p "require('$src/manifest.json').version")"
zip_name="yuketang-notice-v${version}.zip"

# checksums.json 必须恰好覆盖包里除它自己和 signature.json 以外的全部文件，宿主会逐个核对
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
