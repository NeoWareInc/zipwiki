# ZipWiki — agent notes

Portable knowledge lives in **`.zipwiki`** packages (ZIP + `META-INF/manifest.json`
+ `wiki/parsed/` + optional `wiki/okf/`).

| Surface | Role |
| --- | --- |
| **zipwiki** | Create / re-pack `.zipwiki` (`pack`) |
| **zipaccess** | Query (`open` / `search` / `read` / `origin`) |
| **stdio MCP** | Agents on this machine → zipaccess + zipwiki |

## Open sequence (always)

1. Pack (or open an existing package)
2. Catalog — `open`
3. Prefer `search` / `query` when available; else `read_okf_index` + `read_okf`
4. Follow `sources` to `read_parsed` (or originals via `read_entry` — stream, verified)
5. Prefer OKF descriptions before dumping full parses
6. `origin` (`fetch: true`) to download Extra Field `0x014F` originals and verify CRC-32
7. `read` to stream entry bodies; `extract` only when a filesystem path is required

Default package: `package` tool arg, or `wiki.zipwiki` in the MCP cwd.

Specs: [doc/ZIPWIKI_APPNOTE.md](doc/ZIPWIKI_APPNOTE.md), [doc/ZIPACCESS.md](doc/ZIPACCESS.md),
[doc/MCP.md](doc/MCP.md), [doc/CLI.md](doc/CLI.md).

This checkout is Phase 1 (docs + marketing) plus Phase 1b (`apps/server`
health host on Fly). The TypeScript engine and MCP land in Phases 2–3 (Beta).
A Rust CLI is Phase 4, after that Beta — see [PHASES.md](PHASES.md).
