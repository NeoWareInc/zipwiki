# knowledge/

Source corpora for pack / query smoke.

| Path | What |
| --- | --- |
| `test1/` | Office docs (docx / odt / pptx / xlsx) — Gettysburg + Bill of Rights |
| `test1-update/` | Replacement `gettysburg-address.docx` for `update:test1:update` |
| `test1.zipwiki` | Packed test1 example (`pnpm sample-zipwiki:test1`, gitignored) |
| `test2/` | Mixed PDFs, ODT, DOCX, fax images (includes `property-deed.pdf`) |
| `sample-docs.zipwiki` | Packed test2 example (`pnpm sample-zipwiki`, gitignored) |
| `fax/` | Extra junk-fax images |
| `florida-laws.zipwiki-origins.json` | Origin pattern for the Florida Laws pack |
| `florida-laws-2025.zipwiki` | Packed Laws of Florida 2025 (`pnpm archive:florida-laws`, gitignored) |
| `.stage/{test1,test2,florida-laws}/` | Pack staging (gitignored) |
| `.output/{test1,test2,florida-laws}/` | Packed archives + extract / origin fetch (gitignored) |

Phase 2 smoke (no login, LiteParse):

```bash
pnpm sample-zipwiki
pnpm sample-zipwiki:test1
pnpm smoke:zipwiki
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

Laws of Florida 2025 — package is `knowledge/florida-laws-2025.zipwiki`
(not committed). Source PDFs live at `$HOME/Documents/florida-laws/2025-pdf`
(253 `Ch_2025-*.pdf` files). `pnpm archive:florida-laws` packs them with
originals omitted, stage tree `knowledge/.stage/florida-laws`, and the origin
rule from `florida-laws.zipwiki-origins.json` (`Ch_2025-001.pdf` →
`https://laws.flrules.org/2025/1`, CRC-32 of the original). Parser and OKF
follow the saved settings. The pack prints the plan and waits before it
writes. `-T` runs the integrity test when the archive is written. Extracts
go to `.output/florida-laws/`.

```bash
pnpm archive:florida-laws
pnpm archive:florida-laws-failed   # five largest chapters from the missed-parse batch
pnpm test:florida-laws
pnpm list:florida-laws
pnpm verify:florida-laws-origins   # origin URL, or the original PDF stored in the archive
pnpm origin:florida-laws:fetch
```
