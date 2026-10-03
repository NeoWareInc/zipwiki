#!/usr/bin/env bash
# Build a self-contained CLI deploy dir and install it globally (no npmjs).
# Usage:
#   ./scripts/install-cli.sh          # build + npm i -g ./.pack/zipwiki
#   ./scripts/install-cli.sh --pack   # build only (leaves .pack/zipwiki)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PACK_ONLY=0
if [[ "${1:-}" == "--pack" ]]; then
  PACK_ONLY=1
fi

echo "[zipwiki] building @zipwiki/api-client + @zipwiki/zipwiki…"
pnpm --filter @zipwiki/api-client build
pnpm --filter @zipwiki/zipwiki build

echo "[zipwiki] deploying production tree to .pack/zipwiki…"
rm -rf .pack/zipwiki
mkdir -p .pack
pnpm --filter @zipwiki/zipwiki deploy --prod --legacy .pack/zipwiki

if [[ ! -f .pack/zipwiki/dist/cli.js ]]; then
  echo "[zipwiki] missing .pack/zipwiki/dist/cli.js" >&2
  exit 1
fi

if [[ "$PACK_ONLY" -eq 1 ]]; then
  echo "[zipwiki] packed at $ROOT/.pack/zipwiki"
  echo "[zipwiki] install with: npm i -g $ROOT/.pack/zipwiki"
  exit 0
fi

echo "[zipwiki] removing prior global installs (if any)…"
npm uninstall -g zipwiki >/dev/null 2>&1 || true
npm uninstall -g @zipwiki/zipwiki >/dev/null 2>&1 || true

echo "[zipwiki] npm i -g ./.pack/zipwiki…"
npm i -g ./.pack/zipwiki

if ! command -v zipwiki >/dev/null 2>&1; then
  echo "[zipwiki] install finished but zipwiki is not on PATH." >&2
  echo "[zipwiki] try: export PATH=\"\$(npm prefix -g)/bin:\$PATH\"" >&2
  exit 1
fi

echo "[zipwiki] ok — $(command -v zipwiki)"
zipwiki --version
