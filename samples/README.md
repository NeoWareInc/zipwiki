# samples/

Source corpora for pack / zipaccess smoke.

| Path | What |
| --- | --- |
| `test1/` | Office docs (docx / odt / pptx / xlsx) — Gettysburg + Bill of Rights |
| `test1-update/` | Replacement `gettysburg-address.docx` for `update:test1:update` |
| `test2/` | Mixed PDFs, ODT, DOCX, fax images (includes `property-deed.pdf`) |
| `fax/` | Extra junk-fax images |
| `florida-laws.zipwiki-origins.json` | Origin pattern for the Florida Laws pack |
| `florida-laws-of-florida.zipwiki` | Local Florida Laws package (gitignored) |
| `.stage/{test1,test2}/` | Pack staging (gitignored) |
| `.output/{test1,test2,florida-laws}/` | Packed archives + extract / origin fetch (gitignored) |

Phase 2 smoke (no login, LiteParse):

```bash
pnpm sample-zipwiki
pnpm smoke:zipaccess
```

Stage / pack (writes `.output/test1/test1.zipwiki` + extract):

```bash
pnpm archive:test1
pnpm archive:test2
pnpm archive              # test1 and test2
```

Query a packed sample:

```bash
pnpm list:test1
pnpm test:test1
pnpm read:test1
pnpm origin:test2
```

Florida Laws — local package is `samples/florida-laws-of-florida.zipwiki`
(not committed). Source PDFs for a rebuild live at
`$HOME/Documents/Florida-Laws-of-Florida/2025-pdf`. Extracts go to
`.output/florida-laws/`.

```bash
pnpm list:florida-laws
pnpm verify:florida-laws-origins
pnpm origin:florida-laws:fetch
pnpm archive:florida-laws   # only if you need to rebuild
```
