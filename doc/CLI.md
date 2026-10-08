# CLI reference

ZipWiki ships one command. Phase 2/3 (Beta) is TypeScript — it runs wherever
Node runs. A Rust binary comes after Beta (Phase 4), and only on machines we
compile for.

| Command group | Job |
| --- | --- |
| **Create** | `zipwiki pack` / `update` — build a `.zipwiki` knowledge base |
| **Query** | `zipwiki open` / `search` / `read` / `extract` / `origin` — see **[QUERY.md](QUERY.md)** |

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
| `--okf-profile auto\|book\|legislation\|invoice` | One enrichment profile for the pack (default `auto`; `.epub` is `book`). Stored on each manifest primary |
| `--omit-original` | Store parse + Extra Field `0x014F` locator instead of the original document bytes |
| `--compression zstd\|deflate\|store` | ZIP method (default zstd) |
| `--sha256` | Extra Field `0x014E` on members |
| `--origin-url-template` | Fill the origin URI from filename captures |
| `--origin-record manifest\|cd\|both` | Where URI, size, and date are stored. Default `manifest` (compressed in `META-INF/manifest.json`). `cd` keeps them on Extra Field `0x014F`. `both` writes both. CRC-32 stays on `0x014F` when the original is omitted or a URI is recorded |

`zipwiki update` rewrites an archive (`--add` / `--update` / `--del`). Unchanged
members are copied compressed. `--okf-profile` on an add or update stores the
same profile; omit it to keep the profile already on that primary.

## zipwiki query

Full flag reference and evaluation shortcuts: **[QUERY.md](QUERY.md)**.

```bash
zipwiki open ./knowledge/docs.zipwiki
zipwiki search ./knowledge/docs.zipwiki "deed"
zipwiki ask ./knowledge/docs.zipwiki "Who signed the deed?"
zipwiki ask ./knowledge/florida-laws-2025.zipwiki
zipwiki read ./knowledge/docs.zipwiki --okf deed
zipwiki read ./knowledge/docs.zipwiki --parsed deed.pdf
zipwiki read -p ./knowledge/docs.zipwiki --path wiki/okf/deed.md
zipwiki origin ./knowledge/docs.zipwiki --parsed deed.pdf --fetch -o ./deed.pdf
```

| Command | Effect |
| --- | --- |
| `open` | Catalog + manifest summary |
| `search` | Ranked OKF hits (snippets). Parsed text only when OKF misses |
| `query` | Local search plus cited passages and gaps. No hosted credits |
| `ask` | Website Query: local evidence, then a hosted answer. Prompts when the question is omitted. `pnpm query:florida-laws`, `pnpm query:charles-dickens`, and `pnpm query:medical-pdfs` call this |
| `read` | Stream OKF, parsed, or entry bodies |
| `extract` | Verified write to disk |
| `origin` | Extra Field `0x014F`; `--link` prints the URI; `--fetch` downloads and checks CRC-32 |

Default package when omitted: `wiki.zipwiki` in the current directory.

## Open sequence

1. `pack` (or take an existing `.zipwiki`)
2. `open` / catalog
3. `search`
4. `read` OKF, then parsed only if needed
5. `origin` with `--fetch` for omitted originals
