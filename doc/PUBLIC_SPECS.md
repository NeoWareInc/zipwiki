# Public format specs (hybrid)

The **ZipWiki product repository stays private**. Format Application Notes are
published separately so zipwiki.ai, NeoZip.io, and partners can cite them.

## Two surfaces

| Surface | URL | Role |
| --- | --- | --- |
| Rendered | `https://zipwiki.ai/docs` | Readable HTML on the marketing site |
| Raw markdown | `https://github.com/NeoWareInc/format-specs` | Canonical, citable source |

Files in this private repo under `doc/` remain the authoring originals.
`public-specs/` is the flattened export tree (committed) that the site bundles
and that you push to the public GitHub repo.

## Sync

```bash
# Refresh public-specs/ from doc/
pnpm sync:public-specs

# Also write into a sibling clone of the public repo
PUBLIC_SPECS_DEST=../format-specs pnpm sync:public-specs
cd ../format-specs && git add -A && git status
```

Published files only:

- `ZIPWIKI_APPNOTE.md`
- `NEOZIP_APPNOTE.md`
- `OKF_SPEC.md`
- `OKF_ZIPWIKI_VS_SPEC.md`
- `README.md`

Do **not** export CLI, MCP, Convex, BETA, or other product docs.

## Create the public repo (once)

```bash
# From a parent directory (example)
mkdir format-specs && cd format-specs
git init
# copy from zipwiki/public-specs or run PUBLIC_SPECS_DEST=... sync
gh repo create NeoWareInc/format-specs --public --source=. --remote=origin --push
```

## NeoZip.io

Link either:

- Rendered: `https://zipwiki.ai/docs/neozip-appnote` (or host a mirror)
- Raw: `https://github.com/NeoWareInc/format-specs/blob/main/NEOZIP_APPNOTE.md`
