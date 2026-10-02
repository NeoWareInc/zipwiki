# ZipWiki — agent notes

Portable knowledge lives in **`.zipwiki`** packages (ZIP + `META-INF/manifest.json`
+ `wiki/parsed/` + optional `wiki/okf/`).

| Surface | Role |
| --- | --- |
| **zipwiki** | Create (`pack`) and query (`open` / `search` / `read` / `origin`) |
| **stdio MCP** | Agents on this machine → zipaccess library |

## Open sequence (always)

1. Pack (or open an existing package)
2. Catalog — `open` (skills load automatically: built-in query + package `wiki/skills/`)
3. Prefer `search` / `query` when available; else `read_okf_index` + `read_okf`
4. Follow `sources` to `read_parsed` (or originals via `read_entry` — stream, verified)
5. Prefer OKF descriptions before dumping full parses
6. `origin` (`fetch: true`) to download Extra Field `0x014F` originals and verify CRC-32
7. `read` to stream entry bodies; `extract` only when a filesystem path is required

`--skills` on pack/update replaces the built-in **enrichment** skill; on open/search it replaces the built-in **query** skill. Package `wiki/skills/` is always additive.

Default package: `package` tool arg, or `wiki.zipwiki` in the MCP cwd.

Do not write `wiki/search.json`, `wiki/okf/log.md`, or `wiki/okf/topics/pdf.md` into a `.zipwiki`. `search` reads OKF markdown. Other topic pages stay. `log.md` is optional in the OKF language spec and ZipWiki does not emit it. If an older archive still has `search.json`, `log.md`, or `topics/pdf.md`, the next update deletes it.

Specs: [doc/ZIPWIKI_APPNOTE.md](doc/ZIPWIKI_APPNOTE.md), [doc/ZIPACCESS.md](doc/ZIPACCESS.md),
[doc/MCP.md](doc/MCP.md), [doc/CLI.md](doc/CLI.md).

This checkout includes Phase 2: `@zipwiki/zipwiki` (pack and query) and
`@zipwiki/mcp` (stdio). Local pack does not need login (`--no-ai-okf` +
LiteParse). Home is `~/.zipwiki`. Hosted auth is Phase 3. A Rust CLI is
Phase 4 — see [PHASES.md](PHASES.md).

## Deploy targets

The CLI dev login talks to Convex `dashing-cod-224` and Fly `zipwiki-api-dev`. `pnpm convex:deploy` updates production Convex (`festive-hare-381`) and does not change that dev site.

| Change | Command |
| --- | --- |
| Convex functions the dev CLI calls | `npx convex dev --once` (deployment in `.env.local`: `dev:dashing-cod-224`) |
| Convex functions for production | `pnpm convex:deploy` (`festive-hare-381`) |
| Dev API on Fly | `pnpm deploy:fly:dev` |
| Production API on Fly | `pnpm deploy:fly:prod` |

After a task that changes Convex HTTP, the Fly API, or the website the CLI opens, name the matching command. Do not treat `pnpm convex:deploy` as the dev push.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
