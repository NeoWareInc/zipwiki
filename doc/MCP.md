# ZipWiki MCP

Agent access to portable `.zipwiki` knowledge packages via the [Model Context Protocol](https://modelcontextprotocol.io).

**v1 focus:** **stdio** MCP (`zipwiki-mcp`) over the **local filesystem** (or OS-mounted cloud drives). Read/search is the **zipaccess library** ([ZIPACCESS.md](ZIPACCESS.md)) in-process; create is **zipwiki**. Hosted HTTP `/mcp` exists but is **not** the v1 product surface for create/query.

## Transports

| Host | Transport | How to connect |
| --- | --- | --- |
| **Claude Code** (project workspace) | **stdio** | Project `.mcp.json` (Phase 2) → `zipwiki-mcp` |
| **Claude Desktop** | **stdio** | `claude_desktop_config.json` → `zipwiki-mcp` |
| Remote agents (no local FS) | HTTP `/mcp` | Deferred for local-first v1; see hosted notes below |

Default package: tool arg `package`, or `wiki.zipwiki` in the MCP server working directory.

## Tools

| Tool | Purpose | Owned by |
| --- | --- | --- |
| `open` | Catalog (same fields as `zipaccess open --json`) + manifest summary + open sequence | zipaccess lib |
| `list` | Entry inventory (`prefix` / `limit`) | zipaccess lib |
| `search` | Ranked OKF search (snippets + `readHints`). Parsed text only when OKF misses | zipaccess lib |
| `query` | Search plus capped top-K OKF/parsed bodies | zipaccess lib |
| `read_okf_index` | OKF index or concept list | zipaccess lib |
| `read_okf` | One OKF concept | zipaccess lib |
| `read_parsed` | Parsed markdown (size-capped) | zipaccess lib |
| `read_entry` | Stream any entry (verified; JSON UTF-8 or base64) | zipaccess lib |
| `read` | One or more entry bodies as raw text (multi-file markers) | zipaccess lib |
| `read_manifest` | Always `META-INF/manifest.json` as raw JSON | zipaccess lib |
| `extract` | Verified extract to disk (`fetchOrigin` also downloads 0x014F originals) | zipaccess lib |
| `origin` | Extra Field `0x014F` URI/CRC; `fetch` downloads and verifies CRC-32 | zipaccess lib |
| `pack` | Pack sources → `.zipwiki` (default **no AI OKF**) | zipwiki |
| `update` | Add / update / delete primaries (one rewrite; copies unchanged compressed members) | zipwiki |
| `okf_enrich` | Apply host-LLM OKF enrichment into `.zipwiki` | zipaccess lib |

### Create workflow (default)

1. `pack` — Free = local LiteParse (LibreOffice for Office docs); paid may use hosted LlamaParse until quota, then soft-falls back to LiteParse. **Skips** hosted AI OKF by default.
2. `read_parsed` (capped) as needed.
3. Host agent LLM fills title / description / type / tags / keyFacts.
4. `okf_enrich` writes `wiki/okf/` (no hosted OKF quota).

Optional: request hosted/BYO OKF on `pack` when the plan still has hosted OKF remaining; otherwise soft-skip and use `okf_enrich`.

### Query workflow

1. `open` — catalog rows (title/type, parsed?, original?, `readHints`)
2. `search` (preferred) or `query` or `read_okf_index`
3. `read_okf` → `read_parsed` / `read` / `read_entry` (stream through MCP; verified inflate)
4. `origin` with `fetch: true` to download an omitted original and check CRC-32
5. `extract` only when a filesystem path is required (`fetchOrigin` to pull originals next to the parse)

`maxBytes` (default 160_000) caps **bytes returned** from a single read — not archive size or tokens. Binary entries return `encoding: "base64"`.

## Claude Code (stdio)

```bash
pnpm --filter @zipwiki/cli build
pnpm --filter @zipwiki/mcp build
# or: pnpm exec zipwiki-mcp  (Phase 2)
```

Example project config: `.mcp.json` (Phase 2). Pass `package` on each tool, or place `wiki.zipwiki` in the server cwd.

See [CLAUDE.md](../CLAUDE.md) / [AGENTS.md](../AGENTS.md) for the agent open sequence.

## Hosted HTTP (deferred / optional)

Use only when the agent cannot read a local `.zipwiki`. Not required for the local create+query loop.

## Local stdio smoke test

```bash
pnpm --filter @zipwiki/cli build
pnpm --filter @zipwiki/mcp build
# Place or symlink wiki.zipwiki in cwd, or pass package=… on each tool
pnpm --filter @zipwiki/mcp start
```

## Implementation

- Library: `@zipwiki/cli/access` (Phase 2)
- Test dumps: `zipwiki read` / `zipwiki read-manifest`
- Stdio bin: `zipwiki-mcp` (`apps/mcp`, Phase 2)
- Design: [`doc/ZIPACCESS.md`](ZIPACCESS.md)
