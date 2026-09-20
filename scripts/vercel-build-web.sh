#!/usr/bin/env bash
# Build @zipwiki/web from either the repo root or apps/web (Vercel Root Directory).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$here/../turbo.json" ]]; then
  root="$(cd "$here/.." && pwd)"
elif [[ -f ./turbo.json ]]; then
  root="$(pwd)"
elif [[ -f ../../turbo.json ]]; then
  root="$(cd ../.. && pwd)"
else
  echo "vercel-build-web: cannot find turbo.json" >&2
  exit 1
fi

cd "$root"
pnpm exec turbo run build --filter=@zipwiki/web

if [[ ! -f apps/web/dist/index.html ]]; then
  echo "vercel-build-web: missing $root/apps/web/dist/index.html" >&2
  exit 1
fi
