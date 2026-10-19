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

prod_releases="$root/apps/web/public/releases"
dev_releases="$root/apps/web/public/dev-releases"
examples_dir="$root/apps/web/public/examples"
example_names=(
  florida-laws-2025.zipwiki
  earnings-2025.zipwiki
  medical-pdfs.zipwiki
  charles-dickens.zipwiki
)

# Production must never serve rehearsal tarballs (even if someone merges them).
if [[ "${VERCEL_ENV:-}" == "production" ]]; then
  if [[ -d "$dev_releases" ]]; then
    echo "vercel-build-web: stripping apps/web/public/dev-releases (production)"
    rm -rf "$dev_releases"
  fi
fi

validate_releases_index() {
  local dir="$1"
  local label="$2"
  if [[ ! -f "$dir/index.json" ]]; then
    return 0
  fi
  node --input-type=module -e '
    import { existsSync, readFileSync } from "node:fs";
    import { join } from "node:path";
    const dir = process.argv[1];
    const label = process.argv[2];
    const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
    const missing = (index.files ?? []).filter(
      (name) => typeof name !== "string" || !existsSync(join(dir, name)),
    );
    if (missing.length > 0) {
      console.error(
        `vercel-build-web: index.json lists release files that are not in ${label}:`,
      );
      for (const name of missing) console.error(`  ${name}`);
      console.error(
        "npm i -g https://<host>/<releases-dir>/<file> would download the website HTML.",
      );
      process.exit(1);
    }
  ' "$dir" "$label"
}

validate_releases_index "$prod_releases" "apps/web/public/releases"
if [[ -d "$dev_releases" ]]; then
  validate_releases_index "$dev_releases" "apps/web/public/dev-releases"
fi

missing_examples=()
for name in "${example_names[@]}"; do
  if [[ ! -f "$examples_dir/$name" ]]; then
    missing_examples+=("$name")
  fi
done
if ((${#missing_examples[@]} > 0)); then
  echo "vercel-build-web: missing Query sample packages in apps/web/public/examples:" >&2
  for name in "${missing_examples[@]}"; do
    echo "  $name" >&2
  done
  echo "Copy them from the ZipWiki shared Drive (or knowledge/) before deploy." >&2
  exit 1
fi

pnpm exec turbo run build --filter=@zipwiki/web

if [[ ! -f apps/web/dist/index.html ]]; then
  echo "vercel-build-web: missing $root/apps/web/dist/index.html" >&2
  exit 1
fi
