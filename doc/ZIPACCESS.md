# zipaccess — local knowledge-base access

**zipaccess** is the ZipWiki **library** for **opening, searching, reading, and applying OKF enrichment** to a portable `.zipwiki` on disk (or any path the process can see, including mounted cloud drives). It does **not** create packages from sources — that is **zipwiki** (`zipwiki pack` / MCP `pack`).

| Tool | Job |
| --- | --- |
| **zipwiki** | **Write** — ingest, parse, optional OKF, compress → `.zipwiki`. Test dumps: `zipwiki read` / `read-manifest`. Catalog: `zipwiki catalog` / `list --catalog` |
| **zipaccess** | **Library** `@zipwiki/cli/access` + **query CLI** (`zipaccess open` / `search` / `read`) |
| **stdio MCP** | Agents on this machine → zipaccess library + zipwiki |

The `.zipwiki` file remains the unit of storage and distribution. zipaccess never requires uploading the package to a hosted API.

---

## Product intent

1. Point MCP (or the library) at a local `.zipwiki` (or default `wiki.zipwiki` in cwd).
2. Discover concepts via **search** (OKF first) or the OKF catalog.
3. Fetch only the slices needed via **streamed MCP reads** (OKF → parsed → entry); **extract to disk** only when a filesystem path is required.
4. After `pack` with AI OKF skipped, apply host-LLM enrichment via `okf_enrich`.

## Placement

Ships **inside** the zipwiki package (TypeScript runtime, Phase 2):

- Library: `@zipwiki/cli/access`
- Query CLI: `zipaccess` (`open` / `search` / `read` / `extract` / `origin`)
- Test dumps: `zipwiki read` / `zipwiki read-manifest` / `zipwiki catalog`

stdio MCP (`zipwiki-mcp` / `apps/mcp`) calls this library in-process.

---

## CLI (catalog + dumps)

```bash
# Readable catalog (one line per primary)
zipaccess open ./company-kb.zipwiki
zipwiki catalog ./company-kb.zipwiki
zipwiki list ./company-kb.zipwiki --catalog

# Search with read hints
zipaccess search ./company-kb.zipwiki "lease"

# Stream bodies
zipaccess read ./company-kb.zipwiki --okf lease
zipaccess read ./company-kb.zipwiki --parsed lease.txt
zipwiki read -p ./company-kb.zipwiki --path wiki/okf/lease.md
zipwiki read-manifest -p ./company-kb.zipwiki
zipwiki extract ./company-kb.zipwiki /tmp/kb-out -o
zipaccess origin ./company-kb.zipwiki --parsed lease.txt
zipaccess origin ./company-kb.zipwiki --parsed lease.txt --fetch -o /tmp/lease.txt
zipaccess read ./company-kb.zipwiki --parsed lease.txt --origin
zipaccess extract ./company-kb.zipwiki /tmp/kb-out --path wiki/parsed/lease.txt.md --fetch-origin
```

Default package when omitted: `wiki.zipwiki` in the current directory.

---

## MCP tool names

stdio MCP (`zipwiki-mcp`) registers **short verbs** (scoped by the server name `zipwiki`):

`open`, `list`, `search`, `query`, `read_okf_index`, `read_okf`, `read_parsed`, `read_entry`, `read`, `read_manifest`, `extract`, `origin`, `pack`, `update`, `okf_enrich`

---

## Library / agent contract

| Capability | Tool / command | Notes |
| --- | --- | --- |
| Manifest + sequence | `open` | Always first for query; includes **`catalog`** rows |
| Member table | `list` | Prefer `prefix` |
| **Search** | `search` / `query` | OKF cards first. Parsed markdown is a fallback when no card matches (`evidence: true`). Pass `in=okf,parsed` to search both. Hits include **`readHints`**. |
| OKF index | `read_okf_index` | |
| One concept | `read_okf` | |
| Parsed markdown | `read_parsed` | Size-capped (`maxBytes`); includes `origin` (0x014F) when present |
| Stream entry | `read_entry` | Verified inflate; JSON (UTF-8 or base64) |
| **Origin** | `origin` / `zipaccess origin` / `zipwiki origin` | Extra Field `0x014F` URI + CRC; `--fetch` downloads and verifies CRC-32 |
| **Read manifest** | `read_manifest` / `zipwiki read-manifest` | Always `META-INF/manifest.json` as raw JSON |
| **Read to LLM** | `read` / `zipwiki read` / `zipaccess read` | Raw bodies; several paths separated by `===== ZIPWIKI <path> =====`. `--origin` prints locator; `--fetch-origin` CRC-checks the original |
| **Catalog (human)** | `zipaccess open` / `zipwiki catalog` | Pretty one-line-per-primary table |
| **Extract** | `extract` / `zipwiki extract` | Verified write to disk (CRC + SHA-256 when present). `--fetch-origin` also downloads originals |
| **Pack** | `pack` / `zipwiki pack` | Create `.zipwiki` (default: skip AI OKF) |
| **Update** | `update` / `zipwiki update` | Add / update / delete primaries |
| Host OKF apply | `okf_enrich` | Injected enrichment; no hosted OKF bill |

**Stream first:** prefer `read` (raw bodies) or `read_*` (JSON) over extract. Extract when the host needs a real path (editor, other tools). Default extract dest: `~/.zipwiki/extract/<package-stem>/`.

**Integrity:** inflate always checks ZIP CRC-32; NeoZip Extra Field `0x014E` SHA-256 (or manifest `content[].sha256`) when present. Failures raise `integrity_failed` and never write on extract.

**Originals:** `read_parsed` includes `origin` (URI, size, CRC-32 **or** SHA-256 as hex, Unix `originMtime` plus `originMtimeUtc`) from Extra Field `0x014F` when present. `origin` / `--fetch-origin` downloads `http(s)` or `file:` and checks the payload against the saved digest (and size when written). A mismatch raises `integrity_failed` and does not write.

**Search:** rank OKF frontmatter (title, tags, description, type) first; optionally scan `wiki/parsed/*.md` at lower weight. Return paths + snippets; never dump full bodies.

**Out of scope for zipaccess:** packing sources, hosted parse quotas, uploading to `/api/packages`, general filesystem MCP.

Local open/search does **not** require a hosted API connection. Pack/parse may.

---

## How agents use it

| Host | How |
| --- | --- |
| Claude Code / Desktop | stdio MCP backed by the **zipaccess library** + local `.zipwiki` path |
| Human / scripts | `zipaccess open` / `search` / `read`; `zipwiki catalog` / `read` dumps |

Open sequence:

1. `open`
2. Prefer `search` (or `query`); else `read_okf_index` → `read_okf`
3. `read` / `read_parsed` / `read_entry` for evidence; `origin` (`fetch: true`) to download and CRC-check an omitted original

Create sequence (default):

1. `pack` (AI OKF off)
2. Host LLM + `okf_enrich`
3. Query loop

---

## Implementation status

| Piece | Status |
| --- | --- |
| Design (this doc) | Current (product contract) |
| `@zipwiki/cli/access` | Specified (Phase 2 runtime) |
| MCP `search` / `query` | Specified (hits include `readHints`) |
| MCP `open` catalog | Specified (`catalog` rows on open) |
| `zipaccess` CLI | Specified (`open` / `search` / `read` / `extract` / `origin`) |
| MCP `okf_enrich` | Specified (Phase 2 runtime) |
| MCP `origin` | Specified (`fetch` CRC-checks Extra Field 0x014F) |
| `zipwiki read` / `read-manifest` / `origin` | Specified (test dumps) |
| Hosted HTTP `/mcp` | Deferred (not v1 local surface) |

---

## Related

- Pack: zipwiki / [CLI.md](CLI.md)
- MCP hosts: [MCP.md](MCP.md)
- Wire format: [NEOZIP_APPNOTE.md](format/NEOZIP_APPNOTE.md)
- ZipWiki ZIP extensions: [ZIPWIKI_APPNOTE.md](ZIPWIKI_APPNOTE.md)
