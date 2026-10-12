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

releases="$root/apps/web/public/releases"
if [[ -f "$releases/index.json" ]]; then
  node --input-type=module -e '
    import { existsSync, readFileSync } from "node:fs";
    import { join } from "node:path";
    const dir = process.argv[1];
    const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
    const missing = (index.files ?? []).filter(
      (name) => typeof name !== "string" || !existsSync(join(dir, name)),
    );
    if (missing.length > 0) {
      console.error(
        "vercel-build-web: index.json lists release files that are not in apps/web/public/releases:",
      );
      for (const name of missing) console.error(`  ${name}`);
      console.error(
        "npm i -g https://zipwiki.ai/releases/<file> would download the website HTML.",
      );
      process.exit(1);
    }
  ' "$releases"
fi

pnpm exec turbo run build --filter=@zipwiki/web

if [[ ! -f apps/web/dist/index.html ]]; then
  echo "vercel-build-web: missing $root/apps/web/dist/index.html" >&2
  exit 1
fi
