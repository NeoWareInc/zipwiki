# ZipWiki agent notes

Same open sequence as [AGENTS.md](AGENTS.md):

**pack → catalog → search → read** (OKF before parsed; `origin` for Extra Field `0x014F`).

Portable knowledge lives in **`.zipwiki`** packages.

This repository’s Phase 1 surface is GitHub docs (`/doc`) and the marketing site
(`apps/web` → zipwiki.ai). Phase 1b is `apps/server` (`GET /health` on Fly).
Phase 2 is `@zipwiki/zipwiki` + `@zipwiki/mcp` (local pack, no login).
Hosted auth is Phase 3. Rust CLI is Phase 4, after TypeScript Beta.
