# Phases

Living plan for this product repo. `zip-codex` remains the lab.

## Locked names

- **ZipWiki** — product
- **zipwiki** — create CLI (`pack`)
- **zipaccess** — query CLI (`open` / `search` / `read`)
- **`.zipwiki`** — the file (legacy `.nzip` still readable, not advertised)
- **zipwiki.ai** — public site; later `api.zipwiki.ai` / `docs.zipwiki.ai`

## Phase 1 — Repo, docs, marketing (this checkout)

**Done when:** this repo exists, `/doc` is ZipWiki-named, and `apps/web` can
deploy to zipwiki.ai with no dashboard, Convex, or pack engine.

**Site IA (locked for this pass):** `/` `/product` `/how-it-works` `/pricing`
`/roadmap` `/terms` `/privacy`. CTAs: waitlist (`hello@zipwiki.ai`) and docs on
GitHub. Dual runtime is stated on `/roadmap` (TypeScript next, Rust later).

**Copy lock:** review the live site, then start Phase 1b. Do not move the engine
until that review.

## Phase 1b — Server under zipwiki.ai

Not started. Intent: `apps/server` + `api.zipwiki.ai` (dev/prod). Reuse patterns
from the lab server, but **new** Fly/Convex/Stripe projects.

**Done when:** health endpoint + domain certs. Dashboard/auth optional until the
engine lands.

## Phase 2 — TypeScript product loop

Move only pack / zipaccess / stdio MCP and the packages they import.

- Create: pack/update, LiteParse, origin Extra Field `0x014F`, catalog
- Query: `open` / `search` / `read` / `extract` / `origin`
- MCP: stdio tools
- Sample: `knowledge/sample-docs.zipwiki` smoke (`open` then search `"deed"`)

Local pack must work without account login (LiteParse + `--no-ai-okf`).
Package names `@zipwiki/*`; home `~/.zipwiki`.

## Phase 3 — Rust runtime (select environments)

TypeScript stays for MCP in Node, Vercel/web, and JS agent hosts.

Rust for native `zipwiki` / `zipaccess` (and later Zip64 / large archives).

**Done when:** one environment (e.g. macOS arm64 CLI) packs and catalogs a
`.zipwiki` that TypeScript zipaccess can open.

## Phase 4 — Hosted product (optional)

Dashboard inspect, device login, Stripe, LlamaParse metering — after the local
loop is pleasant on zipwiki.ai.

## Open questions

- GitHub repo visibility; Vercel project; DNS for zipwiki.ai
- Redirects from zipcodex.ai / zip-codex.vercel.app
- First Rust target OS after Phase 2 (default: macOS arm64)
