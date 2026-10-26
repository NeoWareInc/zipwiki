# ZipWiki v0.2.0 beta (2026-10-24)

Initial public beta cut of the TypeScript CLI + stdio MCP.

## Scope

- Install: `zipwiki` and `zipwiki-mcp` via platform tarball (`npm i -g`), Node.js 22.23.4+ (or 24.22.1+ / 26.12.1+; CVE-2026-111497).
- Platforms: `darwin-arm64`, `darwin-x64`, `linux-x64` (glibc), `linux-arm64` (glibc), `win32-x64`.
- Not in this cut: Alpine/musl, Windows ARM, Rust CLI, public npm registry package.

## Rehearsal (do first)

1. Version + date in packages / banner: `0.2.0` / `2026-10-24`.
2. `pnpm build:dist:dev` → `apps/web/public/dev-releases/` + `latest.json` → `https://dev.zipwiki.ai/install`.
3. Push `dev` → Vercel updates `https://dev.zipwiki.ai` only.
4. Smoke on a second machine:
   - `npm i -g https://dev.zipwiki.ai/dev-releases/zipwiki-0.2.0-<platform>-<arch>.tgz`
   - `zipwiki --version` shows `0.2.0 beta (2026-10-24)`
   - `zipwiki --help`, `zipwiki login` against **dev** API if testing auth.

## Promote to production (after approval)

Do **not** run these until the user approves the dev rehearsal:

1. `pnpm build:dist` → `apps/web/public/releases/` (production tarballs).
2. Merge / promote `dev` → `main` (website `https://zipwiki.ai`).
3. Tag `v0.2.0` on the commit that built the production tarballs (or the approved rehearsal commit if identical).
4. Optional same day: `pnpm deploy:fly:prod` and `pnpm convex:deploy` only if API/Convex changes need to ship with the cut.
5. Publish a GitHub Release for `v0.2.0` with install links from `https://zipwiki.ai/install`.

## Contacts

| Audience | Address |
| --- | --- |
| Contact form / support fallback | `support@zipwiki.ai` |
| Use cases / partnerships | `team@zipwiki.ai` |

## Rollback (dev)

Restore `apps/web/public/dev-releases` from tag `v0.1.0` (commit `40618b1`) and redeploy `dev`. Production `/releases/` stays untouched until the promote step.
