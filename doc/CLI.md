# CLI reference

ZipWiki ships one command. Phase 2/3 (Beta) is TypeScript — it runs wherever
Node runs. A Rust binary comes after Beta (Phase 4), and only on machines we
compile for.

| Command group | Job |
| --- | --- |
| **Create** | `zipwiki pack` / `update` — build a `.zipwiki` knowledge base |
| **Query** | `zipwiki open` / `search` / `read` / `extract` / `origin` |

Agent query of a finished package is **stdio MCP** ([MCP.md](MCP.md)), backed by
the zipaccess library ([ZIPACCESS.md](ZIPACCESS.md)). Query commands do not
require a ZipWiki account. Pack and OKF can.

Local pack must work **without** an account (LiteParse + `--no-ai-okf`).
Settings home is `~/.zipwiki` (`ZIPWIKI_HOME` relocates it).

## zipwiki pack

```bash
zipwiki pack ./docs -o knowledge/docs.zipwiki --no-ai-okf
zipwiki pack ./docs -r -o out.zipwiki --parser liteparse --no-ai-okf
```

| Flag | Effect |
| --- | --- |
| `-o, --output` | Output `.zipwiki` path |
| `-y, --yes` | Skip the proceed / change settings / abort prompt. The prompt is the default on a terminal; scripts with no TTY skip it already |
| `-r, --recursive` | Recurse directories |
| `--parser liteparse` | Local parse (default for Free) |
| `--no-ai-okf` | Skip hosted/AI OKF; enrich later via MCP `okf_enrich` |
| `--omit-original` | Store parse + Extra Field `0x014F` locator instead of the primary bytes |
| `--compression zstd\|deflate\|store` | ZIP method (default zstd) |
| `--sha256` | Extra Field `0x014E` on members |
| `--origin-url-template` | Fill `0x014F` URI from filename captures |

`zipwiki update` rewrites an archive (`--add` / `--update` / `--del`). Unchanged
members are copied compressed.

## zipwiki query

```bash
zipwiki open ./knowledge/docs.zipwiki
zipwiki search ./knowledge/docs.zipwiki "deed"
zipwiki read ./knowledge/docs.zipwiki --okf deed
zipwiki read ./knowledge/docs.zipwiki --parsed deed.pdf
zipwiki read -p ./knowledge/docs.zipwiki --path wiki/okf/deed.md
zipwiki origin ./knowledge/docs.zipwiki --parsed deed.pdf --fetch -o ./deed.pdf
```

| Command | Effect |
| --- | --- |
| `open` | Catalog + manifest summary |
| `search` | Ranked OKF hits (snippets). Parsed text only when OKF misses |
| `read` | Stream OKF, parsed, or entry bodies |
| `extract` | Verified write to disk |
| `origin` | Extra Field `0x014F`; `--fetch` downloads and checks CRC-32 |

Default package when omitted: `wiki.zipwiki` in the current directory.

## Open sequence

1. `pack` (or take an existing `.zipwiki`)
2. `open` / catalog
3. `search`
4. `read` OKF, then parsed only if needed
5. `origin` with `--fetch` for omitted originals
