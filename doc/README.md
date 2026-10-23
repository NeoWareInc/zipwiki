# ZipWiki docs

**Public format specs (hybrid):** Application Notes and OKF live in
`public-specs/` (synced from this tree) for the public
[`NeoWareInc/format-specs`](https://github.com/NeoWareInc/format-specs) repo,
and are rendered on the site at `/docs`. Product docs below stay private with
this repository.

```bash
pnpm sync:public-specs
# Optional: PUBLIC_SPECS_DEST=../format-specs pnpm sync:public-specs
```

**Start here**

1. [ZIPWIKI_APPNOTE.md](ZIPWIKI_APPNOTE.md) — what a `.zipwiki` is (also `/docs/zipwiki-appnote`)
2. [ZIPACCESS.md](ZIPACCESS.md) — query (`open` / `search` / `read`)
3. [MCP.md](MCP.md) — agent tools
4. [CLI.md](CLI.md) — command reference
5. [BETA.md](BETA.md) — first beta checklist (CLI, MCP, website, portal, billing, admin)
6. [COMPLETE.md](COMPLETE.md) — public-repo gate
7. [HOSTED-API.md](HOSTED-API.md) — Fly health host (`api.zipwiki.ai`)
8. [DISTRIBUTION.md](DISTRIBUTION.md) — third-party notices before packaging

Phase 2: `pnpm zipwiki` (create and query) and `@zipwiki/mcp`.
Portal settings: [CONVEX.md](CONVEX.md) + `/dashboard/settings`.

Design notes: [FEATURES.md](FEATURES.md) (product story + future directions),
[QUERY.md](QUERY.md) (open / search / read),
[OKF_ZIPWIKI_VS_SPEC.md](OKF_ZIPWIKI_VS_SPEC.md) (producer profile),
[ENHANCEMENTS.md](ENHANCEMENTS.md) (proposed search upgrades).

User-facing name is **ZipWiki ZIP profile**. NeoZip Extra Field IDs live under
[format/](format/).
