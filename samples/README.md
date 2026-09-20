# samples/

Source corpora for pack / zipaccess smoke. Generated `.zipwiki`, `.stage/`,
and `*-output/` trees are gitignored.

| Folder | What |
| --- | --- |
| `test1/` | Office docs (docx / odt / pptx / xlsx) — Gettysburg + Bill of Rights |
| `test1-update/` | Replacement `gettysburg-address.docx` for `update:test1:update` |
| `test2/` | Mixed PDFs, ODT, DOCX, fax images (includes `property-deed.pdf`) |
| `fax/` | Extra junk-fax images |
| `florida-laws.zipwiki-origins.json` | Origin pattern for the Florida Laws pack |
| `florida-laws-origin-output/` | Fetched original for `Ch_2025-001.pdf` |

Phase 2 smoke (no login, LiteParse):

```bash
pnpm sample-zipwiki
pnpm smoke:zipaccess
```

Stage / pack the lab corpora (writes `samples/test1.zipwiki` + extract):

```bash
pnpm parse:test1          # or parse:test2
pnpm okf:test1
pnpm manifest:test1
pnpm archive:test1        # parse + okf + manifest + pack + extract
pnpm archive              # test1 and test2
```

Query a packed sample:

```bash
pnpm list:test1
pnpm test:test1
pnpm read:test1
pnpm origin:test2
```

Florida Laws (PDFs live outside the repo at
`$HOME/Documents/Florida-Laws-of-Florida/2025-pdf`):

```bash
pnpm archive:florida-laws
pnpm verify:florida-laws-origins
pnpm origin:florida-laws:fetch
```
