# knowledge/

Source corpora and packed `.zipwiki` examples for pack / query smoke.

Digests below come from each package’s `ai.digest` (via ZipWiki MCP `open`).
**Originals in package** means primary bytes are stored in the ZIP
(`hasOriginal` / not `sourceIncluded: false`). **Parse-only** packages omit
those bytes and keep Extra Field `0x014F` origin metadata when present.
**org/cmp** is PKZIP-style original / compressed (`ai.originalBytes` / package
file size). The **%** is PKZIP’s compression ratio:
`(1 − cmp/org) × 100` (space saved vs the source corpus).

## Packages

| Package | Docs | Originals in package | org/cmp |
| --- | ---: | --- | ---: |
| [`florida-laws-2025.zipwiki`](florida-laws-2025.zipwiki) | 253 / 253 parsed | No (origins → laws.flrules.org) | 18.0 MB/2.3 MB (87%) |
| [`charles-dickens.zipwiki`](charles-dickens.zipwiki) | 67 / 67 parsed | No (origins → gutenberg.org) | 19.6 MB/12.4 MB (37%) |
| [`medical-pdfs.zipwiki`](medical-pdfs.zipwiki) | 60 / 60 parsed | **Yes** (`--include-original`) | 19.7 MB/19.8 MB (0%) |

| Package | Digest |
| --- | --- |
| [`florida-laws-2025.zipwiki`](florida-laws-2025.zipwiki) | 253 documents: Florida session laws 2025, chapters 2025-1 through 2025-253. Covers immigration enforcement, Gulf of America renaming, statute adoption/reviser’s bills, elections/petitions, education and school safety, insurance and health, criminal law and corrections, firearms and drones, landlord/housing, budget/appropriations (198–201), plus local special acts (e.g. Leon County). |
| [`charles-dickens.zipwiki`](charles-dickens.zipwiki) | 67 documents: Project Gutenberg Charles Dickens — novels, Christmas/holiday tales, sketches, speeches, letters, and poems (Bleak House, David Copperfield, Great Expectations, Hard Times, Little Dorrit, Nickleby, Oliver Twist, Pickwick, unfinished Edwin Drood, co-writes with Collins, etc.). |
| [`medical-pdfs.zipwiki`](medical-pdfs.zipwiki) | 59 documents: Clinical records for two patients who transitioned to home hospice (Sep 2026) — Leland T. Marchetti (Cheyenne Bluffs; metastatic pancreatic cancer / cholangitis) and Marguerite L. Ostrander (Boulder Valley; stage IVB lung adenocarcinoma with brain mets), including H&Ps, imaging, consults, discharge, and hospice notes. |

### Originals vs parse-only

| Mode | Packages | Notes |
| --- | --- | --- |
| **Originals in ZIP** | `medical-pdfs.zipwiki` | Packed with `--include-original`. Package size ≈ source corpus. |
| **Parse + OKF only** | `florida-laws-2025`, `charles-dickens` | Primaries omitted; fetch via `origin` / Extra Field `0x014F`. Best compression on large PDFs (`florida-laws-2025`). |
