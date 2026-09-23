# ZipWiki

Portable knowledge for AI agents. Pack documents into a `.zipwiki` (standard ZIP
plus a wiki tree), then catalog, search, and read them locally.

**Product:** ZipWiki · **Site:** [zipwiki.ai](https://zipwiki.ai) · **File:** `.zipwiki`

| Tool | Job |
| --- | --- |
| **zipwiki** | Create (`pack`) and query (`open` / `search` / `read` / `origin`) |
| **stdio MCP** | Agents on this machine → zipaccess library |

Public documentation lives in [`/doc`](doc/). Marketing site: [`apps/web`](apps/web).
API: [`apps/server`](apps/server) → `api.zipwiki.ai`.

## Status

Phase 2 is the **TypeScript pack / query / stdio MCP** loop (no login for
local LiteParse). Phase 1b is the Fly health host. A Rust CLI is after the
TypeScript Beta — see [PHASES.md](PHASES.md).

Until then, the lab checkout is `zip-codex`. This repo is what we ship as ZipWiki.

## Open sequence

1. **Pack** — `zipwiki pack` (LiteParse locally; AI OKF optional)
2. **Catalog** — `zipwiki open`
3. **Search** — OKF first, parsed text as backup
4. **Read** — OKF skim, then `wiki/parsed/…` only if you need evidence
5. **Origin** — Extra Field `0x014F` (`fetch: true` downloads and checks CRC-32)

## Workspace

```bash
pnpm install
pnpm --filter @zipwiki/web dev
pnpm --filter @zipwiki/server dev   # http://localhost:3001
pnpm zipwiki -- pack knowledge/test2 -o knowledge/sample-docs.zipwiki --no-ai-okf --parser liteparse
pnpm zipwiki -- open knowledge/sample-docs.zipwiki
pnpm zipwiki -- search knowledge/sample-docs.zipwiki deed
```

Production-like build:

```bash
pnpm --filter @zipwiki/web build
pnpm --filter @zipwiki/server build
pnpm build:zipwiki
pnpm --filter @zipwiki/mcp build
```

## Names

- **ZipWiki** — product
- **zipwiki** — the command (create and query)
- **zipaccess** — query library behind `open` / `search` / `read`
- **`.zipwiki`** — the file (legacy `.nzip` still readable, not advertised)
- **zipwiki.ai** — public site (later `api.zipwiki.ai` / `docs.zipwiki.ai`)

The on-wire parent profile (Extra Field IDs, integrity) is NeoZip, kept as an
internal spec in [`doc/format/`](doc/format/). User-facing docs say **ZipWiki ZIP profile**.
