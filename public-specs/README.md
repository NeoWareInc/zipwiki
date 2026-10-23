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
