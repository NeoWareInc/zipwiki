# Convex (ZipWiki SaaS backend)

Convex holds users, accounts, API keys, prepaid credits, usage, device auth, and
**account settings** (the portal at `/dashboard/settings`).

This is a **new** Convex project — do not reuse zipcodex.ai deployments.

## Secret lanes

| Lane | Where | Used by |
| --- | --- | --- |
| **A — SaaS / auth** | Convex env | Dashboard login, billing, settings |
| **B — Hosted compute** | Fly secrets | Hosted parse / OKF (Phase 3) |
| **C — User / CLI** | `~/.zipwiki/.env` | Local pack / BYO keys |

Settings store **preferences**, never provider secrets.

```bash
npx convex dev
npx @convex-dev/auth
```

Web env (repo-root `.env.local`):

| Variable | Purpose |
| --- | --- |
| `VITE_CONVEX_URL` | `https://….convex.cloud` (same as `CONVEX_URL`) |
| `VITE_API_URL` | Fly API (`https://zipwiki-api-dev.fly.dev`) |

Restart `pnpm dev:web` after changing env. Do not put `AUTH_*` in `VITE_*`.
