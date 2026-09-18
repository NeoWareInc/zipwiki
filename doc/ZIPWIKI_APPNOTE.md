# ZipWiki Application Note

| | |
| :---- | :---- |
| **Format** | `.zipwiki` (ZIP / NeoZip profile with ZipWiki AI extensions) |
| **Specification version** | **0.2.0-draft** |
| **Status** | Draft — ZipWiki extensions to PKWARE APPNOTE 6.3.10 via NeoZip 0.2 |
| **Document date** | 2026-09-16 |
| **Parent specification** | [NEOZIP_APPNOTE.md](./format/NEOZIP_APPNOTE.md) (NeoZip 0.2.0-draft) |
| **Base specification** | [APPNOTE.TXT](./APPNOTE.TXT) (PKWARE `.ZIP` File Format Specification, Version 6.3.10) |
| **Related** | [OKF_SPEC.md](./OKF_SPEC.md) · [OKF producer profile](./OKF_ZIPWIKI_VS_SPEC.md) · [ZIPACCESS.md](./ZIPACCESS.md) |

This file in the repository is the **ZipWiki packaging note**: how **zipwiki**
writes (and **zipaccess** reads) AI materials inside a NeoZip archive. The
parent [NEOZIP_APPNOTE.md](./format/NEOZIP_APPNOTE.md) remains the on-wire NeoZip
contract (integrity Extra Fields, Merkle, blockchain sidecars, encryption).
This note **copies** those AI-root rules and **adds** producer conventions
that do not belong in the NeoZip app note.

---

## 0. Purpose and relationship to NeoZip

ZipWiki is the **write** surface (`zipwiki pack` / `pack`). It
emits a valid NeoZip archive whose extra payload is an **AI-readable wiki
tree**: optional whole-document parses, optional OKF concepts, and a
`META-INF/manifest.json` `ai` registry so agents can discover them without
inflating every primary.

1. Every `.zipwiki` file **MUST** be a valid ZIP per PKWARE APPNOTE 6.3.10 and
   a valid NeoZip profile archive per [NEOZIP_APPNOTE.md](./format/NEOZIP_APPNOTE.md).
2. This note **adds** ZipWiki entry-name conventions under a single AI root
   (`wiki/` by default), parsed-text pairing, OKF placement, omit-original
   policy, collision rewrite, and the `ai` object schema ZipWiki emits.
3. Features not present in a given archive are simply absent. Readers
   **MUST** ignore unknown Extra Fields and unknown reserved meta entries
   (APPNOTE §4.5 / §4.6).
4. Where this document conflicts with PKWARE on wire layout, **PKWARE wins**.
   Where it conflicts with NeoZip on integrity / encryption / sidecars,
   **NeoZip wins**. Where it defines ZipWiki-only conventions (AI root,
   `parsed/`, `okf/`, `ai.*` producer fields), this document wins for
   ZipWiki-aware tools.

**Integrity, minting, timestamping, and recipient decryption do not require
ZipWiki AI materials.** Those are NeoZip L1–L3 / **+Access** features. ZipWiki
packages **MAY** omit all AI roots and still be valid NeoZip; they **MUST**
include `META-INF/manifest.json` with a valid `ai` object whenever any
material under an AI root is present (NeoZip L4).

Product architecture (ingest phases, hosted parse quotas, dashboard UI) is
summarized here only where it shapes on-disk members. CLI flags live in
[CLI.md](./CLI.md). Local
read/search is [ZIPACCESS.md](./ZIPACCESS.md).

---

## 1. Two reserved namespaces

### 1.1 `META-INF/` — package metadata (NeoZip)

ZipWiki does **not** invent a parallel metadata tree. It uses NeoZip
`META-INF/`:

| Entry | Role |
| :---- | :---- |
| `META-INF/manifest.json` | Advanced features manifest — **required** when ZipWiki AI materials are present |
| `META-INF/TOKEN.NZIP` | On-chain token binding (optional; NeoZip) |
| `META-INF/TIMESTAMP.NZIP` | Confirmed timestamp proof (optional; NeoZip) |
| `META-INF/TS-SUBMIT.NZIP` | Pending timestamp submit (optional; NeoZip) |
| `META-INF/ACCESS.NZIP` | Recipient / hybrid encryption sidecar (optional; NeoZip) |

**Forbidden for new ZipWiki packages:** parse trees, OKF, or other AI
materials under `META-INF/`. Those belong under the AI root (§1.2).

**NeoZip discovery** (any one is enough): Extra Field `0x014E` on content
entries; or `META-INF/*.NZIP` sidecars; or `META-INF/manifest.json` with
`"format": "neozip"`. Absence of all of these means a plain ZIP (or another
profile). ZipWiki writers **SHOULD** always emit the manifest when packing
knowledge packages, even if OKF is skipped.

### 1.2 AI root — ZipWiki wiki namespace

ZipWiki AI materials live under a **single top-level AI root directory**
named by the writer and declared in the manifest (`ai.root`). When any
material under an AI root is present, `META-INF/manifest.json` **MUST** be
present and include a valid `ai` object (§5).

| Directory | Recommendation |
| :---- | :---- |
| **`wiki/`** | **ZipWiki default.** Parse + OKF as a readable wiki tree |
| **`ai/`** | Shortest and universal |
| **`context/`** | Aligns with LLM engineering (“context window”, “retrieval context”) |

Writers **MUST** use exactly one of these roots (or another root only if a
future profile documents it). Mixing multiple AI roots in one package is
**invalid**. New writers **MUST** emit `wiki/` unless they have a reason to
choose `ai/` or `context/`.

**Layout under the AI root** (ZipWiki default `wiki/`):

```
archive.zipwiki
├── META-INF/
│   ├── manifest.json              # Advanced features manifest (required with AI)
│   └── TOKEN.NZIP                 # Blockchain metadata (optional)
├── document.pdf                   # Primary content (MAY be omitted when parsed — §6.4)
├── notes.docx                     # Primary without parse still belongs at zip root
└── wiki/                          # AI root (ai.root)
    ├── okf/                       # Optional Open Knowledge Format tree (§7)
    │   ├── index.md               # Bundle listing + okf_version (ZipWiki SHOULD emit)
    │   ├── document.md            # Concept for document.pdf (stem = primary basename)
    │   └── notes.md               # Concept for notes.docx (even when parse is missing)
    └── parsed/                    # Optional parsed text per primary
        ├── document.pdf.md
        └── document.pdf.assets/
            └── image_1.png
```

ZipWiki producers emit **one OKF concept file per primary** under
`{R}/okf/{stem}.md` (stem = primary basename without extension), plus
optional `index.md`. A legacy package-level `document.md` alone is still
valid OKF, but new writers **SHOULD** prefer per-primary concepts. OKF
**MAY** be omitted entirely (`ai.okf` absent / `present: false`) while still
shipping `parsed/` (and vice versa).

Layouts with `ai/` or `context/` match this structure except for the
top-level directory name.

### 1.3 Path case rules

**Writers MUST** emit:

- `META-INF/` (uppercase) whenever any reserved meta entry is written
- `META-INF/manifest.json` when package AI materials are present
- AI root: `wiki/`, `ai/`, or `context/` exactly as declared in the
  manifest when AI materials are present
- Uppercase NeoZip blockchain / access files when those features are used
  (`TOKEN.NZIP`, `TIMESTAMP.NZIP`, `TS-SUBMIT.NZIP`, `ACCESS.NZIP`)

**Readers MUST** match reserved `META-INF/**` paths with ASCII
case-insensitive comparison (NeoZip §1.3). If more than one
central-directory entry matches the same reserved meta target, the archive
is **malformed**.

Primary paths and AI-tree paths are case-preserving as stored.

---

## 2. Filename: `.zipwiki`

| Rule | Requirement |
| :---- | :---- |
| **Preferred extension** | `*.zipwiki` — ZipWiki writers **SHOULD** emit this |
| **Legacy extension** | `*.nzip` — still a valid NeoZip / ZipWiki package; readers **MUST** accept it |
| **Also valid** | `*.zip` with NeoZip Extra Fields / sidecars / `"format": "neozip"` manifest |

Default package name for zipaccess / MCP when no path is given:
`wiki.zipwiki` in the process working directory.

Single-file pack default output: `<source-basename>.zipwiki` beside the
source. Multi-file pack requires an explicit `-o` / `--output-dir`.

The container remains a standard ZIP. The extra suffix is a **profile
hint**, not a different codec.

---

## 3. Entry classes and package shapes

### 3.1 Classification

Without an AI root, every entry outside `META-INF/` is primary content.

With ZipWiki AI materials, `META-INF/manifest.json` **MUST** be present. Let
`R` be the AI root from the manifest (`ai.root`, one of `wiki`, `ai`,
`context`):

```
if path starts with META-INF/     → meta (manifest / blockchain / access)
else if path starts with R + "/"  → ai-namespace (parsed / okf / …)
else                               → primary content
```

Within the AI namespace:

```
R/okf/**                → OKF knowledge (optional)
R/parsed/<P>.md         → parsed text for primary <P> (optional per primary)
R/parsed/<P>.assets/**  → figure binaries for primary <P>
```

### 3.2 Pairing (verify)

Applies when an AI root is present (and thus a manifest):

- Parsed entry `R/parsed/P.md` **MUST** have primary entry `P`, **unless** the
  primary was intentionally omitted (`ai.primaries[].sourceIncluded: false`)
  for a document format that has a successful parse. Orphans otherwise fail.
- Asset paths under `R/parsed/P.assets/` **MUST** have primary `P`; **SHOULD**
  also have matching `R/parsed/P.md`.
- Absence of parse or OKF for a primary is **normal**.
- **Omit-original (extract-only) packages:** When a writer stores only the
  parse for an omittable document type and sets
  `ai.primaries[].sourceIncluded: false`, the parse path still uses `P` as if
  the primary existed. Readers **MUST** treat CD absence of `P` as
  intentional in that case — not as an orphan-parse failure. Plain text and
  markdown **SHOULD** remain as primaries even when a parse exists.
- **Unparsed primaries:** A primary **MAY** appear at zip root with
  `hasParsed: false` and still have an OKF concept that cites it (agents
  learn the file is in the package even when extract failed).

**Tables** live **inside** `R/parsed/P.md` as markdown. ZipWiki does **not**
emit separate table zip members.

**Merkle construction** (NeoZip §7) uses every non-`META-INF/`
central-directory entry, including the AI root when present. Classification
above is for open/routing only and does **not** require a manifest.

### 3.3 ZipWiki archive (standard `wiki/` root)

**Full layout** (parses + per-primary OKF; ZipWiki default):

```
archive.zipwiki
├── META-INF/
│   └── manifest.json
├── report.pdf                     # MAY be omitted when parsed + sourceIncluded:false
├── notes.txt
├── legacy.docx                    # Kept when parse failed / was skipped
└── wiki/
    ├── parsed/
    │   ├── report.pdf.md
    │   └── notes.txt.md
    └── okf/
        ├── index.md               # okf_version + # Files listing
        ├── report.md              # Concept for report.pdf
        ├── notes.md
        └── legacy.md              # Concept may exist without a parse
```

**Parse-only layout** (no OKF tree — valid ZipWiki / NeoZip L4 when `ai`
declares `parsed/` and omits `ai.okf` or sets `present: false`):

```
archive.zipwiki
├── META-INF/
│   └── manifest.json              # ai.okf omitted or present:false
├── report.pdf                     # or omitted when extract-only
└── wiki/
    └── parsed/
        └── report.pdf.md
```

Manifest **required** when any AI root material is present:

```
packet.zipwiki
  META-INF/manifest.json          # Advanced features control
  META-INF/TOKEN.NZIP              # optional
  report.pdf
  budget.xlsx
  cover.png
  wiki/
    okf/
      index.md
      report.md
      budget.md
      cover.md
    parsed/
      report.pdf.md
      report.pdf.assets/
        image_1.png
      budget.xlsx.md
```

Single- and multi-primary packages use the same layout. ZipWiki writers
**MAY** order central-directory entries as manifest → AI tree → primaries;
that order is a producer preference, **not** a PKWARE APPNOTE requirement.

---

## 4. `META-INF/manifest.json` — ZipWiki use of the advanced features file

NeoZip defines `manifest.json` as an **optional** control surface for
advanced package features (not exclusive to AI). ZipWiki **requires** it
whenever an AI root is present.

When present, it **MUST**:

1. Set `format` to `"neozip"`.
2. Set `specVersion` to at least `"0.2.0"` for ZipWiki AI-root packages.
3. Set `createdAt` to an ISO-8601 creation time (UTC recommended).

When present, ZipWiki writers **SHOULD**:

1. List `profiles` including `"zipwiki"` (add `"integrity"` when Extra Field
   `0x014E` is written; add `"tokenized"` / `"timestamped"` /
   `"access-controlled"` when those NeoZip features are used).
2. Include the `ai` object (§5). **MUST** include `ai` when AI materials
   exist; **MUST** omit `ai` when they do not.

The **ZIP central directory** is authoritative for entry names, sizes,
methods, CRC-32, and offsets. Per-entry SHA-256 **MAY** use Extra Field
`0x014E` (NeoZip §7) when the writer opts in. Sidecar proofs under
`META-INF/*.NZIP` remain authoritative for chain and access operations even
when the manifest summarizes them.

### 4.1 Placement (when written)

1. **Path:** `META-INF/manifest.json`
2. **Position:** **SHOULD** be the first local-file entry and first
   central-directory entry (APPNOTE §4.1.11 / §4.7.2).
3. **Encoding:** UTF-8 JSON.
4. **Compression:** **RECOMMENDED** Store (0).
5. **Encryption** of the manifest is **DISCOURAGED** when discovery matters.
6. Unknown keys **MUST NOT** cause rejection. Writers **SHOULD** preserve
   unknown keys on round-trip when practical.

---

## 5. The `ai` object (element registry)

`ai` declares where ZipWiki materials live and what is present. It is
**AI-only**. Other top-level fields (`format`, `specVersion`, `createdAt`,
`profiles`) apply to advanced NeoZip packages generally.

| Field | Type | Required | Description |
| :---- | :---- | :---- | :---- |
| `root` | string | **REQUIRED** when AI present | AI root directory name: `"wiki"`, `"ai"`, or `"context"` (no trailing slash). ZipWiki default: `"wiki"` |
| `parsedDir` | string | RECOMMENDED | Relative parse directory under root; default `"parsed"` |
| `primaryCount` | number | RECOMMENDED | Count of primary content entries (including omitted originals listed in `primaries[]`) |
| `parsedCount` | number | RECOMMENDED | Count of files under `R/parsed/**` that end in `.md` and are not under `.assets/` |
| `assetEntryCount` | number | OPTIONAL | Count of zip entries under any `R/parsed/**/**.assets/` |
| `digest` | string | OPTIONAL | Package-level one-line summary |
| `okf` | object | OPTIONAL | OKF availability (§5.2) |
| `parser` | object | OPTIONAL | Default parse engine (§5.3) |
| `primaries` | array | OPTIONAL | Advisory per-primary summary (§5.1). **Not** an inventory — ZIP central directory + Extra Field `0x014E` remain authoritative |

### 5.1 `ai.primaries[]` (advisory)

Compact hints for agents and ZipWiki tools. Writers **SHOULD** keep entries
aligned with primary zip paths after collision rewrite (§8). Verifiers and
Merkle construction **MUST NOT** require this array.

Do **not** duplicate data already authoritative elsewhere:

- Basename / entry identity → ZIP central directory (`path` is enough)
- Content SHA-256 → Extra Field `0x014E` on the primary entry
- Per-file prose summary → OKF concept `description` under `{ai.root}/okf/`

| Field | Type | Description |
| :---- | :---- | :---- |
| `path` | string | Zip entry name after collision rewrite (e.g. `report.pdf` or `content/2/report.pdf`) |
| `mimeType` | string | OPTIONAL |
| `documentType` | string | OPTIONAL ZipWiki category / OKF type hint (`Financial_Report`, `Legal_Contract`, `Receipt_Scan`, `Technical_Doc`, `Generic`, …) |
| `hasParsed` | boolean | `true` when `{ai.root}/parsed/{path}.md` is present |
| `sourceIncluded` | boolean | OPTIONAL. When `false`, primary bytes were intentionally omitted from the ZIP. Omit the field or set `true` when the primary entry is present. Readers **MUST NOT** treat CD absence of `path` as an orphan-parse failure when this is `false`. |

ZipWiki **does not** write `originalName`, `contentSha256`, or per-primary
`digest` into this array. Those belong on the CD (CRC-32), optional Extra
Field `0x014E`, optional Extra Field `0x014F` SHA-256 of the original
primary, and/or OKF.

**Path construction:**

| Artifact | Path |
| :---- | :---- |
| OKF root | `{root}/okf/` |
| OKF concept for primary `P` | `{root}/okf/{stem}.md` where `stem` is the basename of `P` without its final extension (e.g. `report.pdf` → `report.md`) |
| OKF index | `{root}/okf/index.md` (optional; ZipWiki SHOULD emit) |
| Parsed text for primary `P` | `{root}/{parsedDir}/{P}.md` |
| Assets for primary `P` | `{root}/{parsedDir}/{P}.assets/{filename}` |

With defaults `root = "wiki"` and `parsedDir = "parsed"`:

| Primary `P` | Parsed text | OKF concept | Assets dir |
| :---- | :---- | :---- | :---- |
| `document.pdf` | `wiki/parsed/document.pdf.md` | `wiki/okf/document.md` | `wiki/parsed/document.pdf.assets/` |
| `docs/a/r.xlsx` | `wiki/parsed/docs/a/r.xlsx.md` | `wiki/okf/r.md` | `wiki/parsed/docs/a/r.xlsx.assets/` |
| `content/2/report.pdf` | `wiki/parsed/content/2/report.pdf.md` | `wiki/okf/report.md` | `wiki/parsed/content/2/report.pdf.assets/` |

**Example:**

```json
{
  "format": "neozip",
  "specVersion": "0.2.0",
  "createdAt": "2026-09-16T15:40:00Z",
  "profiles": ["zipwiki"],
  "ai": {
    "root": "wiki",
    "parsedDir": "parsed",
    "primaryCount": 3,
    "parsedCount": 2,
    "assetEntryCount": 1,
    "digest": "Sample packet with structured PDF and spreadsheet.",
    "okf": {
      "present": true,
      "root": "wiki/okf/",
      "index": "wiki/okf/index.md",
      "version": "0.2"
    },
    "parser": {
      "engine": "liteparse",
      "engineVersion": "2.9.0"
    },
    "primaries": [
      {
        "path": "report.pdf",
        "mimeType": "application/pdf",
        "documentType": "Financial_Report",
        "hasParsed": true,
        "sourceIncluded": false
      },
      {
        "path": "budget.xlsx",
        "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "documentType": "Spreadsheet",
        "hasParsed": true,
        "sourceIncluded": false
      },
      {
        "path": "cover.png",
        "mimeType": "image/png",
        "documentType": "Generic",
        "hasParsed": true
      }
    ]
  }
}
```

**AI read algorithm (ZipWiki / zipaccess):**

1. Open ZIP; parse `META-INF/manifest.json` (required for this path).
2. If `format != "neozip"`, treat as ordinary ZIP (no AI claims).
3. Read `ai.digest` / `profiles` for relevance.
4. Let `R = ai.root` (ZipWiki default `"wiki"` if missing on a ZipWiki-made
   archive that still has a `wiki/` tree — prefer the declared value).
5. If `ai.okf.present`, open OKF at `ai.okf.index` / `ai.okf.root` (§7).
6. For primary `P`, open `{R}/{parsedDir}/{P}.md` when present; resolve
   assets under `{R}/{parsedDir}/{P}.assets/`.
7. Open original `P` when original bytes are required and
   `sourceIncluded` is not `false` (or when the CD still contains `P`).
   If `P` is omitted, use Extra Field `0x014F` on the parse member (§6.7).
8. If integrity or token profiles claim trust, verify using Extra Field
   `0x014E` and blockchain sidecars per NeoZip §7–§8.

### 5.2 `ai.okf` object

| Field | Type | Description |
| :---- | :---- | :---- |
| `present` | boolean | `true` when an OKF tree is in the package |
| `root` | string | Zip prefix, normally `"{ai.root}/okf/"` e.g. `"wiki/okf/"` |
| `index` | string | Bundle root markdown with `okf_version`, e.g. `"wiki/okf/index.md"` |
| `version` | string | OKF language version (e.g. `"0.2"`) |

If omitted or `present` is false, tools **MUST NOT** expect OKF.

Writers **MUST** keep `ai.okf` consistent with the central directory. When
no OKF members exist, writers **MUST** omit `ai.okf` or set
`present: false`.

### 5.3 `ai.parser` object (optional)

| Field | Type | Description |
| :---- | :---- | :---- |
| `engine` | string | e.g. `"liteparse"`, `"llamaparse"` |
| `engineVersion` | string | Optional (installed `@llamaindex/liteparse` / `@llamaindex/llama-cloud` version) |
| `notes` | string | Optional free text |
| `includeComplexity` | boolean | OPTIONAL — `true` when pack collected per-page complexity |
| `complexity` | object | OPTIONAL — rollup of LiteParse complexity / layout risk (§5.3.1) |
| `ocrConfidence` | object | OPTIONAL — aggregate of per-text-item OCR confidence when present (§5.3.2) |
| `route` | object | OPTIONAL — pack-time routing (§5.3.3), e.g. auto-escalation |

`complexity` and `ocrConfidence` are **routing / inspection signals**, not a
document-level parse-accuracy score. Native PDF text usually has no OCR
confidence (`ocrConfidence.scoredItemCount === 0`).

Collection packs **MAY** merge per-primary parser summaries into one
package-level `ai.parser` block (histogram sums, concatenated `pages[]`).

#### 5.3.1 `ai.parser.complexity`

NeoZip lists the compact rollup. ZipWiki **MAY** also emit the extra
per-page fields LiteParse provides (not required for NeoZip readers):

| Field | Type | Description |
| :---- | :---- | :---- |
| `pageCount` | number | Pages with complexity attached |
| `needsOcrCount` / `needsOcrRatio` | number | Pages flagged `needsOcr` |
| `layoutComplexCount` / `layoutComplexRatio` | number | Pages with layout difficulty |
| `reasonCounts` | object | Histogram of OCR-need reasons (`scanned`, `garbled`, …) |
| `layoutReasonCounts` | object | Histogram of layout reasons (`multi-column`, …) |
| `maxColumnCount` | number | Max columns observed |
| `pages` | array | Compact per-page summary |

Each `pages[]` entry:

| Field | Type | Description |
| :---- | :---- | :---- |
| `page` | number | Page number |
| `needsOcr` | boolean | |
| `reasons` | string[] | OCR-need reasons |
| `textCoverage` | number | OPTIONAL ZipWiki extra — fraction of page with native text |
| `isGarbled` | boolean | OPTIONAL ZipWiki extra |
| `layoutComplex` | boolean | |
| `layoutReasons` | string[] | |
| `columnCount` | number | |
| `ruledTableCount` | number | OPTIONAL ZipWiki extra |
| `textTableRunCount` | number | OPTIONAL ZipWiki extra |
| `figureCount` | number | OPTIONAL ZipWiki extra |

#### 5.3.2 `ai.parser.ocrConfidence`

| Field | Type | Description |
| :---- | :---- | :---- |
| `totalItemCount` | number | Text items inspected |
| `scoredItemCount` | number | Items that carried a numeric `confidence` |
| `mean` / `min` / `max` | number | Present only when `scoredItemCount > 0` (rounded to 4 decimal places) |

#### 5.3.3 `ai.parser.route`

Present when pack used auto routing (or recorded a skipped escalate):

| Field | Type | Description |
| :---- | :---- | :---- |
| `mode` | string | `"fixed"` or `"auto"` |
| `escalatedFrom` | string | e.g. `"liteparse"` when LlamaParse won after a probe |
| `reason` | string | Threshold or skip reason |

**Example `ai.parser` (ZipWiki extras included):**

```json
{
  "engine": "liteparse",
  "engineVersion": "2.9.0",
  "includeComplexity": true,
  "complexity": {
    "pageCount": 2,
    "needsOcrCount": 1,
    "needsOcrRatio": 0.5,
    "layoutComplexCount": 1,
    "layoutComplexRatio": 0.5,
    "reasonCounts": { "scanned": 1 },
    "layoutReasonCounts": { "multi-column": 1 },
    "maxColumnCount": 2,
    "pages": [
      {
        "page": 1,
        "needsOcr": false,
        "reasons": [],
        "textCoverage": 0.92,
        "isGarbled": false,
        "layoutComplex": true,
        "layoutReasons": ["multi-column"],
        "columnCount": 2,
        "ruledTableCount": 0,
        "textTableRunCount": 1,
        "figureCount": 0
      },
      {
        "page": 2,
        "needsOcr": true,
        "reasons": ["scanned"],
        "textCoverage": 0.04,
        "isGarbled": false,
        "layoutComplex": false,
        "layoutReasons": [],
        "columnCount": 1
      }
    ]
  },
  "ocrConfidence": {
    "totalItemCount": 120,
    "scoredItemCount": 0
  },
  "route": {
    "mode": "auto",
    "escalatedFrom": "liteparse",
    "reason": "needsOcrRatio >= threshold"
  }
}
```

---

## 6. Parsed artifacts

Parsed AI-readable output for primary `P` is stored as ZIP members under the
AI root.

### 6.1 Structured text — `{R}/parsed/{P}.md`

| Rule | Requirement |
| :---- | :---- |
| Presence | Optional per primary |
| Path | `{ai.root}/{ai.parsedDir or "parsed"}/{P}.md` |
| Filename | Original basename with `.md` **appended** (`report.pdf` → `report.pdf.md`), preserving any directory prefix of `P` |
| Content | UTF-8 whole-document body (typically markdown from LiteParse or LlamaParse) |
| Tables | Inside this file |
| Pairing | Requires primary `P`, unless `sourceIncluded: false` |

Failed or skipped extracts: **do not** write a parse member;
`ai.primaries[].hasParsed` is `false`.

### 6.2 Structured assets — `{R}/parsed/{P}.assets/`

| Rule | Requirement |
| :---- | :---- |
| Presence | Optional; when figures were extracted for that parse |
| Path | `{ai.root}/parsed/{P}.assets/{filename}` |
| Markdown links | Parsed markdown **SHOULD** use relative links into its `.assets/` sibling dir |
| Pairing | Requires primary `P`; **SHOULD** have matching `{P}.md` |
| ZipWiki default pack | Figure extraction **off** until opted in (size). Screenshots **off** |

### 6.3 Opening parsed content

1. Resolve primary `P` from the central directory (or package routing /
   `ai.primaries[]`).
2. Open `{R}/parsed/{P}.md` if present.
3. Resolve relative image refs under `{R}/parsed/{P}.assets/`.
4. Open `P` when original bytes are required and present.
5. When `P` is omitted, read Extra Field `0x014F` on the parse member (§6.7)
   for an absolute URI of the original.

### 6.4 Omit-original (extract-only)

ZipWiki **MAY** store only the parse for **omittable document formats** when
a successful parse exists. Default pack policy: omit originals for those
types unless `--keep-originals` (or equivalent) is set.

**Omittable** (originals MAY be dropped when parse exists):

| Family | Extensions |
| :---- | :---- |
| PDF | `.pdf` |
| Word-like | `.doc`, `.docx`, `.docm`, `.dot`, `.dotm`, `.dotx`, `.odt`, `.ott`, `.rtf`, `.pages` |
| Presentations | `.ppt`, `.pptx`, `.pptm`, `.pot`, `.potm`, `.potx`, `.odp`, `.otp`, `.key` |
| Spreadsheets | `.xls`, `.xlsx`, `.xlsm`, `.xlsb`, `.ods`, `.ots`, `.numbers` |
| Raster images | `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.tiff`, `.tif`, `.webp` |

**Never omit** (always store primary bytes): plain text, markdown, CSV/TSV,
logs, and any type without a successful parse.

When omitted:

1. No primary zip entry for `P`.
2. `ai.primaries[].sourceIncluded` is `false`.
3. Parse path remains `{R}/parsed/{P}.md` as if `P` existed.
4. The parse member **SHOULD** carry Extra Field `0x014F` with every original
   attribute that is known — URI, CRC-32, uncompressed size, Unix mtime, and
   optionally SHA-256 (§6.7). Omit any attribute that was not observed.
5. OKF `sources` for the primary **MAY** cite a host path or the same URI,
   plus the in-package parse path (§7.3). The Extra Field is authoritative
   for “where are the original bytes?”; OKF remains prose / provenance.

### 6.5 What ZipWiki does **not** store

| Output | Policy |
| :---- | :---- |
| LiteParse / LlamaParse whole-doc markdown | `{R}/parsed/{P}.md` |
| Embedded images (`extractImages`) | `{R}/parsed/{P}.assets/` when opted in |
| Per-page JSON / textItems / forms / vector graphics | **Not** default package members |
| Screenshots | **Not** default |
| LibreOffice intermediate conversion PDF | **Never** |
| Parse trees under `META-INF/` | **Forbidden** for new packages |

The input-extension matrix ships with the pack engine (Phase 2).

### 6.6 Parsed entry timestamps

By default, `{R}/parsed/{P}.md` uses **pack time**. ZipWiki **MAY** stamp
parsed members with the source file’s modification time
(`--parsed-mtime-from-original`). Manifest and OKF still use pack time.
Included primaries always use the source file date.

### 6.7 Parsed origins — Extra Field `0x014F`

ZipWiki **MAY** record where the original bytes of primary `P` live when they
are not (or might not be) in the ZIP, plus whatever original size / date / CRC
/ SHA-256 the writer actually observed. The carrier is Extra Field **`0x014F`**
(`HDR_ID.NEO_ORIGIN`) on the **parsed** member `{R}/parsed/{P}.md`, not on a
missing primary (there is no CD record when `sourceIncluded: false`).

Normative wire layout is NeoZip [NEOZIP_APPNOTE.md](./format/NEOZIP_APPNOTE.md)
§7.1.1. This section is the ZipWiki producer/consumer profile.

This is **not** PKWARE/Xceed Extra Field `0x4f4c` (“original location”).
When writing any original attribute, ZipWiki writers **MUST** emit `0x014F`.
Readers **MUST** ignore unknown Extra Fields, including `0x4f4c`.

Presence of a TLV tag is the only “known” signal. `0` is a valid CRC (empty
file), a valid size (empty file), and a valid Unix mtime (exactly epoch).
Never invent values; never use a sentinel. If CRC was not calculated, omit
the CRC tag. If SHA-256 was not calculated, omit the SHA-256 tag. If size or
mtime was not observed, omit those tags. If nothing is known, omit the Extra
Field.

#### 6.7.1 Wire (v1)

Present in local and/or central directory Extra Field (APPNOTE §4.5).
`0x014F` remains **version 1** until the first ZipWiki release. Pre-release
encodings are not valid.

```
Header ID   = 0x014F          (2 bytes, little-endian)
Data Size   = 1 + Σ(3 + value_len)
Data:
  version   = 0x01            (1 byte)
  records   = zero or more:
    tag     = <uint8>
    len     = <uint16 LE>
    value   = <len bytes>
```

| Tag | Name | Value |
| :---- | :---- | :---- |
| `0x01` | `uri` | UTF-8 absolute RFC 3986 URI (`https:` / `http:` preferred; `file:` RFC 8089 allowed). **SHOULD** ≤ 2048 bytes. Relative / bare OS paths **MUST NOT** appear |
| `0x02` | `crc32` | 4 bytes, uint32 LE. ZIP/IEEE CRC-32 of **original primary bytes**, not the parse markdown. Omit if not calculated. **Default** original integrity tag when packing from on-disk bytes. ZipWiki writers **MUST NOT** emit this tag when tag `0x05` is written |
| `0x03` | `size` | 8 bytes, uint64 LE. Original uncompressed length. Omit if unknown |
| `0x04` | `mtime` | 8 bytes, int64 LE. Original mtime as **Unix seconds UTC**. Negative = pre-epoch. Sub-seconds discarded. Omit if unknown |
| `0x05` | `sha256` | 32 bytes. SHA-256 of **original primary bytes**, not the parse markdown. Omit unless the writer was asked to include it (`--origin-sha256`). When written, omit tag `0x02` |

Unknown tags **MUST** be skipped (forward compatible). Duplicate tags: last
wins. Tag `0x00` **MUST NOT** be written. Wrong-length known tags **MUST** be
skipped. Readers **MUST** skip the field when the version byte is not `0x01`.

| Field | Rule |
| :---- | :---- |
| Placement | On `{R}/parsed/{P}.md` when **any** original attribute is known. ZipWiki **SHOULD** write the field when a URI is known, or when the primary is omitted (`sourceIncluded: false`) and crc/size/mtime were observed from the source file |
| Concatenation | After `0x014E` when both are present. `0x014F` alone is valid (ZipWiki default) |
| Parse ZIP date | DOS mtime on the parse member is **not** the original’s mtime. Original time belongs in tag `0x04` |

When Extra Field `0x014E` is written, it is SHA-256 of **this ZIP member**
(the parse markdown on `{R}/parsed/{P}.md`). Tag `0x05` on `0x014F` is SHA-256
of the **original primary bytes**, which may live outside the archive. Merkle
leaves, when a chain proof needs them, still hash the ZIP member payloads.

#### 6.7.2 Pack-time resolution (never guess)

Writers resolve a URI **before** writing the `uri` tag. Precedence:

1. **Per-file sidecar** next to the source (not stored in the package):
   - `{file}.url` — first non-empty, non-`#` line is the locator
   - `{file}.origin.json` — object with `uri` or `url` (optional `crc32`,
     `size`, `mtime` when the original bytes are not at pack time)
2. Nearest ancestor **`.zipwiki-origins.json`** under the pack input root
   that accepts the file (nested directory wins; unmatched pattern falls
   through to a parent rule).
3. **CLI overlay** applied as a virtual rule at each pack input root:
   `--origin-pattern`, `--origin-url-template`, `--origin-file`.
4. No URI match → **omit the URI tag**. Still write `0x014F` when packing
   an omitted original whose crc/size/mtime were observed from the source
   file. Omit the Extra Field entirely when no attribute is known.

When the original bytes are on disk at pack time, ZipWiki **SHOULD** fill
`size` and `mtime` from those bytes / `stat` (Unix seconds UTC), plus
**one** original digest: `crc32` by default, or SHA-256 (**tag `0x05`**)
when requested (`--origin-sha256`). Do not write both digest tags. Sidecar
`crc32` / `size` / `mtime` apply only when those values were not measured.
**MUST NOT** invent a URI.

Rule files and sidecars are **pack input only**. They **MUST NOT** be written
into the `.zipwiki`.

`.zipwiki-origins.json` is a JSON object:

| Field | Meaning |
| :---- | :---- |
| `pattern` | Optional filename/path regex; named groups fill `urlTemplate`. No match → fall through |
| `urlTemplate` | Absolute URI template. Placeholders: `{name}` (stem), `{path}` (POSIX path relative to the rule directory), `{dir}` (first path segment), plus regex capture names / `{1}`, `{2}`, … |
| `file` | `true` → locator is `pathToFileURL` of the absolute source path |
| `include` | Optional globs (basename or path relative to the rule dir); non-match → fall through |

Numeric capture groups **SHOULD** strip leading zeros (`Ch_2025-001` →
chapter `1`). Absolute OS paths in sidecars **MUST** be normalized to
`file:` URIs on the wire. Relative locators **MUST** be rejected.

**Example** `.zipwiki-origins.json`:

```json
{
  "pattern": "Ch_(?<year>\\d{4})-(?<chapter>\\d+)",
  "urlTemplate": "https://laws.flrules.org/{year}/{chapter}"
}
```

`Ch_2025-001.pdf` → `https://laws.flrules.org/2025/1`.

CLI equivalent:

```bash
zipwiki pack ./corpus -o laws.zipwiki \
  --origin-pattern 'Ch_(?<year>\d{4})-(?<chapter>\d+)' \
  --origin-url-template 'https://laws.flrules.org/{year}/{chapter}'
```

`--origin-file` stores a `file:` URI per parse (useful for NAS paths when
originals are omitted). `--origin-pattern` requires `--origin-url-template`
or `--origin-file`.

#### 6.7.3 Read path

zipaccess / `open` **SHOULD** list original attributes found on parse
members (`origins[]`: `parsedPath`, `primaryPath`, and any of `originUri`,
`originCrc32` (8 hex digits), `originSize`, `originMtime` (Unix seconds) plus
`originMtimeUtc` (ISO-8601), `originSha256` (64 hex digits)) and **MAY** copy those fields
onto matching `ai.primaries[]` rows for agents. The Extra Field on the parse
entry remains authoritative; the manifest **MUST NOT** be the only copy.

Agents that need original bytes: follow `originUri` (HTTP or local `file:`)
when present. zipaccess / MCP **`origin`** (`fetch`) downloads that URI and
**MUST** check a fetched payload against `originCrc32` (and `originSize` /
`originSha256` when those tags were written). `originMtime` is advisory
(the original’s last-modified time, not the parse member’s ZIP DOS date).

---

## 7. OKF bundle

OKF language is specified in [OKF_SPEC.md](./OKF_SPEC.md). ZipWiki’s
producer subset is compared in the
[OKF producer profile](./OKF_ZIPWIKI_VS_SPEC.md). This section is the
**ZIP placement** contract plus ZipWiki writer conventions.

### 7.1 Placement

OKF v0.2 knowledge lives under the AI root:

```
{wiki|ai|context}/okf/
```

ZipWiki writers **SHOULD** emit:

| Entry (with `wiki/` root) | Role |
| :---- | :---- |
| `wiki/okf/index.md` | Bundle listing + `okf_version: "0.2"` and a `# Files` list (OKF §8 / §12) |
| `wiki/okf/{stem}.md` | **One concept per primary** (stem = primary basename without extension) |
| `wiki/okf/document.md` | Legacy package-level concept; accepted, not preferred for new multi-primary packs |
| `wiki/okf/log.md` | Optional change history (ZipWiki does not emit by default) |

Consumers **MUST NOT** reject a bundle for missing `index.md` (OKF §11).

The entire `okf/` tree is **optional**. Packages **MAY** ship `parsed/`
without OKF (omit `ai.okf` or set `present: false`). Packages **MAY** also
ship OKF concepts for primaries that have **no** parse extract (filename /
type context only) so agents still discover that the primary is part of the
package.

Concept bodies **SHOULD NOT** duplicate `{R}/parsed/{P}.md`. ZipWiki treats
OKF as metadata + provenance + an optional skim map (`# Key facts` /
`# Contents`). Empty body is valid (fallback / `--no-ai-okf`).

### 7.2 Declaration

Advertised via `manifest.json` → `ai.okf` (§5.2).

### 7.3 Relation to primaries and parses

- OKF concepts **MUST** cite **primary** entry paths as `sources[].resource`
  paths that resolve **relative to `{R}/okf/`** (e.g. primary `report.pdf` →
  `../../report.pdf`). Do **not** cite host staging paths outside the
  package when the primary is stored in the ZIP.
- Concepts **MAY** also cite `{R}/parsed/{P}.md` when a parse exists
  (e.g. `../parsed/report.pdf.md` from `wiki/okf/`).
- When parse failed or was skipped, the concept **SHOULD** still cite the
  primary so agents know the bytes live in the ZIP (or that
  `sourceIncluded: false` applies for extract-only parses).
- When omit-original applies, ZipWiki **MAY** set the primary
  `sources[].resource` to the absolute host path and note in `description`
  that the source is outside the package; the parse citation stays
  package-relative.
- Prefer **one concept file per primary** for multi-primary packages; a
  single shared `document.md` remains valid for simple packages.
- ZipWiki typically emits `type`, `title`, `description`, `tags`,
  `generated`, and `sources`. It does **not** emit `verified`, `status`,
  `stale_after`, or a top-level `resource` (those stay on `sources`). See
  the [OKF producer profile](./OKF_ZIPWIKI_VS_SPEC.md).

### 7.4 Agent open sequence

1. Read `ai.okf` from the manifest.
2. If `present` is false or `ai.okf` is omitted, skip OKF and use `parsed/` /
   primaries only.
3. If present, open `ai.okf.index` when set; otherwise open concepts under
   `ai.okf.root`.
4. Follow OKF `sources` / links to primaries or `parsed/` members.
5. Open OKF when `ai.okf.present` is true, independent of other profile flags.

zipaccess prefers **search** (OKF frontmatter first, then parsed markdown at
lower weight) before dumping full concepts. See [ZIPACCESS.md](./ZIPACCESS.md).

### 7.5 Enrichment after pack

Default MCP create sequence:

1. `pack` / `zipwiki pack` with AI OKF skipped (`--no-ai-okf`).
2. Host LLM fills title / description / type / tags / key facts.
3. `okf_enrich` / `zipaccess okf-enrich` writes `{R}/okf/` into the
   existing archive (no hosted OKF quota).

Optional: pack with hosted / BYO OKF when the plan still has quota.
Soft fallback is host-LLM enrich, not a hard failure.

---

## 8. Collision rewrite

ZipWiki **prefers basename** as the primary zip path. When two inputs share
a basename, later files are rewritten:

```
report.pdf
content/2/report.pdf
content/3/report.pdf
…
```

Parse and asset paths follow the rewritten `P`. OKF concept filenames still
use the **basename stem** (`report.md`). Agents that need uniqueness follow
`ai.primaries[].path` and the parse path, not the OKF stem alone.

This is a ZipWiki producer convention. Generic NeoZip readers only see the
resulting CD names.

---

## 9. Stage tree (on disk, before zip)

ZipWiki pack **MAY** materialize `META-INF/` + `{ai.root}/` on disk (a
**stage** / `wikiDir`) before writing the archive. Primaries are read from
their original paths and are **not** copied into the stage root.

Default stage layout (AI root `wiki`):

```
<stage>/
├── META-INF/
│   └── manifest.json
└── wiki/
    ├── parsed/
    │   └── report.pdf.md
    └── okf/
        ├── index.md
        └── report.md
```

- Default pack uses a temp stage and deletes it after zip (unless
  `--keep-wiki-dir` or an explicit `--stage-dir` / `--wiki-dir`).
- `zipwiki stage` / phased commands (`parse` → `okf` → `manifest` → pack)
  keep the stage so operators can inspect or re-run OKF without re-parse.
- Standalone `zipwiki okf` / sample output often uses
  `sample-output/wiki/{parsed,okf}/`.

The stage is **not** a package member. Only the resulting ZIP is.

---

## 10. Pack pipeline (informative)

```
sources
  → classify / optional complexity probe
  → parse (LiteParse default; LlamaParse escalate or hosted)
  → optional omit-original for omittable types
  → optional OKF (hosted, BYO, or skip)
  → build META-INF/manifest.json (ai registry)
  → ZIP: manifest (Store) → wiki tree → included primaries
  → ZIP CRC-32 on every member (APPNOTE local + central headers)
  → Extra Field 0x014E on members only when requested (`--sha256`)
  → Extra Field 0x014F on parsed members when any original attribute is known
    (URI and/or crc32 / size / Unix mtime; optional sha256 via `--origin-sha256`)
  → Merkle v1 only when binding TOKEN.NZIP / TIMESTAMP.NZIP (blockchain)
```

Compression (NeoZip §9.1): **Zstd method 93** default; Store / Deflate for
Info-ZIP interop (`--legacy`). Manifest **SHOULD** stay Store (0).

Default ZipWiki profiles in the manifest: `["zipwiki"]`. Add `"integrity"`
when Extra Field `0x014E` is written.

### 10.1 Mutate (add / update / delete)

ZipWiki **MUST NOT** patch a ZIP central directory in place. `zipwiki update`
/ `update` emit a **new** archive (atomic temp + rename), the same as
`okf_enrich`.

Knowledge-coherent rules:

| Op | Behavior |
| :---- | :---- |
| Add | New ZIP path `P` (basename, or `content/N/<basename>` on collision). Existing paths stay frozen. Parse → `{R}/parsed/{P}.md`; optional OKF; `ai.primaries[]` append |
| Update | Same `P` (Info-ZIP `-u` analog for existing members; not `--freshen`). New bytes; re-parse; refresh Extra Field `0x014F` on the parse when original attributes are known. Does not add missing names |
| Delete | Drop `P`, `{R}/parsed/{P}.md`, `{P}.assets/**`, and the OKF concept if it uniquely belongs to `P`; rebuild `{R}/okf/index.md` |

Writers **SHOULD** copy unchanged members’ compressed payloads (method, CRC-32,
Extra Fields including `0x014E` / `0x014F` when present, DOS mtime) instead of
recompressing. That is an implementation note — it is **not** a new Extra Field.
When a chain proof is required, Merkle v1 is still
`SHA-256(0x00 ‖ uncompressed)` over all non-`META-INF/` members, so the writer
**MAY** inflate unchanged members once to compute leaves while writing the
original compressed slice. Default mutate does **not** compute or store a Merkle
root.

If `META-INF/TOKEN.NZIP` or `META-INF/TIMESTAMP.NZIP` are present, mutate
**SHOULD** refuse: those proofs bind the pre-mutation Merkle root.

`createdAt` in the manifest is the original pack time. Mutation is not a new
package identity.

---

## 11. Integrity interaction

ZipWiki does not define new Extra Field IDs. It inherits NeoZip:

| Feature | ZipWiki behavior |
| :---- | :---- |
| ZIP CRC-32 | **MUST** be written on every member (APPNOTE local + central). This is the default integrity check |
| Extra Field `0x014E` | **MAY** be written on members when requested (`--sha256`). SHA-256 of **this entry’s** uncompressed payload. Claim `"integrity"` in `profiles` when written |
| Extra Field `0x014F` | **MAY** be written on `{R}/parsed/{P}.md` when any original attribute is known (§6.7). Tags are independently optional. CRC/size/mtime/SHA-256 describe the original primary, not the parse. Origin SHA-256 (tag `0x05`) **MAY** replace CRC-32 (`--origin-sha256`); writers store one digest, not both |
| Merkle v1 | Compute and bind the root **only** when submitting a blockchain proof (`TOKEN.NZIP` / `TIMESTAMP.NZIP`). Leaves = all non-`META-INF/` CD entries, **including** `{R}/**` |
| Merkle v0 | Legacy verify only (NeoZip §7.5) |
| `TOKEN.NZIP` / timestamps | Bind `merkleRoot` after the wiki tree and primaries are final |
| Manifest | Convenience for agents; **MUST NOT** be the sole source of hashes |

Because parses and OKF participate as Merkle leaves, enriching OKF after
pack (`okf_enrich`) or mutating primaries (`update`) **changes**
the archive Merkle root. Re-stamp / re-mint if those proofs were already
written.

---

## 12. Agent and tool sequence

### 12.1 Query (zipaccess)

1. `open` / `zipaccess open` — manifest, OKF flags, primaries, optional
   `origins[]` from Extra Field `0x014F`.
2. Prefer `search` / `zipaccess search`; else `read_okf_index` +
   `read_okf`.
3. Follow `sources` to `read` / `read_parsed` (or originals via
   `read_entry` — stream, verified).
4. Prefer OKF descriptions before dumping full parses (context budget).
5. `extract` only when a filesystem path is required.

### 12.2 Create (MCP default)

1. `pack` (skips AI OKF).
2. Host LLM → `okf_enrich`.
3. Query loop as above.

### 12.3 Update

1. `update` / `zipwiki update` with `--add` / `--update` / `--del`
   (one rewrite; copies unchanged compressed members).
2. Host LLM → `okf_enrich` for new/updated primaries when AI OKF was
   skipped.
3. Query loop as above.

---

## 13. Conformance

ZipWiki packages that include AI materials correspond to NeoZip **L4
(ZipWiki AI)**:

| Level | Name | Requirements |
| :---- | :---- | :---- |
| L0 | Plain ZIP | Valid APPNOTE ZIP (CRC-32 per member). **ZipWiki default** |
| L1 | NeoZip integrity | L0 + per-content `0x014E` + computable Merkle root. **No** manifest required. ZipWiki writes `0x014E` only when requested |
| L2 | Timestamped | L1 + valid `META-INF/TIMESTAMP.NZIP` bound to Merkle root |
| L3 | Tokenized | L1 + valid `META-INF/TOKEN.NZIP` bound to Merkle root |
| L4 | ZipWiki AI | L0 + AI materials + `META-INF/manifest.json` with `"zipwiki"` (or equivalent) profile + valid `ai` block with `root`; parsed / OKF as declared. L1 extras are independent and optional |
| **+Access** | Recipient-encrypted | Any L0–L4 **plus** valid `META-INF/ACCESS.NZIP` |

L4 never substitutes for L1–L3. A default ZipWiki package is L0 + L4.
`"integrity"` / L1 applies when Extra Field `0x014E` is present. Merkle root
*values* are bound only in L2/L3 sidecars.

**ZipWiki L4 writer checklist:**

- [ ] Exactly one AI root, declared as `ai.root`
- [ ] `specVersion` ≥ `0.2.0`, `format` = `neozip`
- [ ] Parse paths `{R}/parsed/{P}.md`; no AI under `META-INF/`
- [ ] Orphan parses rejected unless `sourceIncluded: false` for that `P`
- [ ] `ai.okf` matches CD (present iff OKF members exist)
- [ ] Extra Field `0x014E` only when requested; ZIP CRC-32 always
- [ ] Extra Field `0x014F` on parse members when any original attribute is known; never invent URI/CRC/size/mtime/SHA-256; omit unknown tags; origin SHA-256 (tag `0x05`) only when requested, and then omit CRC-32 (tag `0x02`)
- [ ] Merkle root computed/bound only for `TOKEN.NZIP` / `TIMESTAMP.NZIP`

---

## 14. Compatibility

| Consumer | Behavior |
| :---- | :---- |
| Info-ZIP / Finder / Explorer | Lists/extracts content; shows `META-INF/` and `wiki/` (or other AI root) as folders; ignores Extra Field `0x014E`; cannot inflate Zstd (method 93) without a Zstd-capable reader |
| Generic ZIP tools | Treat `wiki/` as an ordinary directory |
| NeoZip-aware tools | L1–L3 verify without requiring ZipWiki; ignore unknown `ai` keys |
| ZipWiki / zipaccess | Prefer `manifest.json` + `ai.root` → `parsed/` and optional `okf/`; honor `sourceIncluded: false` and Extra Field `0x014F` on parse members; accept `.zipwiki` and legacy `.nzip`. Older archives that used a different `ai.root` spelling or profile token **SHOULD** still open when the tree is otherwise valid |
| AI agents | Prefer `META-INF/manifest.json` when present (L4), then OKF index / per-primary concepts and/or `parsed/` as declared |

---

## 15. Specification versioning

| Change type | Impact | Examples |
| :---- | :---- | :---- |
| Additive | Minor | New optional `ai.parser` fields, extra omit-original types |
| Breaking | Major | AI root rename policy, parse path scheme change |

Archives declare `specVersion` in `META-INF/manifest.json`. Readers
**SHOULD** best-effort older versions rather than refuse.

| Resource | Location |
| :---- | :---- |
| NeoZip Application Note (parent) | [NEOZIP_APPNOTE.md](./format/NEOZIP_APPNOTE.md) |
| This ZipWiki note | `doc/ZIPWIKI_APPNOTE.md` |
| OKF language | [OKF_SPEC.md](./OKF_SPEC.md) |
| ZipWiki OKF producer profile | [OKF producer profile](./OKF_ZIPWIKI_VS_SPEC.md) |
| Parse → member mapping | Pack engine (Phase 2) |
| Read / search | [ZIPACCESS.md](./ZIPACCESS.md) |

---

## 16. Change log

| Date | Version | Change |
| :---- | :---- | :---- |
| 2026-09-16 | **0.2.0-draft** | Initial ZipWiki Application Note: AI-root rules (`wiki/` default, `parsed/`, per-primary OKF, `ai` registry, omit-original, L4) plus producer detail (`.zipwiki` filename, `"zipwiki"` profile, collision rewrite `content/N/`, omittable extension set, stage tree, parser extra fields, pack / enrich pipeline, parsed origins Extra Field `0x014F` v1 TLV with optional URI, CRC-32, uint64 size, int64 Unix mtime, optional SHA-256 of original primary bytes (tag `0x05`); field version stays 1 until first release). Default integrity is ZIP CRC-32; Extra Field `0x014E` and origin SHA-256 are opt-in; Merkle v1 root is computed only for blockchain sidecars. |
