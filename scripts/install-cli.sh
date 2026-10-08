#!/usr/bin/env bash
# Build a self-contained ZipWiki folder (CLI, LiteParse, MCP) and pack a tarball.
# Usage:
#   ./scripts/install-cli.sh          # build, pack, and npm i -g the folder
#   ./scripts/install-cli.sh --pack   # build and pack only (leaves .pack/)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PACK_ONLY=0
if [[ "${1:-}" == "--pack" ]]; then
  PACK_ONLY=1
fi

echo "[zipwiki] building @zipwiki/api-client, @zipwiki/zipwiki, @zipwiki/mcp…"
pnpm --filter @zipwiki/api-client build
pnpm --filter @zipwiki/zipwiki build
pnpm --filter @zipwiki/mcp build

echo "[zipwiki] deploying production tree to .pack/zipwiki…"
rm -rf .pack/zipwiki .pack/package
mkdir -p .pack
chmod +x packages/zipwiki-bundle/bin/zipwiki.js packages/zipwiki-bundle/bin/zipwiki-mcp.js
pnpm --filter ./packages/zipwiki-bundle deploy --prod --legacy .pack/zipwiki

require_file() {
  local label="$1"
  local pattern="$2"
  if ! find .pack/zipwiki -path "$pattern" -print -quit | grep -q .; then
    echo "[zipwiki] missing ${label} (${pattern})" >&2
    exit 1
  fi
}

require_file "LiteParse" "*@llamaindex/liteparse/package.json"
require_file "zipwiki CLI" "*@zipwiki/zipwiki/dist/cli.js"
require_file "MCP server" "*@zipwiki/mcp/dist/stdio.js"

echo "[zipwiki] copying docs and notices…"
mkdir -p .pack/zipwiki/doc .pack/zipwiki/examples
for doc in CLI.md QUERY.md MCP.md ZIPACCESS.md ZIPWIKI_APPNOTE.md; do
  cp "doc/${doc}" ".pack/zipwiki/doc/${doc}"
done
cp packages/zipwiki-bundle/README.md .pack/zipwiki/README.md
cp packages/zipwiki-bundle/THIRD_PARTY_NOTICES .pack/zipwiki/THIRD_PARTY_NOTICES
cp packages/zipwiki-bundle/examples/mcp.json .pack/zipwiki/examples/mcp.json

echo "[zipwiki] replacing deploy symlinks so npm can extract the tree…"
node scripts/materialize-pack.mjs .pack/zipwiki

echo "[zipwiki] marking the packed package as self-contained…"
node --input-type=module --eval '
import { readFileSync, writeFileSync } from "node:fs";
const path = ".pack/zipwiki/package.json";
const pkg = JSON.parse(readFileSync(path, "utf8"));
delete pkg.dependencies;
delete pkg.private;
writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
'

VERSION="$(node -p "JSON.parse(require('fs').readFileSync('packages/zipwiki-bundle/package.json','utf8')).version")"
PLATFORM="$(node -p "process.platform")"
ARCH="$(node -p "process.arch")"
TARBALL="zipwiki-${VERSION}-${PLATFORM}-${ARCH}.tgz"

echo "[zipwiki] packing .pack/${TARBALL}…"
cp -a .pack/zipwiki .pack/package
COPYFILE_DISABLE=1 tar -czf ".pack/${TARBALL}" -C .pack package
rm -rf .pack/package

REL="apps/web/public/releases"
mkdir -p "$REL"
cp ".pack/${TARBALL}" "${REL}/${TARBALL}"
cp packages/zipwiki-bundle/THIRD_PARTY_NOTICES "${REL}/THIRD_PARTY_NOTICES"
node --input-type=module --eval '
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const [file, version] = process.argv.slice(1);
const indexPath = "apps/web/public/releases/index.json";
const current = existsSync(indexPath)
  ? JSON.parse(readFileSync(indexPath, "utf8"))
  : { files: [] };
const files = Array.isArray(current.files)
  ? current.files.filter((name) => name !== file)
  : [];
files.push(file);
files.sort();
writeFileSync(indexPath, `${JSON.stringify({ version, files }, null, 2)}\n`);
writeFileSync(
  "apps/web/public/releases/latest.json",
  `${JSON.stringify({ version, url: "https://zipwiki.ai/install" }, null, 2)}\n`,
);
' "$TARBALL" "$VERSION"

echo "[zipwiki] packed at $ROOT/.pack/zipwiki"
echo "[zipwiki] tarball $ROOT/.pack/${TARBALL}"
echo "[zipwiki] website copy $ROOT/${REL}/${TARBALL}"

if [[ "$PACK_ONLY" -eq 1 ]]; then
  echo "[zipwiki] install with: npm i -g $ROOT/.pack/${TARBALL}"
  exit 0
fi

echo "[zipwiki] removing prior global installs (if any)…"
npm uninstall -g zipwiki >/dev/null 2>&1 || true
npm uninstall -g @zipwiki/zipwiki >/dev/null 2>&1 || true

echo "[zipwiki] npm i -g .pack/${TARBALL}…"
npm i -g "$ROOT/.pack/${TARBALL}"

if ! command -v zipwiki >/dev/null 2>&1 || ! command -v zipwiki-mcp >/dev/null 2>&1; then
  echo "[zipwiki] install finished but zipwiki or zipwiki-mcp is not on PATH." >&2
  echo "[zipwiki] try: export PATH=\"\$(npm prefix -g)/bin:\$PATH\"" >&2
  exit 1
fi

echo "[zipwiki] ok — $(command -v zipwiki)"
zipwiki --version
echo "[zipwiki] ok — $(command -v zipwiki-mcp)"
