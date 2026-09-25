# ZipWiki OKF vs OKF Spec v0.2

This document compares what ZipWiki **produces and validates today** against
[OKF_SPEC.md](./OKF_SPEC.md) (Open Knowledge Format **v0.2**). It is a producer
profile note, not a fork of the language.

**Normative source of truth for the language:** [OKF_SPEC.md](./OKF_SPEC.md).  
**How OKF sits inside `.nzip` / `.zipwiki`:** [NEOZIP_APPNOTE.md](./format/NEOZIP_APPNOTE.md) §6 · [ZIPWIKI_APPNOTE.md](./ZIPWIKI_APPNOTE.md) §7.  
**Code:** `@zipwiki/okf`, `zipwiki okf`, and pack’s OKF pass.

---

## 1. Scope in one line

| | OKF v0.2 (spec) | ZipWiki today |
| --- | --- | --- |
| Purpose | General knowledge corpora (tables, playbooks, metrics, attested computations, …) | Document-package concepts: one concept describing a **primary file** (and its parse) inside or beside an archive |
| Unit of distribution | A **bundle** (directory of markdown) | A **NeoZip package** that *contains* an OKF tree under `{aiRoot}/okf/` (default `wiki/okf/`), under `{aiRoot}/okf/` |
| Body content | Free-form markdown (schema, prose, computation fences, …) | **Empty** — parse text lives in `parsed/`, never duplicated in the concept |

ZipWiki aims to emit **conformant** concepts for the subset of the language it
uses (§11: `type` + parseable frontmatter). It does **not** implement the full
authoring surface of v0.2 (indexes, logs, attested computations, rich trust
workflows).

---

## 2. Bundle layout

| Spec (§3, §8–§9) | ZipWiki |
| --- | --- |
| Arbitrary directory tree of concepts | Per-file cards at `{aiRoot}/okf/{stem}.md`. Shared tags also produce a capped set of `{aiRoot}/okf/topics/{tag}.md` pages, rebuilt on add, update, and delete |
| `index.md` optional at any level | **Emitted** at bundle root with `okf_version: "0.2"`, a `# Files` list, and a `# Topics` list when topic pages exist; never used as a concept |
| `log.md` optional | **Not emitted.** OKF allows it; ZipWiki does not write `wiki/okf/log.md` |
| Bundle-root `index.md` MAY carry `okf_version` (§12) | Yes — also advertised via `manifest.json` → `ai.okf.version` / `ai.okf.index` |
| `references/` convention (§6.3) | Unused |

Missing `index.md` is still allowed for consumers (spec §11); ZipWiki produces one.

---

## 3. Concept documents

### 3.1 Shape

| Spec (§4) | ZipWiki |
| --- | --- |
| YAML frontmatter + markdown body | Frontmatter + **optional thin body** (`# Key facts`, `# Contents` from AI). Full parse stays under `parsed/` |
| Conventional body headings (`# Schema`, `# Details`, …) | ZipWiki uses `# Key facts` / `# Contents` as a skim map (not `# Schema`) |
| Body footnotes keyed to `sources[].id` (§5.1) | Not used |
| Cross-concept markdown links (§6) | Not generated |

Empty body is still allowed (fallback / `--no-ai`). ZipWiki treats the parse
artifact as the readable content and the OKF file as **metadata + provenance +
optional skim map** for that primary.

### 3.2 Filenames

| Context | Filename |
| --- | --- |
| Inside `.zipwiki` (`wiki/okf/`) | `document.md` (package-level concept; APPNOTE layout) |
| Standalone `zipwiki okf` | `{stem}.md` from the primary basename (e.g. `deed.pdf` → `deed.md`) |
| Reserved | Never writes `index.md` / `log.md` as concepts (`index.md` is the listing only) |

---

## 4. Frontmatter field matrix

Legend: **Emit** = written by default generators · **Accept** = parser/validator
understands · **—** = not produced / not modeled

### 4.1 Core (§4.1)

| Field | Spec | ZipWiki |
| --- | --- | --- |
| `type` | **Required** | **Always emitted.** Mapped from ZipWiki document categories / extensions (e.g. `Legal_Contract` → `Contract`, `.xlsx` → `Spreadsheet`). Unknown/custom types allowed by spec; our default set is document-oriented (`Document`, `Invoice`, `Contract`, …), not data-warehouse types (`BigQuery Table`, …). |
| `title` | Recommended | Always emitted (filename or AI title) |
| `description` | Recommended | Always emitted (digest line or AI one-liner) |
| `resource` | Recommended URI for the underlying asset | Relative path to the **primary** (from the OKF file / `okf/` root) |
| `tags` | Optional | **Always emitted** (AI labels when present; else deterministic from type / filename) |
| Producer extensions | Allowed | `sources[].description` (we label sources; spec’s optional label on a source is `title`) |

### 4.2 Provenance (§5.1)

| Field | Spec | ZipWiki |
| --- | --- | --- |
| `sources[]` | Optional family | **Always emitted** (code-owned) |
| `sources[].resource` | Required in an entry | Always set (primary path + parse path) |
| `sources[].id` | Optional; SHOULD when body cites | Always set (`primary-…`, `parse-…`) |
| `sources[].title` | Optional | — (we use `description` instead) |
| `sources[].author` / `usage_count` / `last_modified` | Optional credibility | — |
| `usage_window` | Optional sibling of `sources` | — |

Typical package sources (paths relative to `{aiRoot}/okf/`):

- Primary: `../../report.pdf`
- Parse: `../parsed/report.pdf.md`

Standalone `sample-output/okf/` uses paths relative to that directory (e.g.
`../../sample-docs/…`, `../parsed/…`).

### 4.3 Trust (§5.2–§5.3)

| Field | Spec | ZipWiki |
| --- | --- | --- |
| `generated` | Optional | **Always emitted** (code-owned). Actors: `process:zipwiki-okf-fallback` or `zipwiki/okf@<model>` (agent-style `<producer>/<version>`) |
| `generated.by` / `generated.at` | `by` required if `generated` present | Both set |
| `verified` | Optional list/mapping | **Never emitted** ⇒ trust tier **unverified** (valid per §5.3 / §11) |

LLM prompts are instructed **not** to invent `verified`, `sources`, or
`generated`.

### 4.4 Lifecycle (§5.4–§5.5)

| Field | Spec | ZipWiki |
| --- | --- | --- |
| `status` | `draft` \| `stable` \| `deprecated` (absent ⇒ stable) | **Not emitted** (sealed archives; absent ⇒ stable per spec) |
| `stale_after` | Optional `YYYY-MM-DD` | **Not emitted** |
| Top-level `resource` | Optional | **Not emitted** — primary/parse paths live only under `sources` |

### 4.5 Attested computation (§10)

| Feature | Spec | ZipWiki |
| --- | --- | --- |
| `type: Attested Computation` | Full contract (`runtime`, `parameters`, `executor`, `attester`, …) | **Not produced** |
| Computation body / `computation` path | Defined in §10 | — |
| Runtime receipts / attesters | Informative consumer flow | Out of scope for ZipWiki packaging |

---

## 5. Validation and repair

| Spec §11 | ZipWiki (`@zipwiki/okf`) |
| --- | --- |
| Every concept has parseable frontmatter + non-empty `type` | `validateOkfFrontmatter` requires `type`; `repairOkfFrontmatter` injects `type: Document` (or caller default) if missing |
| Soft guidance on optional families | Checks `generated.by` when `generated` present; `sources[].resource` when sources present |
| Consumers MUST NOT reject unknown keys / types | No reject-on-unknown; generator may preserve extras only via repair path that re-serializes known fields |

ZipWiki does **not** ship a full OKF linter for indexes, logs, footnotes, or
attested-computation contracts.

---

## 6. Embedding in NeoZip (APPNOTE, not OKF)

OKF itself does not define ZIP packaging. ZipWiki places the bundle here:

```text
{aiRoot}/okf/document.md     # concept(s); frontmatter only
{aiRoot}/parsed/…            # structured parse (not part of OKF body)
<primaries…>                 # original files
META-INF/manifest.json       # ai.okf.present / root / version
```

That split is intentional: **OKF describes**; **parsed/** holds the extract;
**primaries** are pristine. Duplicating parse into the concept body is
explicitly avoided.

---

## 7. Generation pipeline (informative)

1. **Parse** (LiteParse / LlamaParse) → markdown under `parsed/` or `sample-output/parsed/`.
2. **Classify** (heuristic categories) → hint for OKF `type`.
3. **Enrich** (optional LLM): `title`, `description`, `type`, **`tags`**,
   `keyFacts` / `contents` (thin body).
   Supplier registry: `openai`, `anthropic`, `gemini`,
   `openrouter`, `openai-compatible`, `ai-gateway` (`ZIPWIKI_OKF_PROVIDER` +
   matching `*_API_KEY`). Fallback uses filename + first long parse line and
   still emits `tags`.
4. **Stamp** code-owned `generated` + `sources` (no top-level `resource` /
   `status` / `stale_after`; no source `id`). When omit-original applies,
   the primary `sources[].resource` is the absolute host path and the
   description notes it is outside the package; parse stays package-relative.
5. **Write** concept file (frontmatter + optional thin body) and bundle-root
   `index.md`.

Standalone: `pnpm okf` / `zipwiki okf`.  
Package: included when packing with OKF enabled (`--no-ai-okf` skips LLM only).

---

## 8. Conformance summary

| Claim | Status |
| --- | --- |
| Emitted concepts are OKF v0.2–shaped (frontmatter + `type`) | **Yes** |
| Optional `index.md` / `log.md` | `index.md` emitted; `log.md` not written |
| Empty body | Allowed without AI; AI emits thin `# Key facts` / `# Contents` |
| Full v0.2 feature surface (attestation, credibility signals, `verified`, rich bodies, multi-concept graphs) | **Not implemented** as a producer |
| Language extensions | Soft: `sources[].description` instead of / in addition to `title` |

**Bottom line:** ZipWiki is an OKF v0.2 **document-package producer profile**:
minimal, provenance-forward concepts with empty bodies, suitable for NeoZip.
It is not a general OKF authoring suite for OpenWiki-style corpora.

---

## 9. Example (ZipWiki standalone)

```markdown
---
type: Document
title: property-deed.pdf
description: "…"
tags: [document, contract, pdf, legal]
generated: { by: "process:zipwiki-okf-fallback", at: "2026-08-29T19:29:06.496Z" }
sources:
  - resource: /abs/path/to/property-deed.pdf
    description: Primary not included in this package; source on disk (property-deed.pdf)
  - resource: ../parsed/property-deed.pdf.md
    description: Parsed markdown in this package (property-deed.pdf)
---
```

With AI enrichment, the same concept may also carry a thin body:

```markdown
# Key facts

- Grantor: estate of Frank L. DiFabbio
- Property: Lot 5, Woodvalley Subdivision, Wake County, NC

# Contents

- Granting clause
- Habendum / warranties
```

Compare with the richer body + optional `verified` / credibility examples in
OKF_SPEC §4.3–§5 and §10 — those remain valid OKF; ZipWiki’s first-pass body is
only a skim map, not a full essay or attestation surface.
