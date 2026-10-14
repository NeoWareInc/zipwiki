#!/usr/bin/env bash
# Build a self-contained ZipWiki folder (CLI, LiteParse, MCP) and pack tarballs.
# Usage:
#   ./scripts/install-cli.sh          # build, pack all platforms, and npm i -g host build
#   ./scripts/install-cli.sh --pack   # build and pack only (leaves .pack/)
#
# Produces one tarball per OS/arch with the matching LiteParse native package
# (fetched from npm — does not require building on that machine).
# Set ZIPWIKI_SITE_URL (e.g. https://dev.zipwiki.ai) to point latest.json at a
# non-production install page. Default remains https://zipwiki.ai. The Install
# page itself always uses window.location.origin for npm one-liners.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PACK_ONLY=0
if [[ "${1:-}" == "--pack" ]]; then
  PACK_ONLY=1
fi

SITE_URL="${ZIPWIKI_SITE_URL:-https://zipwiki.ai}"
SITE_URL="${SITE_URL%/}"

echo "[zipwiki] building @zipwiki/api-client, @zipwiki/zipwiki, @zipwiki/mcp…"
pnpm --filter @zipwiki/api-client build
pnpm --filter @zipwiki/zipwiki build
pnpm --filter @zipwiki/mcp build

echo "[zipwiki] deploying production tree to .pack/zipwiki…"
rm -rf .pack/zipwiki .pack/package .pack/native-cache
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
LITEPARSE_VERSION="$(node -p "JSON.parse(require('fs').readFileSync('.pack/zipwiki/node_modules/@llamaindex/liteparse/package.json','utf8')).version")"
HOST_PLATFORM="$(node -p "process.platform")"
HOST_ARCH="$(node -p "process.arch")"
REL="apps/web/public/releases"
mkdir -p "$REL" .pack/native-cache

# node platform/arch → npm optional package for LiteParse natives
# linux-x64 uses glibc (gnu). Alpine/musl is not listed on the Install page.
TARGETS=(
  "darwin:arm64:@llamaindex/liteparse-darwin-arm64"
  "darwin:x64:@llamaindex/liteparse-darwin-x64"
  "linux:x64:@llamaindex/liteparse-linux-x64-gnu"
  "linux:arm64:@llamaindex/liteparse-linux-arm64-gnu"
  "win32:x64:@llamaindex/liteparse-win32-x64-msvc"
)

pack_one() {
  local platform="$1"
  local arch="$2"
  local native_pkg="$3"
  local tarball="zipwiki-${VERSION}-${platform}-${arch}.tgz"
  local dest=".pack/package/node_modules/@llamaindex/${native_pkg#@llamaindex/}"
  local cache_tgz=".pack/native-cache/${native_pkg##*/}-${LITEPARSE_VERSION}.tgz"

  echo "[zipwiki] packing ${tarball} (LiteParse ${native_pkg}@${LITEPARSE_VERSION})…"
  rm -rf .pack/package
  cp -a .pack/zipwiki .pack/package

  # Drop host-only natives so each release carries exactly one platform package.
  rm -rf .pack/package/node_modules/@llamaindex/liteparse-*

  if [[ ! -f "$cache_tgz" ]]; then
    echo "[zipwiki] fetching ${native_pkg}@${LITEPARSE_VERSION}…"
    (
      cd .pack/native-cache
      rm -f ./*.tgz
      npm pack "${native_pkg}@${LITEPARSE_VERSION}" --silent
      packed="$(ls -1t ./*.tgz 2>/dev/null | head -1)"
      if [[ -z "$packed" || ! -f "$packed" ]]; then
        echo "[zipwiki] npm pack failed for ${native_pkg}" >&2
        exit 1
      fi
      mv "$packed" "$(basename "$cache_tgz")"
    )
  fi

  mkdir -p "$dest"
  tar -xzf "$cache_tgz" -C "$dest" --strip-components=1
  if [[ ! -f "$dest/package.json" ]]; then
    echo "[zipwiki] native package missing package.json at ${dest}" >&2
    exit 1
  fi

  COPYFILE_DISABLE=1 tar -czf ".pack/${tarball}" -C .pack package
  rm -rf .pack/package
  cp ".pack/${tarball}" "${REL}/${tarball}"
  echo "[zipwiki] website copy ${REL}/${tarball}"
}

PUBLISHED_FILES=()
for entry in "${TARGETS[@]}"; do
  IFS=':' read -r platform arch native_pkg <<<"$entry"
  pack_one "$platform" "$arch" "$native_pkg"
  PUBLISHED_FILES+=("zipwiki-${VERSION}-${platform}-${arch}.tgz")
done

cp packages/zipwiki-bundle/THIRD_PARTY_NOTICES "${REL}/THIRD_PARTY_NOTICES"

node --input-type=module --eval '
import { writeFileSync } from "node:fs";
const version = process.argv[1];
const site = process.argv[2];
const files = process.argv.slice(3).sort();
writeFileSync(
  "apps/web/public/releases/index.json",
  `${JSON.stringify({ version, files }, null, 2)}\n`,
);
writeFileSync(
  "apps/web/public/releases/latest.json",
  `${JSON.stringify({ version, url: `${site}/install` }, null, 2)}\n`,
);
' "$VERSION" "$SITE_URL" "${PUBLISHED_FILES[@]}"

echo "[zipwiki] packed base tree at $ROOT/.pack/zipwiki"
echo "[zipwiki] releases index updated (${#PUBLISHED_FILES[@]} platforms)"
echo "[zipwiki] latest.json → ${SITE_URL}/install"

HOST_TARBALL="zipwiki-${VERSION}-${HOST_PLATFORM}-${HOST_ARCH}.tgz"
if [[ ! -f ".pack/${HOST_TARBALL}" ]]; then
  echo "[zipwiki] warning: no tarball for this host (${HOST_PLATFORM}-${HOST_ARCH})" >&2
fi

if [[ "$PACK_ONLY" -eq 1 ]]; then
  echo "[zipwiki] install with: npm i -g $ROOT/.pack/${HOST_TARBALL}"
  exit 0
fi

if [[ ! -f ".pack/${HOST_TARBALL}" ]]; then
  echo "[zipwiki] cannot npm i -g: missing ${HOST_TARBALL}" >&2
  exit 1
fi

echo "[zipwiki] removing prior global installs (if any)…"
npm uninstall -g zipwiki >/dev/null 2>&1 || true
npm uninstall -g @zipwiki/zipwiki >/dev/null 2>&1 || true

echo "[zipwiki] npm i -g .pack/${HOST_TARBALL}…"
npm i -g "$ROOT/.pack/${HOST_TARBALL}"

if ! command -v zipwiki >/dev/null 2>&1 || ! command -v zipwiki-mcp >/dev/null 2>&1; then
  echo "[zipwiki] install finished but zipwiki or zipwiki-mcp is not on PATH." >&2
  echo "[zipwiki] try: export PATH=\"\$(npm prefix -g)/bin:\$PATH\"" >&2
  exit 1
fi

echo "[zipwiki] ok — $(command -v zipwiki)"
zipwiki --version
echo "[zipwiki] ok — $(command -v zipwiki-mcp)"
