# Phases

Living plan for this product repo. `zip-codex` remains the lab.

## Locked names

- **ZipWiki** — product
- **zipwiki** — the command: create (`pack`) and query (`open` / `search` / `read`)
- **zipaccess** — query library used by `zipwiki` and MCP
- **`.zipwiki`** — the file (legacy `.nzip` still readable, not advertised)
- **zipwiki.ai** — public site; later `api.zipwiki.ai` / `docs.zipwiki.ai`

## Phase 1 — Repo, docs, marketing (this checkout)

**Done when:** this repo exists, `/doc` is ZipWiki-named, and `apps/web` can
deploy to zipwiki.ai with no dashboard, Convex, or pack engine.

**Site IA (locked for this pass):** `/` `/product` `/how-it-works` `/pricing`
`/roadmap` `/terms` `/privacy`. CTAs: waitlist (`hello@zipwiki.ai`) and docs on
GitHub. `/roadmap` states TypeScript as the Beta runtime (runs everywhere);
Rust is after that Beta, and only on machines we compile for.

**Copy lock:** review the live site, then start Phase 1b. Do not move the engine
until that review.

## Phase 1b — Server under zipwiki.ai

**Health live.** `apps/server` is a Fastify host (lab patterns, no parse/OKF/MCP).
New Fly apps in the NeoWare org — not `zipcodex-api-*`:

| Env | App | Live now |
| --- | --- | --- |
| Dev | `zipwiki-api-dev` | https://zipwiki-api-dev.fly.dev/health |
| Prod | `zipwiki-api-prod` | https://zipwiki-api-prod.fly.dev/health |

Certs for `api-dev.zipwiki.ai` / `api.zipwiki.ai` are created and wait on
Squarespace A/AAAA records (see [`deploy/fly/README.md`](deploy/fly/README.md)).
Convex/Stripe stay later, on new projects. Dashboard/auth optional until the
engine lands.

## Phase 2 — TypeScript product loop

**Done.** Engine lives in this repo (`@zipwiki/zipwiki`, `@zipwiki/mcp`,
`@zipwiki/api-client`). Local pack does not require login.

- Create: `zipwiki pack` / `update`, LiteParse, origin Extra Field `0x014F`
- Query: `zipwiki open` / `search` / `read` / `extract` / `origin`
- MCP: stdio tools (`zipwiki-mcp`)
- Sample: `pnpm sample-zipwiki` then `pnpm smoke:zipwiki` (`search deed`)

Package names `@zipwiki/*`; home `~/.zipwiki`. Hosted auth is stubbed through
for Phase 3 (`zipwiki auth login`).

## Phase 3 — TypeScript Beta (full product)

The first public Beta is **TypeScript only**. Node, agents, Vercel, Fly, and
the browser all run the same engine — no per-OS binary.

- Plugin (skills + stdio MCP + CLI) in Cursor / Claude
- Hosted API on `api.zipwiki.ai` (new Convex / Stripe projects)
- Portal in `apps/web`: `/dashboard/settings` (pack/parse/OKF config), keys, billing, knowledge
- Hosted LlamaParse / ZipWiki OKF for paid plans; local LiteParse stays free

**Done when:** a waitlist user can install the plugin, pack locally without
login, query via MCP, and (on a paid plan) use hosted parse/OKF.

## Phase 4 — Rust runtime (after TypeScript Beta)

A native `zipwiki` binary for machines we compile for (macOS
arm64 first; later Zip64 / large archives). TypeScript remains the everywhere
runtime: MCP, Node, Vercel/web, JS agent hosts, and any OS without a binary.

**Done when:** one compiled environment packs and catalogs a `.zipwiki` that
the TypeScript zipaccess library can open.

## Open questions

- GitHub repo visibility; Vercel project; DNS for zipwiki.ai
- Redirects from zipcodex.ai / zip-codex.vercel.app
- First Rust target OS after TypeScript Beta (default: macOS arm64)
