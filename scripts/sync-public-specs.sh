#!/usr/bin/env bash
# Sync format Application Notes from private doc/ into public-specs/.
# public-specs/ is the tree to push to the public NeoWareInc/format-specs repo
# (and the source the marketing site renders at /docs/*).
#
# Usage:
#   pnpm sync:public-specs
#   PUBLIC_SPECS_DEST=/path/to/format-specs pnpm sync:public-specs
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/doc"
STAGING="$ROOT/public-specs"
DEST="${PUBLIC_SPECS_DEST:-$STAGING}"

mkdir -p "$DEST"

copy_rewritten() {
  local from="$1"
  local to="$2"
  # Flatten NeoZip path and retarget cross-links for a flat public tree.
  # Product-only docs (ZIPACCESS, CLI, …) stay private — point at the site.
  sed -E \
    -e 's|\]\(\./format/NEOZIP_APPNOTE\.md\)|](./NEOZIP_APPNOTE.md)|g' \
    -e 's|\]\(\.\./ZIPWIKI_APPNOTE\.md\)|](./ZIPWIKI_APPNOTE.md)|g' \
    -e 's|\]\(\.\./OKF_SPEC\.md\)|](./OKF_SPEC.md)|g' \
    -e 's|\]\(\.\./OKF_ZIPWIKI_VS_SPEC\.md\)|](./OKF_ZIPWIKI_VS_SPEC.md)|g' \
    -e 's|\]\(\./ZIPACCESS\.md\)|](https://zipwiki.ai/mcp)|g' \
    -e 's|\]\(\./CLI\.md\)|](https://zipwiki.ai/mcp)|g' \
    -e 's|\]\(\./MCP\.md\)|](https://zipwiki.ai/mcp)|g' \
    -e 's|\]\(\./APPNOTE\.TXT\)|](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT)|g' \
    -e 's|\]\(\.\./APPNOTE\.TXT\)|](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT)|g' \
    "$from" > "$to"
}

copy_rewritten "$SRC/ZIPWIKI_APPNOTE.md" "$DEST/ZIPWIKI_APPNOTE.md"
copy_rewritten "$SRC/format/NEOZIP_APPNOTE.md" "$DEST/NEOZIP_APPNOTE.md"
copy_rewritten "$SRC/OKF_SPEC.md" "$DEST/OKF_SPEC.md"
copy_rewritten "$SRC/OKF_ZIPWIKI_VS_SPEC.md" "$DEST/OKF_ZIPWIKI_VS_SPEC.md"

cat > "$DEST/README.md" <<'EOF'
# NeoWare format specifications

**Public** Application Notes and language specs for NeoZip / ZipWiki / OKF.

The ZipWiki product repository stays private. These files are the citable
source of truth for the on-disk formats and may be linked from zipwiki.ai,
neozip.io, and partner sites.

| Document | Role |
| --- | --- |
| [ZIPWIKI_APPNOTE.md](ZIPWIKI_APPNOTE.md) | `.zipwiki` producer & AI layout profile |
| [NEOZIP_APPNOTE.md](NEOZIP_APPNOTE.md) | `.nzip` / NeoZip container profile (parent) |
| [OKF_SPEC.md](OKF_SPEC.md) | Open Knowledge Format v0.2 |
| [OKF_ZIPWIKI_VS_SPEC.md](OKF_ZIPWIKI_VS_SPEC.md) | ZipWiki OKF producer profile vs OKF v0.2 |

## Rendered copies

- ZipWiki: https://zipwiki.ai/docs
- NeoZip.io: link the same GitHub files or embed / mirror as needed

## Updating from the private ZipWiki repo

```bash
# In the private zipwiki checkout:
pnpm sync:public-specs
# Optional: also write into a sibling format-specs clone
PUBLIC_SPECS_DEST=../format-specs pnpm sync:public-specs
# Then commit & push the public repo.
```

Do not copy product docs (CLI, MCP, Convex, BETA) into this tree.
EOF

echo "[public-specs] synced → $DEST"
ls -la "$DEST"
