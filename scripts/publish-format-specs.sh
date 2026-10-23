#!/usr/bin/env bash
# Sync public-specs/ and push to NeoWareInc/format-specs.
# Requires: gh (brew install gh) + `gh auth login`
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${PUBLIC_SPECS_DEST:-$ROOT/../format-specs}"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh not found. Install with: brew install gh" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Not logged in. Run: gh auth login" >&2
  exit 1
fi

"$ROOT/scripts/sync-public-specs.sh"
# sync wrote to public-specs; also refresh DEST if different
if [[ "$(cd "$DEST" && pwd)" != "$(cd "$ROOT/public-specs" && pwd)" ]]; then
  PUBLIC_SPECS_DEST="$DEST" "$ROOT/scripts/sync-public-specs.sh"
fi

mkdir -p "$DEST"
cd "$DEST"
if [[ ! -d .git ]]; then
  git init
  git branch -M main
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "https://github.com/NeoWareInc/format-specs.git"
fi

gh auth setup-git
git add -A
if git diff --cached --quiet; then
  echo "[format-specs] nothing new to commit"
else
  git commit -m "Sync format Application Notes from ZipWiki"
fi

git push -u origin main
echo "[format-specs] published → https://github.com/NeoWareInc/format-specs"
