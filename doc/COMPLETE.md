# Release checklist

Product: **ZipWiki** · Domain: **zipwiki.ai** · File: **`.zipwiki`**

This is the public-repo gate, not a lab workplan.

## Phase 1 (current)

- [x] Sibling repo `zipwiki` (pnpm / Turborepo, `apps/web` only)
- [x] GitHub markdown in `/doc` rebranded (ZipWiki, `.zipwiki`, zipwiki.ai)
- [x] Marketing site: `/` `/product` `/how-it-works` `/pricing` `/roadmap` `/terms` `/privacy`
- [x] Waitlist / docs CTAs (no dashboard, login, or Convex)
- [ ] Vercel project + `zipwiki.ai` / `www.zipwiki.ai`
- [ ] Review live copy and IA, then start Phase 1b server

## Docs included

- [ZIPWIKI_APPNOTE.md](ZIPWIKI_APPNOTE.md) — packaging contract
- [ZIPACCESS.md](ZIPACCESS.md) — query surface
- [MCP.md](MCP.md) — stdio MCP
- [CLI.md](CLI.md) — pack / open / search / read / origin
- [OKF_SPEC.md](OKF_SPEC.md) + [OKF_ZIPWIKI_VS_SPEC.md](OKF_ZIPWIKI_VS_SPEC.md)
- [APPNOTE.TXT](APPNOTE.TXT) — PKWARE ZIP
- [format/NEOZIP_APPNOTE.md](format/NEOZIP_APPNOTE.md) — internal parent spec

## Later gates

**Phase 1b — server:** health endpoint on `api.zipwiki.ai`; new Fly/Convex/Stripe
projects (not zipcodex.ai credentials).

**Phase 2 — TypeScript engine:** `zipwiki pack` without login (LiteParse +
`--no-ai-okf`); `zipaccess open` then `search "deed"` on a sample
`knowledge/sample-docs.zipwiki`; stdio MCP open → search → read.

**Phase 3 — Rust:** one native environment packs a `.zipwiki` that TypeScript
zipaccess can open.
