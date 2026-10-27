# ZipWiki agent notes

Same open sequence as [AGENTS.md](AGENTS.md):

**pack → open → (optional verify) → search → read** (OKF before parsed;
`origin` for Extra Field `0x014F`). Chain tools (`stamp` / `upgrade` / `mint`)
use the same human-approval table pattern as `pack`.

Do not add `wiki/search.json`, `wiki/okf/log.md`, or `wiki/okf/topics/pdf.md` to a package. See [AGENTS.md](AGENTS.md).

Portable knowledge lives in **`.zipwiki`** packages. ZIP wire I/O is
**NeoZipKit**; blockchain sidecars are **neozip-blockchain** — see
[doc/NEOZIPKIT_INTEGRATION.md](doc/NEOZIPKIT_INTEGRATION.md).

This repository’s Phase 1 surface is GitHub docs (`/doc`) and the marketing site
(`apps/web` → zipwiki.ai). Phase 1b is `apps/server` (`GET /health` on Fly).
Phase 2 is `@zipwiki/zipwiki` + `@zipwiki/mcp` (local pack, no login; NeoZipKit
integrated). Hosted auth is Phase 3. Rust CLI is Phase 4, after TypeScript Beta.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
