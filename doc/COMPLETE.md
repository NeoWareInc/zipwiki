# Release checklist

Product: **ZipWiki** · Domain: **zipwiki.ai** · File: **`.zipwiki`**

This is the public-repo gate, not a lab workplan.

## Phase 1 + 1b

- [x] Sibling repo `zipwiki` (pnpm / Turborepo, `apps/web` only)
- [x] GitHub markdown in `/doc` rebranded (ZipWiki, `.zipwiki`, zipwiki.ai)
- [x] Marketing site: `/` `/product` `/how-it-works` `/pricing` `/roadmap` `/terms` `/privacy`
- [x] Waitlist / docs CTAs (no dashboard, login, or Convex)
- [ ] Vercel project + `zipwiki.ai` / `www.zipwiki.ai`
- [x] Phase 1b server: `GET /health` in `apps/server` (Fly apps `zipwiki-api-*`)
- [ ] Custom domain certs (`api-dev.zipwiki.ai` / `api.zipwiki.ai`) after Squarespace CNAMEs

## Phase 2

- [x] `@zipwiki/zipwiki` pack and query (LiteParse + `--no-ai-okf`, no login)
- [x] `@zipwiki/mcp` stdio (`open` / `search` / `read`)
- [x] Smoke: `pack knowledge/test2` → `zipwiki open` → `search deed`
- [x] Portal routes in `apps/web` (`/dashboard/settings` + Convex functions)

Need `npx convex dev` (new ZipWiki project) before settings persist.

## Docs included

- [ZIPWIKI_APPNOTE.md](ZIPWIKI_APPNOTE.md) — packaging contract
- [ZIPACCESS.md](ZIPACCESS.md) — query surface
- [MCP.md](MCP.md) — stdio MCP
- [CLI.md](CLI.md) — pack / open / search / read / origin
- [OKF_SPEC.md](OKF_SPEC.md) + [OKF_ZIPWIKI_VS_SPEC.md](OKF_ZIPWIKI_VS_SPEC.md)
- [APPNOTE.TXT](APPNOTE.TXT) — PKWARE ZIP
- [format/NEOZIP_APPNOTE.md](format/NEOZIP_APPNOTE.md) — internal parent spec
- [CONVEX.md](CONVEX.md) — portal settings / accounts (new project)

## Packaging

- [ ] Ship LiteParse notices with the distributed app — [DISTRIBUTION.md](DISTRIBUTION.md)
- [ ] CLI update reminder against `latest.json` — [DISTRIBUTION.md](DISTRIBUTION.md)

## Later gates

**Phase 1b — server:** `GET /health` on Fly (`zipwiki-api-dev` /
`zipwiki-api-prod`). Certs wait on Squarespace CNAMEs for `api*.zipwiki.ai`.
New Convex/Stripe projects later — not zipcodex.ai credentials.

**Phase 2 — TypeScript engine (done):** `pnpm zipwiki -- pack knowledge/test2
-o knowledge/sample-docs.zipwiki --no-ai-okf --parser liteparse`; then
`pnpm smoke:zipwiki`. MCP handlers `open` / `search` / `read_okf` /
`read_parsed`.

**Phase 3 — TypeScript Beta:** plugin + hosted API + dashboard on zipwiki.ai.
TypeScript only — runs wherever Node / agents / Vercel run.

**Phase 4 — Rust (after Beta):** one compiled environment packs a `.zipwiki`
that the TypeScript zipaccess library can open. Rust is per-machine; TypeScript stays the
everywhere runtime.
